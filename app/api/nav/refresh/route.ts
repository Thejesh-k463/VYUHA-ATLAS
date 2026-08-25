import { NextResponse } from "next/server";
import { parseMfapiLatest, parseNavAll, type AmfiNavEntry } from "@/lib/import/amfi-nav";
import {
  listHoldingsForNavRefresh,
  setHoldingAmfiCode,
  upsertNavs,
} from "@/lib/queries/investments";

// Network lives HERE, in the route layer — pure modules parse, queries store
// (invariant 2). Primary source mfapi.in per scheme; AMFI NAVAll.txt is both
// the fallback NAV source and the ISIN → scheme-code resolver.

const MFAPI_TIMEOUT_MS = 10_000;
const AMFI_TIMEOUT_MS = 30_000;
// www.amfiindia.com now answers with an HTML "Document Moved" page (observed
// live 2026-08-25), so the portal host is primary and www the fallback.
const AMFI_URLS = [
  "https://portal.amfiindia.com/spages/NAVAll.txt",
  "https://www.amfiindia.com/spages/NAVAll.txt",
];

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  return fetch(url, { signal: AbortSignal.timeout(ms), cache: "no-store" });
}

export async function POST() {
  const holdings = listHoldingsForNavRefresh();
  if (holdings.length === 0) {
    return NextResponse.json({ error: "No CAS holdings to refresh. Import a CAS first." }, { status: 422 });
  }
  const byIsin = new Map<string, { ids: number[]; amfiCode: string | null }>();
  for (const h of holdings) {
    const e = byIsin.get(h.isin) ?? { ids: [], amfiCode: null };
    e.ids.push(h.id);
    e.amfiCode = e.amfiCode ?? h.amfiCode;
    byIsin.set(h.isin, e);
  }

  // AMFI NAVAll: fetched when any ISIN lacks a scheme code, reused as fallback.
  let amfiMap: Map<string, AmfiNavEntry> | null = null;
  let amfiError: string | null = null;
  const needsResolution = [...byIsin.values()].some((e) => e.amfiCode === null);
  async function getAmfiMap(): Promise<Map<string, AmfiNavEntry> | null> {
    if (amfiMap || amfiError) return amfiMap;
    for (const url of AMFI_URLS) {
      try {
        const res = await fetchWithTimeout(url, AMFI_TIMEOUT_MS);
        if (!res.ok) throw new Error(`AMFI responded ${res.status}`);
        const map = parseNavAll(await res.text());
        if (map.size === 0) throw new Error("NAVAll parsed to zero rows (moved/HTML response?)");
        amfiMap = map;
        amfiError = null;
        return amfiMap;
      } catch (err) {
        amfiError = (err as Error)?.message ?? String(err);
      }
    }
    return amfiMap;
  }

  if (needsResolution) {
    const map = await getAmfiMap();
    if (map) {
      for (const [isin, entry] of byIsin) {
        if (entry.amfiCode === null) {
          const amfi = map.get(isin);
          if (amfi) {
            entry.amfiCode = amfi.amfiCode;
            for (const id of entry.ids) setHoldingAmfiCode(id, amfi.amfiCode);
          }
        }
      }
    }
  }

  const navRows: { isin: string; date: string; nav: number; source: string }[] = [];
  const failures: { isin: string; reason: string }[] = [];
  let fromMfapi = 0;
  let fromAmfi = 0;

  await Promise.all(
    [...byIsin.entries()].map(async ([isin, entry]) => {
      if (entry.amfiCode) {
        try {
          const res = await fetchWithTimeout(`https://api.mfapi.in/mf/${entry.amfiCode}/latest`, MFAPI_TIMEOUT_MS);
          if (res.ok) {
            const latest = parseMfapiLatest(await res.json());
            if (latest) {
              navRows.push({ isin, date: latest.date, nav: latest.nav, source: "mfapi" });
              fromMfapi++;
              return;
            }
          }
        } catch {
          // fall through to AMFI
        }
      }
      const map = await getAmfiMap();
      const amfi = map?.get(isin);
      if (amfi) {
        navRows.push({ isin, date: amfi.date, nav: amfi.nav, source: "amfi" });
        fromAmfi++;
      } else {
        failures.push({
          isin,
          reason: entry.amfiCode
            ? "mfapi failed and AMFI has no row for this ISIN"
            : amfiError
              ? `no scheme code and AMFI unreachable: ${amfiError}`
              : "ISIN not found in AMFI NAVAll",
        });
      }
    }),
  );

  const upserted = upsertNavs(navRows);
  return NextResponse.json({
    schemes: byIsin.size,
    upserted,
    fromMfapi,
    fromAmfi,
    failures,
  });
}
