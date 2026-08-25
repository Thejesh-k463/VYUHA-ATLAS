import { describe, expect, it } from "vitest";
import {
  budgetStatus,
  detectRecurring,
  findTransferPairs,
  merchantKey,
  summarizeMonth,
  TRANSFER_CATEGORY,
  type ExpenseTx,
} from "@/lib/analytics/expenses";

let nextId = 1;
function tx(over: Partial<ExpenseTx>): ExpenseTx {
  return {
    id: nextId++,
    accountId: 1,
    date: "2026-04-10",
    description: "POS SOMETHING",
    amount: -100,
    category: null,
    upiRef: null,
    ...over,
  };
}

describe("findTransferPairs", () => {
  it("pairs the same UPI RRN with opposite signs across DIFFERENT accounts", () => {
    const a = tx({ accountId: 1, amount: -5000, upiRef: "509900000001", description: "UPI self" });
    const b = tx({ accountId: 2, amount: 5000, upiRef: "509900000001", description: "UPI self in" });
    const c = tx({ accountId: 1, amount: -5000, upiRef: "509900000002" }); // unpaired
    const set = findTransferPairs([a, b, c]);
    expect(set.has(a.id)).toBe(true);
    expect(set.has(b.id)).toBe(true);
    expect(set.has(c.id)).toBe(false);
  });
  it("same account or mismatched amounts never pair", () => {
    const a = tx({ accountId: 1, amount: -5000, upiRef: "509900000003" });
    const b = tx({ accountId: 1, amount: 5000, upiRef: "509900000003" });
    const c = tx({ accountId: 2, amount: 4999, upiRef: "509900000003" });
    expect(findTransferPairs([a, b, c]).size).toBe(0);
  });
});

describe("summarizeMonth", () => {
  it("splits spend/income, excludes transfers, rolls uncategorized honestly", () => {
    const transferOut = tx({ accountId: 1, amount: -20000, upiRef: "509900000009", description: "UPI to self" });
    const transferIn = tx({ accountId: 2, amount: 20000, upiRef: "509900000009", description: "UPI from self" });
    const s = summarizeMonth(
      [
        tx({ amount: -459, category: "food" }),
        tx({ amount: -1200, category: "food" }),
        tx({ amount: -999 }), // uncategorized
        tx({ amount: 85000, category: "income" }),
        transferOut,
        transferIn,
        tx({ date: "2026-05-01", amount: -5000 }), // other month
      ],
      "2026-04",
    );
    expect(s.spent).toBeCloseTo(459 + 1200 + 999, 2);
    expect(s.income).toBeCloseTo(85000, 2);
    expect(s.net).toBeCloseTo(85000 - 2658, 2);
    expect(s.transferVolume).toBeCloseTo(40000, 2);
    expect(s.txCount).toBe(6);
    expect(s.byCategory[0]).toMatchObject({ category: "food", spent: 1659, count: 2 });
    expect(s.byCategory.find((c) => c.category === "uncategorized")?.spent).toBeCloseTo(999, 2);
  });
  it("a manual 'transfer' category also excludes from spending", () => {
    const s = summarizeMonth([tx({ amount: -7000, category: TRANSFER_CATEGORY })], "2026-04");
    expect(s.spent).toBe(0);
    expect(s.transferVolume).toBeCloseTo(7000, 2);
  });
});

describe("budgetStatus", () => {
  it("computes usage and over-budget flags", () => {
    const s = summarizeMonth(
      [tx({ amount: -4500, category: "food" }), tx({ amount: -900, category: "fuel" })],
      "2026-04",
    );
    const rows = budgetStatus(s, [
      { category: "food", monthlyLimit: 4000 },
      { category: "fuel", monthlyLimit: 2000 },
      { category: "rent", monthlyLimit: 15000 },
    ]);
    expect(rows[0]).toMatchObject({ category: "food", over: true });
    expect(rows[0].usagePct).toBeCloseTo(112.5, 1);
    expect(rows.find((r) => r.category === "rent")).toMatchObject({ spent: 0, over: false });
  });
});

describe("merchantKey", () => {
  it("is invariant to reference numbers so repeat payments group together", () => {
    const a = merchantKey("UPI-NETFLIX ENTERTAINMENT-netflix@hdfc-UPI/DR/509912345678/sub");
    const b = merchantKey("UPI-NETFLIX ENTERTAINMENT-netflix@hdfc-UPI/DR/611200099887/sub");
    expect(a).toBe(b);
    expect(a).toContain("NETFLIX");
    expect(merchantKey("POS 416021XXXXXX BIG BAZAAR")).toBe(merchantKey("POS 517999XXXXXX BIG BAZAAR"));
  });
});

describe("detectRecurring", () => {
  const sip = (date: string, amount: number) =>
    tx({ date, amount, description: "ACH D- INDIAN CLEARING CORP-SIP MUTUAL FUND" });
  it("finds a monthly SIP (≥3 hits, ~30-day cadence, stable amount)", () => {
    const items = detectRecurring([
      sip("2026-01-10", -2000),
      sip("2026-02-10", -2000),
      sip("2026-03-10", -2000),
      sip("2026-04-11", -2000),
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ count: 4, medianAmount: 2000 });
    expect(items[0].nextExpected > "2026-04-11").toBe(true);
  });
  it("ignores irregular gaps and unstable amounts", () => {
    expect(
      detectRecurring([sip("2026-01-10", -2000), sip("2026-01-25", -2000), sip("2026-04-11", -2000)]),
    ).toHaveLength(0);
    expect(
      detectRecurring([sip("2026-01-10", -2000), sip("2026-02-10", -9000), sip("2026-03-10", -2000)]),
    ).toHaveLength(0);
  });
  it("needs at least three occurrences", () => {
    expect(detectRecurring([sip("2026-01-10", -2000), sip("2026-02-10", -2000)])).toHaveLength(0);
  });
});
