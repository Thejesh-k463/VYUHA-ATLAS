// Pure dedup keys for incremental statement imports (VYUHA's SHA-1 row approach —
// docs/DECISIONS.md: snapshot sources replace, incremental sources dedup by row).
// No DB, no React; node:crypto is compute, not I/O.

import { createHash } from "node:crypto";

export function normalizeDescription(desc: string): string {
  return desc.replace(/\s+/g, " ").trim().toUpperCase();
}

/** 12-digit UPI RRN from a UPI narration; null for non-UPI rows. */
export function extractUpiRef(desc: string): string | null {
  if (!/upi/i.test(desc)) return null;
  const m = /\b(\d{12})\b/.exec(desc);
  return m ? m[1] : null;
}

export interface DedupRow {
  accountId: number;
  date: string; // ISO
  amount: number; // rupees, signed
  description: string;
}

/**
 * SHA-1 hash per row, with a same-tuple occurrence counter: two genuinely
 * identical payments inside one statement get distinct hashes (…#0, …#1) and
 * both insert, while a re-imported overlapping statement reproduces the exact
 * same hash set and every repeat is skipped by the unique index.
 */
export function computeRowHashes(rows: DedupRow[]): string[] {
  const seen = new Map<string, number>();
  return rows.map((r) => {
    const amountPaise = Math.round(r.amount * 100);
    const tuple = `${r.accountId}|${r.date}|${amountPaise}|${normalizeDescription(r.description)}`;
    const n = seen.get(tuple) ?? 0;
    seen.set(tuple, n + 1);
    return createHash("sha1").update(`${tuple}#${n}`).digest("hex");
  });
}
