// Backup snapshot, verification, and rotation. Plain Node, test-driven.
// A backup that has not been re-opened and integrity-checked is not a backup.
import Database from "better-sqlite3-multiple-ciphers";
import fs from "node:fs";
import path from "node:path";
import type { SqliteHandle } from "@/lib/db/core";
import { fileLooksEncrypted } from "@/lib/db/core";

export const BACKUP_PREFIX = "atlas-";

export interface BackupVerify {
  ok: boolean;
  encrypted: boolean;
  integrity: string;
  tables: Record<string, number>;
  error?: string;
}

export interface BackupRun {
  fileName: string;
  filePath: string;
  sizeBytes: number;
  verify: BackupVerify;
}

/** VACUUM INTO an encrypted snapshot (inherits the source key), then verify it. */
export function runBackup(sqlite: SqliteHandle, hexKey: string, backupsDir: string): BackupRun {
  fs.mkdirSync(backupsDir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
  // VACUUM INTO refuses an existing file — two backups in the same second
  // (auto-on-open + manual click) must get distinct names, not a 500.
  let fileName = `${BACKUP_PREFIX}${stamp}.sqlite`;
  let filePath = path.join(backupsDir, fileName);
  for (let n = 2; fs.existsSync(filePath); n++) {
    fileName = `${BACKUP_PREFIX}${stamp}-${n}.sqlite`;
    filePath = path.join(backupsDir, fileName);
  }
  sqlite.pragma("wal_checkpoint(TRUNCATE)");
  sqlite.exec(`VACUUM INTO '${filePath.replace(/'/g, "''")}'`);
  const verify = verifyBackup(filePath, hexKey);
  return { fileName, filePath, sizeBytes: fs.statSync(filePath).size, verify };
}

export function verifyBackup(filePath: string, hexKey: string): BackupVerify {
  const encrypted = fileLooksEncrypted(filePath);
  let snap: InstanceType<typeof Database> | null = null;
  try {
    snap = new Database(filePath, { readonly: true });
    if (encrypted) snap.pragma(`key="x'${hexKey}'"`);
    const integrity = (snap.pragma("integrity_check") as { integrity_check: string }[])[0].integrity_check;
    const names = (
      snap.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as {
        name: string;
      }[]
    ).map((r) => r.name);
    const tables: Record<string, number> = {};
    for (const n of names) {
      tables[n] = (snap.prepare(`SELECT count(*) c FROM "${n.replace(/"/g, '""')}"`).get() as { c: number }).c;
    }
    return { ok: integrity === "ok" && encrypted, encrypted, integrity, tables };
  } catch (e) {
    return {
      ok: false,
      encrypted,
      integrity: "unreadable",
      tables: {},
      error: e instanceof Error ? e.message : String(e),
    };
  } finally {
    snap?.close();
  }
}

export interface BackupInfo {
  fileName: string;
  sizeBytes: number;
  mtime: string;
}

export function listBackups(backupsDir: string): BackupInfo[] {
  if (!fs.existsSync(backupsDir)) return [];
  return fs
    .readdirSync(backupsDir)
    .filter((f) => f.startsWith(BACKUP_PREFIX) && f.endsWith(".sqlite"))
    .map((f) => {
      const st = fs.statSync(path.join(backupsDir, f));
      return { fileName: f, sizeBytes: st.size, mtime: st.mtime.toISOString() };
    })
    .sort((a, b) => b.fileName.localeCompare(a.fileName));
}

/** Keep the newest `keepRecent`, plus the first backup of each month for a year. */
export function rotateBackups(backupsDir: string, keepRecent = 14): string[] {
  const all = listBackups(backupsDir).sort((a, b) => a.fileName.localeCompare(b.fileName)); // oldest first
  const keep = new Set<string>();
  for (const b of all.slice(-keepRecent)) keep.add(b.fileName);
  const firstOfMonth = new Map<string, string>();
  for (const b of all) {
    const month = b.fileName.slice(BACKUP_PREFIX.length, BACKUP_PREFIX.length + 7); // yyyy-mm
    if (!firstOfMonth.has(month)) firstOfMonth.set(month, b.fileName);
  }
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 12);
  const cutoffMonth = cutoff.toISOString().slice(0, 7);
  for (const [month, f] of firstOfMonth) if (month >= cutoffMonth) keep.add(f);
  const deleted: string[] = [];
  for (const b of all) {
    if (!keep.has(b.fileName)) {
      fs.unlinkSync(path.join(backupsDir, b.fileName));
      deleted.push(b.fileName);
    }
  }
  return deleted;
}
