// Pure parsers for NAV sources. No DB, no React, no fetch (invariant 2) —
// the route layer downloads, this file only parses.
//
// AMFI NAVAll.txt (verified live 2026-08-25 at portal.amfiindia.com): semicolon rows
//   Scheme Code;ISIN Div Payout/ ISIN Growth;ISIN Div Reinvestment;Scheme Name;Plan;Option;Net Asset Value;Date
// Older mirrors used 6 fields (no Plan/Option); both shapes parse — first three
// fields and the last two are positionally stable. It doubles as the
// ISIN → AMFI scheme-code resolver (mfapi.in uses the same codes).

import { casDateToIso } from "@/lib/import/cas-parse";

export interface AmfiNavEntry {
  amfiCode: string;
  schemeName: string;
  nav: number;
  date: string; // ISO
}

/** Parse NAVAll.txt into ISIN → entry. Both ISIN columns register when present. */
export function parseNavAll(text: string): Map<string, AmfiNavEntry> {
  const byIsin = new Map<string, AmfiNavEntry>();
  for (const rawLine of text.split(/\r?\n/)) {
    const parts = rawLine.split(";").map((p) => p.trim());
    if (parts.length !== 6 && parts.length !== 8) continue; // headers, AMC names, blank lines
    const [code, isin1, isin2, name] = parts;
    const navRaw = parts[parts.length - 2];
    const dateRaw = parts[parts.length - 1];
    if (!/^\d+$/.test(code)) continue;
    const nav = Number(navRaw);
    const date = casDateToIso(dateRaw);
    if (!Number.isFinite(nav) || nav <= 0 || !date) continue; // "N.A." rows — never coerced
    const entry: AmfiNavEntry = { amfiCode: code, schemeName: name, nav, date };
    for (const isin of [isin1, isin2]) {
      if (/^[A-Z0-9]{12}$/.test(isin)) byIsin.set(isin, entry);
    }
  }
  return byIsin;
}

/** Parse an mfapi.in /mf/{code}/latest response body. Null when the shape is off. */
export function parseMfapiLatest(json: unknown): { nav: number; date: string } | null {
  const data = (json as { data?: unknown })?.data;
  if (!Array.isArray(data) || data.length === 0) return null;
  const row = data[0] as { date?: unknown; nav?: unknown };
  if (typeof row.date !== "string" || typeof row.nav !== "string") return null;
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(row.date);
  if (!m) return null;
  const nav = Number(row.nav);
  if (!Number.isFinite(nav) || nav <= 0) return null;
  return { nav, date: `${m[3]}-${m[2]}-${m[1]}` };
}
