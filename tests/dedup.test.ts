// Phase 3 gate: dedup asserted on fixture repeats — both at the hash level and
// against a real migrated temp DB (the unique index is the enforcement).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { openAtlasDb } from "@/lib/db/core";
import { accounts, bankTransactions, importBatches } from "@/lib/db/schema";
import { computeRowHashes, extractUpiRef, normalizeDescription } from "@/lib/domain/dedup";

const ROWS = [
  { accountId: 1, date: "2026-04-01", amount: -459, description: "UPI-ZOMATO LTD-UPI/DR/509912345678/Food" },
  { accountId: 1, date: "2026-04-01", amount: -459, description: "UPI-ZOMATO LTD-UPI/DR/509912345678/Food" }, // legit twin
  { accountId: 1, date: "2026-04-03", amount: 85000, description: "NEFT CR-SALARY APR" },
];

describe("computeRowHashes", () => {
  it("re-computing over the same fixture reproduces the exact same hashes", () => {
    expect(computeRowHashes(ROWS)).toEqual(computeRowHashes(ROWS));
  });
  it("identical same-day twins get distinct hashes (occurrence counter)", () => {
    const h = computeRowHashes(ROWS);
    expect(h[0]).not.toBe(h[1]);
    expect(new Set(h).size).toBe(3);
  });
  it("hash respects account, date, amount and normalized description", () => {
    const [base] = computeRowHashes([ROWS[2]]);
    expect(computeRowHashes([{ ...ROWS[2], description: "  neft cr-salary   apr " }])[0]).toBe(base);
    expect(computeRowHashes([{ ...ROWS[2], accountId: 2 }])[0]).not.toBe(base);
    expect(computeRowHashes([{ ...ROWS[2], amount: 85000.01 }])[0]).not.toBe(base);
    expect(computeRowHashes([{ ...ROWS[2], date: "2026-04-04" }])[0]).not.toBe(base);
  });
});

describe("extractUpiRef", () => {
  it("pulls the 12-digit RRN from UPI narrations only", () => {
    expect(extractUpiRef("UPI-ZOMATO-UPI/DR/509912345678/Food")).toBe("509912345678");
    expect(extractUpiRef("NEFT CR 509912345678")).toBeNull(); // not UPI
    expect(extractUpiRef("UPI short ref 12345")).toBeNull();
  });
  it("normalizeDescription collapses whitespace and case", () => {
    expect(normalizeDescription("  Some   Shop  ")).toBe("SOME SHOP");
  });
});

describe("dedup against a real migrated DB (fixture repeats skip)", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-dedup-"));
  afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it("second import of the same statement inserts zero new rows", () => {
    const { sqlite, db } = openAtlasDb(
      path.join(tmp, "t.sqlite"),
      "a".repeat(64),
      path.join(__dirname, "..", "drizzle"),
    );
    try {
      const acc = db
        .insert(accounts)
        .values({ name: "Test bank", kind: "bank", category: "asset" })
        .returning({ id: accounts.id })
        .all();
      const importOnce = () => {
        const batch = db
          .insert(importBatches)
          .values({ source: "bank_csv", fileName: "s.csv" })
          .returning({ id: importBatches.id })
          .all();
        const rows = ROWS.map((r) => ({ ...r, accountId: acc[0].id }));
        const hashes = computeRowHashes(rows);
        let inserted = 0;
        for (let i = 0; i < rows.length; i++) {
          const res = db
            .insert(bankTransactions)
            .values({ ...rows[i], hash: hashes[i], importBatchId: batch[0].id })
            .onConflictDoNothing({ target: bankTransactions.hash })
            .run();
          inserted += res.changes;
        }
        return inserted;
      };
      expect(importOnce()).toBe(3); // twins both land — distinct occurrence hashes
      expect(importOnce()).toBe(0); // exact re-import: everything skips
      const count = db.select().from(bankTransactions).all().length;
      expect(count).toBe(3);
    } finally {
      sqlite.close();
    }
  });
});
