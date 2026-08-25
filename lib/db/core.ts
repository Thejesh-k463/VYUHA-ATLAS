// Open/encrypt/migrate the Atlas database. Plain Node so tests can drive it
// against temp files; app code reaches it only through lib/db/index.ts.
import Database from "better-sqlite3-multiple-ciphers";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";

export type SqliteHandle = InstanceType<typeof Database>;
export type AtlasDb = BetterSQLite3Database<typeof schema>;

export interface OpenResult {
  sqlite: SqliteHandle;
  db: AtlasDb;
  /** True when a pre-existing plaintext DB was encrypted in place this open. */
  encryptedInPlace: boolean;
  /** Set when encryptedInPlace: the plaintext safety copy taken first. */
  preEncryptBackupPath: string | null;
}

function applyKey(sqlite: SqliteHandle, hexKey: string): void {
  // Raw 32-byte key, hex form — bypasses the driver's internal KDF entirely.
  sqlite.pragma(`key="x'${hexKey}'"`);
}

function probe(sqlite: SqliteHandle): boolean {
  try {
    sqlite.prepare("SELECT count(*) FROM sqlite_master").get();
    return true;
  } catch {
    return false;
  }
}

function pragmas(sqlite: SqliteHandle): void {
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("busy_timeout = 10000");
  sqlite.pragma("foreign_keys = ON");
}

/**
 * Opens the DB with the key, transparently encrypting a pre-existing plaintext
 * file in place (safety copy first — restore beats regret; delete it once the
 * encrypted DB is verified). Throws only on genuinely unusable files.
 */
export function openAtlasDb(dbPath: string, hexKey: string, migrationsFolder: string): OpenResult {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const existed = fs.existsSync(dbPath);

  let sqlite = new Database(dbPath);
  applyKey(sqlite, hexKey);
  let encryptedInPlace = false;
  let preEncryptBackupPath: string | null = null;

  if (existed && !probe(sqlite)) {
    // Wrong key or plaintext file. Distinguish by opening keyless.
    sqlite.close();
    sqlite = new Database(dbPath);
    if (!probe(sqlite)) {
      sqlite.close();
      throw new Error(
        "Database is encrypted with a different key than atlas.key provides. " +
          "Restore the matching atlas.key from backup — the data is intact, the key is wrong.",
      );
    }
    // Plaintext legacy DB: take a safety copy, then encrypt in place.
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    preEncryptBackupPath = path.join(path.dirname(dbPath), `pre-encrypt-${stamp}.sqlite`);
    sqlite.exec(`VACUUM INTO '${preEncryptBackupPath.replace(/'/g, "''")}'`);
    sqlite.pragma("wal_checkpoint(TRUNCATE)");
    // SQLite3MultipleCiphers cannot rekey a WAL database — drop to DELETE for
    // the rekey; pragmas() restores WAL on the reopened encrypted handle.
    // (Found live 2026-08-25: the test's synthetic legacy DB was DELETE-mode and
    // passed while the real WAL DB looped a failed migration on every request.)
    sqlite.pragma("journal_mode = DELETE");
    sqlite.pragma(`rekey="x'${hexKey}'"`);
    sqlite.close();
    sqlite = new Database(dbPath);
    applyKey(sqlite, hexKey);
    if (!probe(sqlite)) {
      sqlite.close();
      throw new Error("In-place encryption failed verification; plaintext copy preserved at " + preEncryptBackupPath);
    }
    encryptedInPlace = true;
  }

  pragmas(sqlite);
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder });
  return { sqlite, db, encryptedInPlace, preEncryptBackupPath };
}

/** True when the file does NOT start with the plaintext SQLite magic header. */
export function fileLooksEncrypted(dbPath: string): boolean {
  const fd = fs.openSync(dbPath, "r");
  try {
    const buf = Buffer.alloc(16);
    fs.readSync(fd, buf, 0, 16, 0);
    return !buf.toString("latin1").startsWith("SQLite format 3");
  } finally {
    fs.closeSync(fd);
  }
}
