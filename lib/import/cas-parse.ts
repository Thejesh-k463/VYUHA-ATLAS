// Pure CAS text parser: extracted PDF lines → folios/schemes/transactions.
// No DB, no React, no pdfjs (invariant 2) — cas-pdf.ts produces the lines.
//
// Built against a real CAMS+KFintech consolidated statement (detailed, with
// transactions). The parser is tolerant by design: within a scheme section it
// acts only on lines it positively recognizes (dated rows, Opening/Closing
// balances, folio/scheme headers) and ignores footers, disclaimers and page
// furniture. It never coerces an unreadable number — unparseable dated rows
// are collected as warnings, not guessed at.

export const CAS_TX_TYPES = [
  "purchase",
  "purchase_sip",
  "redemption",
  "switch_in",
  "switch_out",
  "dividend_reinvest",
  "dividend_payout",
  "segregation",
  "tax_or_charge",
  "misc",
] as const;
export type CasTxType = (typeof CAS_TX_TYPES)[number];

export interface CasTransaction {
  date: string; // ISO yyyy-mm-dd
  description: string;
  txType: CasTxType;
  /** Rupees, signed (parenthesised CAS figures are negative). Null when the row carries none. */
  amount: number | null;
  units: number | null; // signed
  nav: number | null; // price per unit
  unitBalance: number | null;
}

export interface CasHolding {
  folio: string;
  amc: string;
  schemeName: string;
  isin: string;
  rta: string | null;
  advisor: string | null;
  /** Nominee names as printed on the folio's "Nominee 1/2/3:" line; [] when none registered. */
  nominees: string[];
  openingUnits: number;
  closingUnits: number;
  /** NAV printed on the Closing Unit Balance line — seeds nav_history without a network call. */
  casNav: number | null;
  casNavDate: string | null; // ISO
  costValue: number | null; // rupees, CAS-stated
  marketValue: number | null; // rupees, CAS-stated
  transactions: CasTransaction[];
}

export interface CasStatement {
  periodFrom: string; // ISO
  periodTo: string; // ISO
  amcSummary: { amc: string; cost: number; market: number }[];
  /** The CAS's own portfolio totals — the import cross-checks against these. */
  summaryTotal: { cost: number; market: number } | null;
}

export interface CasParseOk {
  ok: true;
  statement: CasStatement;
  holdings: CasHolding[];
  warnings: string[];
}
export interface CasParseError {
  ok: false;
  error: string;
}

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

/** "13-Apr-2022" → "2022-04-13"; null when not a CAS-style date. */
export function casDateToIso(d: string): string | null {
  const m = /^(\d{2})-([A-Za-z]{3})-(\d{4})$/.exec(d.trim());
  if (!m) return null;
  const month = MONTHS[m[2].toLowerCase()];
  return month ? `${m[3]}-${month}-${m[1]}` : null;
}

/** "1,23,456.78" → 123456.78; "(1,999.90)" → -1999.9; null when not a number. */
function parseCasNumber(raw: string): number | null {
  const negative = raw.startsWith("(") && raw.endsWith(")");
  const cleaned = raw.replace(/[(),]/g, "");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return negative ? -n : n;
}

// A CAS money/units figure always carries decimals; bare integers in descriptions
// (instalment counts, payment references) never match.
const NUM = String.raw`\(?[\d,]+\.\d+\)?`;
const TX_FULL_RE = new RegExp(String.raw`^(\d{2}-[A-Za-z]{3}-\d{4})\s+(.+?)\s+(${NUM})\s+(${NUM})\s+(${NUM})\s+(${NUM})$`);
const TX_AMOUNT_ONLY_RE = new RegExp(String.raw`^(\d{2}-[A-Za-z]{3}-\d{4})\s+(.+?)\s+(${NUM})$`);
const TX_BARE_RE = /^(\d{2}-[A-Za-z]{3}-\d{4})\s+(.+)$/;

const FOLIO_RE = /^Folio No:\s*(.+?)\s*(?:PAN:|KYC:)/;
const SCHEME_START_RE = /^[A-Z0-9]+-/;
const SCHEME_RE = /^([A-Z0-9]+)-(.+?)\s*-?\s*ISIN\s*:\s*([A-Z0-9]{12})\s*(?:\(Advisor\s*:\s*([^)]*)\))?\s*Registrar\s*:\s*(\S*)\s*$/;
const OPENING_RE = /^Opening Unit Balance:\s*([\d,.]+)/;
const CLOSING_RE =
  /^Closing Unit Balance:\s*([\d,.]+)\s*NAV on (\d{2}-[A-Za-z]{3}-\d{4}):\s*INR\s*([\d,.]+)\s*Total Cost Value:\s*([\d,.]+)\s*Market Value on \d{2}-[A-Za-z]{3}-\d{4}:\s*INR\s*([\d,.]+)/;
const PERIOD_RE = /^(\d{2}-[A-Za-z]{3}-\d{4}) To (\d{2}-[A-Za-z]{3}-\d{4})$/;
const NOMINEE_SPLIT_RE = /Nominee\s*\d*\s*:/i;
const SUMMARY_ROW_RE = /^(.+?)\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})$/;

/** "Nominee 1: A B Nominee 2: C Nominee 3:" → ["A B", "C"]. Empty slots and
 *  "Not Registered" yield nothing; trailing PAN/KYC furniture is cut off. */
export function parseNomineeLine(line: string): string[] {
  if (!NOMINEE_SPLIT_RE.test(line)) return [];
  return line
    .split(NOMINEE_SPLIT_RE)
    .slice(1) // text before the first "Nominee N:" is not a name
    .map((chunk) => chunk.split(/\s*(?:KYC|PAN)\s*:/i)[0].trim())
    .filter((name) => name.length > 0 && !/^not\s+registered$/i.test(name));
}

export function classifyCasTx(description: string, hasUnits: boolean): CasTxType {
  const d = description.toLowerCase();
  // Amount-only rows are taxes/charges (*** Stamp Duty ***, *** STT Paid ***).
  // Unit-bearing rows classify by kind FIRST — "Redemption less TDS, STT" is a
  // redemption, not a charge, despite mentioning both taxes.
  if (!hasUnits) {
    if (d.includes("stamp duty") || d.includes("stt") || d.includes("tds")) return "tax_or_charge";
    if (d.includes("dividend") || d.includes("idcw")) return "dividend_payout"; // payout moves money, not units
    return d.startsWith("***") ? "misc" : "tax_or_charge";
  }
  if (d.includes("switch") && (d.includes("out") || d.includes(" to "))) return "switch_out";
  if (d.includes("switch") && (d.includes(" in") || d.includes("from"))) return "switch_in";
  if (d.includes("segregat")) return "segregation";
  if ((d.includes("dividend") || d.includes("idcw")) && d.includes("reinvest")) return "dividend_reinvest";
  if (d.includes("dividend") || d.includes("idcw")) return "dividend_payout";
  if (d.includes("redemption") || d.includes("redeem")) return "redemption";
  if (d.includes("systematic") || d.includes("sip")) return "purchase_sip";
  return "purchase";
}

export function parseCasText(lines: string[]): CasParseOk | CasParseError {
  const warnings: string[] = [];
  let periodFrom: string | null = null;
  let periodTo: string | null = null;
  const amcSummary: { amc: string; cost: number; market: number }[] = [];
  let summaryTotal: { cost: number; market: number } | null = null;

  // Pass 1 — statement period and the PORTFOLIO SUMMARY block (also yields the
  // authoritative AMC-name list used to spot AMC section headers in pass 2).
  let inSummary = false;
  for (const line of lines) {
    const pm = PERIOD_RE.exec(line);
    if (pm && !periodFrom) {
      periodFrom = casDateToIso(pm[1]);
      periodTo = casDateToIso(pm[2]);
    }
    if (/^PORTFOLIO SUMMARY$/i.test(line.trim())) {
      inSummary = true;
      continue;
    }
    if (inSummary) {
      const sm = SUMMARY_ROW_RE.exec(line);
      if (sm) {
        const name = sm[1].trim();
        const cost = parseCasNumber(sm[2])!;
        const market = parseCasNumber(sm[3])!;
        if (/^Total$/i.test(name)) {
          summaryTotal = { cost, market };
          inSummary = false;
        } else {
          amcSummary.push({ amc: name, cost, market });
        }
      }
    }
  }

  const amcNames = new Set(amcSummary.map((a) => a.amc));

  // Pass 2 — folio/scheme sections.
  const holdingsByKey = new Map<string, CasHolding>();
  // Nominees are folio-level in a CAS; a line seen before the scheme header is
  // held here and applied to every scheme section of that folio.
  const folioNominees = new Map<string, string[]>();
  let currentAmc = "Unknown AMC";
  let currentFolio: string | null = null;
  let current: CasHolding | null = null;

  const mergeNominees = (target: string[], names: string[]) => {
    for (const n of names) if (!target.includes(n)) target.push(n);
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (amcNames.has(line)) {
      currentAmc = line;
      continue;
    }

    const fm = FOLIO_RE.exec(line);
    if (fm) {
      currentFolio = fm[1].trim();
      current = null; // a scheme header must follow before transactions attach
      continue;
    }

    // Scheme header — may wrap across up to 3 extracted lines before "ISIN:",
    // and the RTA may sit alone on the following line after "Registrar :".
    if (currentFolio && SCHEME_START_RE.test(line) && !TX_BARE_RE.test(line)) {
      let joined = line;
      let consumed = 0;
      while (!/ISIN\s*:/.test(joined) && consumed < 2 && i + consumed + 1 < lines.length) {
        consumed++;
        joined = `${joined} ${lines[i + consumed].trim()}`;
      }
      const sm = SCHEME_RE.exec(joined);
      if (sm) {
        i += consumed;
        let rta: string | null = sm[5] || null;
        if (!rta && i + 1 < lines.length && /^[A-Z]{3,12}$/.test(lines[i + 1].trim())) {
          rta = lines[i + 1].trim();
          i++;
        }
        const isin = sm[3];
        const key = `${currentFolio}::${isin}`;
        const existing = holdingsByKey.get(key);
        if (existing) {
          current = existing; // section continues after a page break — never duplicate
        } else {
          current = {
            folio: currentFolio,
            amc: currentAmc,
            schemeName: sm[2].trim().replace(/\s*-\s*$/, ""),
            isin,
            rta,
            advisor: sm[4]?.trim() || null,
            nominees: [...(folioNominees.get(currentFolio) ?? [])],
            openingUnits: 0,
            closingUnits: 0,
            casNav: null,
            casNavDate: null,
            costValue: null,
            marketValue: null,
            transactions: [],
          };
          holdingsByKey.set(key, current);
        }
      }
      continue;
    }

    if (NOMINEE_SPLIT_RE.test(line)) {
      const names = parseNomineeLine(line);
      if (current) {
        mergeNominees(current.nominees, names);
      }
      if (currentFolio) {
        const pending = folioNominees.get(currentFolio) ?? [];
        mergeNominees(pending, names);
        folioNominees.set(currentFolio, pending);
      }
      continue;
    }

    if (!current) continue;

    const om = OPENING_RE.exec(line);
    if (om) {
      current.openingUnits = parseCasNumber(om[1]) ?? 0;
      continue;
    }
    const cm = CLOSING_RE.exec(line);
    if (cm) {
      current.closingUnits = parseCasNumber(cm[1]) ?? 0;
      current.casNavDate = casDateToIso(cm[2]);
      current.casNav = parseCasNumber(cm[3]);
      current.costValue = parseCasNumber(cm[4]);
      current.marketValue = parseCasNumber(cm[5]);
      current = null; // scheme section closed
      continue;
    }

    if (/^\d{2}-[A-Za-z]{3}-\d{4}\s/.test(line)) {
      const full = TX_FULL_RE.exec(line);
      if (full) {
        const iso = casDateToIso(full[1]);
        const [amount, units, nav, unitBalance] = [full[3], full[4], full[5], full[6]].map(parseCasNumber);
        if (iso && amount !== null && units !== null && nav !== null && unitBalance !== null) {
          current.transactions.push({
            date: iso,
            description: full[2].trim(),
            txType: classifyCasTx(full[2], true),
            amount,
            units,
            nav,
            unitBalance,
          });
          continue;
        }
      }
      const amtOnly = TX_AMOUNT_ONLY_RE.exec(line);
      if (amtOnly) {
        const iso = casDateToIso(amtOnly[1]);
        const amount = parseCasNumber(amtOnly[3]);
        if (iso && amount !== null) {
          current.transactions.push({
            date: iso,
            description: amtOnly[2].trim(),
            txType: classifyCasTx(amtOnly[2], false),
            amount,
            units: null,
            nav: null,
            unitBalance: null,
          });
          continue;
        }
      }
      const bare = TX_BARE_RE.exec(line);
      if (bare) {
        const iso = casDateToIso(bare[1]);
        if (iso) {
          // e.g. "***Invalid Redemption..._Lien documents not received***" — real row, no money moved
          current.transactions.push({
            date: iso,
            description: bare[2].trim(),
            txType: "misc",
            amount: null,
            units: null,
            nav: null,
            unitBalance: null,
          });
          continue;
        }
      }
      warnings.push(`Unparseable dated row (kept out, never coerced): "${line}"`);
    }
  }

  const holdings = [...holdingsByKey.values()];
  if (holdings.length === 0) {
    return {
      ok: false,
      error:
        "No folios found. Is this a DETAILED consolidated account statement (CAMS/KFintech) with transactions?",
    };
  }
  if (!periodFrom || !periodTo) {
    warnings.push("Statement period line not found.");
  }
  return {
    ok: true,
    statement: {
      periodFrom: periodFrom ?? "",
      periodTo: periodTo ?? "",
      amcSummary,
      summaryTotal,
    },
    holdings,
    warnings,
  };
}
