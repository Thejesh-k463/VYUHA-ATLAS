import "server-only";
import path from "node:path";
import { openAtlasDb, type AtlasDb, type SqliteHandle } from "./core";
import { resolveDbKey } from "./keyfile";
import { listBackups, rotateBackups, runBackup } from "@/lib/backup/engine";

const DB_PATH = process.env.ATLAS_DB_PATH ?? path.join(process.cwd(), "data", "atlas.sqlite");
export const dataDir = path.dirname(DB_PATH);
export const backupsDir = path.join(dataDir, "backups");

interface DbState {
  db: AtlasDb;
  sqlite: SqliteHandle;
  hexKey: string;
  provider: string;
  encryptedInPlace: boolean;
  preEncryptBackupPath: string | null;
}

const g = globalThis as unknown as { __atlasDbState?: DbState; __atlasDbPath?: string };

const AUTO_BACKUP_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function openState(): DbState {
  const key = resolveDbKey(dataDir);
  if (!key.ok) {
    // Failure posture (VYUHA rule): losing the key must cost a clear message,
    // never a stack trace pretending the data is gone.
    throw new Error(`Atlas cannot unlock its database: ${key.reason}`);
  }
  const opened = openAtlasDb(DB_PATH, key.hexKey, path.join(process.cwd(), "drizzle"));
  const state: DbState = {
    db: opened.db,
    sqlite: opened.sqlite,
    hexKey: key.hexKey,
    provider: key.provider,
    encryptedInPlace: opened.encryptedInPlace,
    preEncryptBackupPath: opened.preEncryptBackupPath,
  };
  // Auto-backup on open when the newest snapshot is stale — cheap for this DB
  // size, and it means "opened the app" is enough to stay backed up.
  const newest = listBackups(backupsDir)[0];
  if (!newest || Date.now() - Date.parse(newest.mtime) > AUTO_BACKUP_MAX_AGE_MS) {
    runBackup(state.sqlite, state.hexKey, backupsDir);
    rotateBackups(backupsDir);
  }
  return state;
}

function getState(): DbState {
  if (!g.__atlasDbState || g.__atlasDbPath !== DB_PATH) {
    g.__atlasDbState = openState();
    g.__atlasDbPath = DB_PATH;
  }
  return g.__atlasDbState;
}

export function getDb(): AtlasDb {
  return getState().db;
}

export function getSqlite(): SqliteHandle {
  return getState().sqlite;
}

export function getDbKeyHex(): string {
  return getState().hexKey;
}

export function getEncryptionStatus(): {
  provider: string;
  encryptedInPlace: boolean;
  preEncryptBackupPath: string | null;
} {
  const s = getState();
  return {
    provider: s.provider,
    encryptedInPlace: s.encryptedInPlace,
    preEncryptBackupPath: s.preEncryptBackupPath,
  };
}
