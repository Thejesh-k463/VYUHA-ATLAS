// Thin re-exports so keyfile.ts stays free of direct node: imports scattered
// through its logic, and so a future edge-runtime accident fails loudly here.
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { execFileSync } from "node:child_process";

export { createCipheriv, createDecipheriv };
export const randomBytesSafe = randomBytes;
export const scryptSyncSafe = scryptSync;
export const execFileSyncSafe = execFileSync;
