// Database-encryption key management. Plain Node (no server-only) so tests can
// exercise it against temp dirs; app code reaches it only through lib/db/index.ts.
//
// Scheme (adapted from VYUHA's production vault, analyzed read-only 2026-08-25):
// one random 32-byte DEK is the SQLite cipher key. It lives WRAPPED in
// `atlas.key` beside the DB:
//   - Windows: DPAPI (CurrentUser) via PowerShell — no native npm dependency;
//     blobs travel in ENV VARS, never interpolated into the command string.
//   - Fallback / other OS / tests: AES-256-GCM under scrypt(machine identity).
//   - ATLAS_PASSPHRASE env set: key = scrypt(passphrase, stored salt) — the
//     stronger mode; the file is useless even to same-user malware without the
//     passphrase. Switching modes on an existing DB requires a rekey (system page).
//
// Honest claim (same as VYUHA's): the DB file alone — copied, synced, stolen —
// is unreadable off this machine/user. DPAPI/machine wraps do NOT defend against
// code already running as this user; the passphrase mode does.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createCipheriv, createDecipheriv, execFileSyncSafe, randomBytesSafe, scryptSyncSafe } from "./node-crypto";

export const KEY_FILE_NAME = "atlas.key";
const AAD = Buffer.from("atlas-key-v1");

export interface AtlasKeyFile {
  atlasKey: true;
  v: 1;
  provider: "dpapi" | "machine" | "passphrase";
  salt: string; // base64
  wrapped?: string; // base64 DEK ciphertext (absent for passphrase mode)
  iv?: string;
  tag?: string;
  createdAt: string;
}

export type KeyResult =
  | { ok: true; hexKey: string; provider: AtlasKeyFile["provider"]; created: boolean }
  | { ok: false; reason: string };

function windowsMachineGuid(): string | null {
  if (process.platform !== "win32") return null;
  try {
    const out = execFileSyncSafe(
      "reg",
      ["query", "HKLM\\SOFTWARE\\Microsoft\\Cryptography", "/v", "MachineGuid", "/reg:64"],
      { encoding: "utf8", timeout: 4000, windowsHide: true, stdio: ["ignore", "pipe", "ignore"] },
    );
    const m = out.match(/MachineGuid\s+REG_SZ\s+([0-9a-fA-F-]{36})/);
    return m ? m[1].toLowerCase() : null;
  } catch {
    return null;
  }
}

function machineIdentity(): string {
  return windowsMachineGuid() ?? `${os.hostname()}|${os.userInfo().username}|${os.platform()}`;
}

function dpapiRun(op: "Protect" | "Unprotect", data: Buffer, entropy: Buffer): Buffer {
  const script = [
    "Add-Type -AssemblyName System.Security;",
    "$d=[Convert]::FromBase64String($env:ATLAS_DPAPI_DATA);",
    "$e=[Convert]::FromBase64String($env:ATLAS_DPAPI_ENTROPY);",
    `[Convert]::ToBase64String([Security.Cryptography.ProtectedData]::${op}($d,$e,[Security.Cryptography.DataProtectionScope]::CurrentUser))`,
  ].join(" ");
  const out = execFileSyncSafe("powershell", ["-NoProfile", "-NonInteractive", "-Command", script], {
    timeout: 15_000,
    windowsHide: true,
    encoding: "utf8",
    env: { ...process.env, ATLAS_DPAPI_DATA: data.toString("base64"), ATLAS_DPAPI_ENTROPY: entropy.toString("base64") },
  });
  return Buffer.from(out.trim(), "base64");
}

export interface KeyOptions {
  /** Force a wrap provider (tests use "machine" so runs never shell out to DPAPI). */
  forceProvider?: "machine";
  passphrase?: string | null;
}

function wrapDek(dek: Buffer, opts: KeyOptions): AtlasKeyFile {
  const salt = randomBytesSafe(16);
  const base = { atlasKey: true as const, v: 1 as const, salt: salt.toString("base64"), createdAt: new Date().toISOString() };
  if (process.platform === "win32" && opts.forceProvider !== "machine" && process.env.ATLAS_KEY_PROVIDER !== "machine") {
    try {
      const wrapped = dpapiRun("Protect", dek, salt);
      return { ...base, provider: "dpapi", wrapped: wrapped.toString("base64") };
    } catch {
      // PowerShell constrained/missing — machine wrap below still holds the
      // off-machine guarantee, which is the load-bearing one.
    }
  }
  const kek = scryptSyncSafe(machineIdentity(), salt, 32);
  const iv = randomBytesSafe(12);
  const cipher = createCipheriv("aes-256-gcm", kek, iv);
  cipher.setAAD(AAD);
  const wrapped = Buffer.concat([cipher.update(dek), cipher.final()]);
  return {
    ...base,
    provider: "machine",
    wrapped: wrapped.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}

function unwrapDek(file: AtlasKeyFile): Buffer {
  const salt = Buffer.from(file.salt, "base64");
  const wrapped = Buffer.from(file.wrapped ?? "", "base64");
  if (file.provider === "dpapi") return dpapiRun("Unprotect", wrapped, salt);
  const kek = scryptSyncSafe(machineIdentity(), salt, 32);
  const decipher = createDecipheriv("aes-256-gcm", kek, Buffer.from(file.iv!, "base64"));
  decipher.setAAD(AAD);
  decipher.setAuthTag(Buffer.from(file.tag!, "base64"));
  return Buffer.concat([decipher.update(wrapped), decipher.final()]);
}

/** Resolve (or create) the DB key for the data dir. Never throws into a caller. */
export function resolveDbKey(dataDir: string, opts: KeyOptions = {}): KeyResult {
  const keyPath = path.join(dataDir, KEY_FILE_NAME);
  const passphrase = opts.passphrase ?? process.env.ATLAS_PASSPHRASE ?? null;
  try {
    let file: AtlasKeyFile | null = null;
    if (fs.existsSync(keyPath)) {
      const parsed = JSON.parse(fs.readFileSync(keyPath, "utf8")) as AtlasKeyFile;
      if (parsed?.atlasKey === true && parsed.v === 1) file = parsed;
    }

    if (passphrase) {
      // Passphrase mode: the key derives from the passphrase; the file only pins the salt.
      if (file && file.provider !== "passphrase") {
        return {
          ok: false,
          reason:
            "ATLAS_PASSPHRASE is set but this database was keyed by " +
            file.provider +
            ". Rekey from the System page before switching modes.",
        };
      }
      if (!file) {
        file = {
          atlasKey: true,
          v: 1,
          provider: "passphrase",
          salt: randomBytesSafe(16).toString("base64"),
          createdAt: new Date().toISOString(),
        };
        fs.mkdirSync(dataDir, { recursive: true });
        fs.writeFileSync(keyPath, JSON.stringify(file, null, 2));
      }
      // N=2^17,r=8 needs ~134MB; node's default maxmem (32MB) would throw.
      const key = scryptSyncSafe(passphrase, Buffer.from(file.salt, "base64"), 32, {
        N: 1 << 17,
        r: 8,
        p: 1,
        maxmem: 256 * 1024 * 1024,
      });
      return { ok: true, hexKey: key.toString("hex"), provider: "passphrase", created: false };
    }

    if (file) {
      if (file.provider === "passphrase") {
        return { ok: false, reason: "This database is passphrase-keyed — set ATLAS_PASSPHRASE to open it." };
      }
      return { ok: true, hexKey: unwrapDek(file).toString("hex"), provider: file.provider, created: false };
    }

    const dek = randomBytesSafe(32);
    const wrapped = wrapDek(dek, opts);
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(keyPath, JSON.stringify(wrapped, null, 2));
    return { ok: true, hexKey: dek.toString("hex"), provider: wrapped.provider, created: true };
  } catch (e) {
    return { ok: false, reason: `Key file unreadable: ${e instanceof Error ? e.message : String(e)}` };
  }
}
