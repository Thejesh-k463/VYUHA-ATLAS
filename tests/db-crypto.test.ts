// Phase 0.5 gate: encryption + verified backup round-trip, against real temp
// files — the behaviour under test IS the I/O (VYUHA testing rule).
import Database from "better-sqlite3-multiple-ciphers";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { fileLooksEncrypted, openAtlasDb } from "@/lib/db/core";
import { resolveDbKey } from "@/lib/db/keyfile";
import { listBackups, rotateBackups, runBackup, verifyBackup, BACKUP_PREFIX } from "@/lib/backup/engine";
import { accounts } from "@/lib/db/schema";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-crypto-"));
const migrations = path.join(__dirname, "..", "drizzle");
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

const KEY_OPTS = { forceProvider: "machine" as const }; // never shell out to DPAPI in tests

describe("key file", () => {
  it("creates once and resolves the same key thereafter", () => {
    const dir = path.join(tmp, "keys");
    const a = resolveDbKey(dir, KEY_OPTS);
    const b = resolveDbKey(dir, KEY_OPTS);
    if (!a.ok || !b.ok) throw new Error("key resolution failed");
    expect(a.created).toBe(true);
    expect(b.created).toBe(false);
    expect(b.hexKey).toBe(a.hexKey);
    expect(a.hexKey).toMatch(/^[0-9a-f]{64}$/);
  });

  it("passphrase mode derives deterministically from the stored salt", () => {
    const dir = path.join(tmp, "pass");
    const a = resolveDbKey(dir, { passphrase: "correct horse" });
    const b = resolveDbKey(dir, { passphrase: "correct horse" });
    const c = resolveDbKey(dir, { passphrase: "wrong horse" });
    if (!a.ok || !b.ok || !c.ok) throw new Error("passphrase resolution failed");
    expect(b.hexKey).toBe(a.hexKey);
    expect(c.hexKey).not.toBe(a.hexKey); // wrong passphrase = wrong key; DB open will refuse
  });

  it("refuses mode switches instead of silently rekeying", () => {
    const dir = path.join(tmp, "modes");
    const a = resolveDbKey(dir, KEY_OPTS);
    expect(a.ok).toBe(true);
    const b = resolveDbKey(dir, { passphrase: "now with passphrase" });
    expect(b.ok).toBe(false);
  });
});

describe("encrypted database", () => {
  const dbPath = path.join(tmp, "enc", "atlas.sqlite");
  const key = resolveDbKey(path.join(tmp, "enc"), KEY_OPTS);
  if (!key.ok) throw new Error("no key");

  it("creates encrypted, readable with key, unreadable without", () => {
    const { sqlite, db } = openAtlasDb(dbPath, key.hexKey, migrations);
    db.insert(accounts).values({ name: "HDFC", kind: "bank", category: "asset", owner: "self" }).run();
    sqlite.close();

    expect(fileLooksEncrypted(dbPath)).toBe(true);

    const keyless = new Database(dbPath);
    expect(() => keyless.prepare("SELECT count(*) FROM sqlite_master").get()).toThrow();
    keyless.close();

    const reopened = openAtlasDb(dbPath, key.hexKey, migrations);
    expect(reopened.db.select().from(accounts).all()).toHaveLength(1);
    reopened.sqlite.close();
  });

  it("wrong key fails with the honest 'key is wrong, data intact' error", () => {
    expect(() => openAtlasDb(dbPath, "ab".repeat(32), migrations)).toThrow(/key is wrong/);
  });

  it("encrypts a pre-existing plaintext DB in place, safety copy first", () => {
    const plainPath = path.join(tmp, "legacy", "atlas.sqlite");
    fs.mkdirSync(path.dirname(plainPath), { recursive: true });
    const plain = new Database(plainPath);
    // WAL mode, like the real phase-1 database — rekey silently no-ops on WAL
    // unless core.ts drops to DELETE mode first (the bug found on live data).
    plain.pragma("journal_mode = WAL");
    plain.exec("CREATE TABLE legacy(x); INSERT INTO legacy VALUES (42)");
    plain.close();
    expect(fileLooksEncrypted(plainPath)).toBe(false);

    const opened = openAtlasDb(plainPath, key.hexKey, migrations);
    expect(opened.encryptedInPlace).toBe(true);
    expect(opened.preEncryptBackupPath && fs.existsSync(opened.preEncryptBackupPath)).toBe(true);
    expect(opened.sqlite.prepare("SELECT x FROM legacy").get()).toEqual({ x: 42 });
    opened.sqlite.close();
    expect(fileLooksEncrypted(plainPath)).toBe(true);
  });
});

describe("backup round-trip (the gate)", () => {
  const dir = path.join(tmp, "bk");
  const key = resolveDbKey(dir, KEY_OPTS);
  if (!key.ok) throw new Error("no key");
  const backupsDir = path.join(dir, "backups");

  it("snapshot is encrypted, verifies, and counts match the source", () => {
    const { sqlite, db } = openAtlasDb(path.join(dir, "atlas.sqlite"), key.hexKey, migrations);
    db.insert(accounts).values({ name: "A", kind: "bank", category: "asset", owner: "self" }).run();
    db.insert(accounts).values({ name: "B", kind: "epf", category: "asset", owner: "self" }).run();

    const run = runBackup(sqlite, key.hexKey, backupsDir);
    expect(run.verify.ok).toBe(true);
    expect(run.verify.encrypted).toBe(true);
    expect(run.verify.integrity).toBe("ok");
    expect(run.verify.tables["accounts"]).toBe(2);

    // Restore: open the snapshot as a database and read the rows back.
    const restored = openAtlasDb(run.filePath, key.hexKey, migrations);
    expect(restored.db.select().from(accounts).all().map((a) => a.name)).toEqual(["A", "B"]);
    restored.sqlite.close();
    sqlite.close();
  });

  it("two backups in the same second get distinct file names", () => {
    const { sqlite } = openAtlasDb(path.join(dir, "atlas.sqlite"), key.hexKey, migrations);
    const a = runBackup(sqlite, key.hexKey, backupsDir);
    const b = runBackup(sqlite, key.hexKey, backupsDir);
    expect(b.fileName).not.toBe(a.fileName);
    expect(b.verify.ok).toBe(true);
    sqlite.close();
  });

  it("verification fails loudly on a corrupted snapshot", () => {
    const f = listBackups(backupsDir)[0];
    const p = path.join(backupsDir, f.fileName);
    const bytes = fs.readFileSync(p);
    bytes.fill(0, 100, 400);
    fs.writeFileSync(p, bytes);
    expect(verifyBackup(p, key.hexKey).ok).toBe(false);
  });

  it("rotation keeps the newest N plus monthly firsts", () => {
    fs.rmSync(backupsDir, { recursive: true, force: true });
    fs.mkdirSync(backupsDir, { recursive: true });
    const months = ["2026-05", "2026-06", "2026-07"];
    const names: string[] = [];
    for (const m of months) {
      for (let d = 1; d <= 6; d++) {
        const n = `${BACKUP_PREFIX}${m}-${String(d).padStart(2, "0")}-00-00-00.sqlite`;
        fs.writeFileSync(path.join(backupsDir, n), "x");
        names.push(n);
      }
    }
    rotateBackups(backupsDir, 4);
    const left = listBackups(backupsDir).map((b) => b.fileName);
    // newest 4 (Jul 03-06) + the three monthly firsts (May/Jun/Jul 01) = 7
    expect(left).toHaveLength(7);
    for (const m of months) expect(left).toContain(`${BACKUP_PREFIX}${m}-01-00-00-00.sqlite`);
  });
});
