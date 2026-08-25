// Pure rate resolution over the versioned tax_rates config rows.
// Computations NEVER hardcode a rate — they resolve by key + relevant date
// (ROADMAP phase 5: "rates in a versioned config table, never code").
// The DEFAULT_TAX_RATES below are the one-time SEED for that table; after
// seeding, the table is the authority and the user can correct it.

export interface RateRow {
  key: string;
  effectiveFrom: string; // ISO
  value: unknown; // parsed JSON
}

/** Latest row for `key` with effectiveFrom <= asOf; null when none applies. */
export function resolveRate(rows: RateRow[], key: string, asOf: string): unknown | null {
  let best: RateRow | null = null;
  for (const r of rows) {
    if (r.key !== key || r.effectiveFrom > asOf) continue;
    if (!best || r.effectiveFrom > best.effectiveFrom) best = r;
  }
  return best?.value ?? null;
}

// Seed values — Indian rates as legislated through Finance (No. 2) Act 2024
// (23-Jul-2024 changes included). Sourced once, editable in the table forever.
export const DEFAULT_TAX_RATES: { key: string; effectiveFrom: string; value: unknown; note: string }[] = [
  { key: "equity_ltcg", effectiveFrom: "2018-04-01", value: { ratePct: 10 }, note: "s112A LTCG on STT-paid equity/equity MF" },
  { key: "equity_ltcg", effectiveFrom: "2024-07-23", value: { ratePct: 12.5 }, note: "Finance (No.2) Act 2024" },
  { key: "equity_ltcg_exemption", effectiveFrom: "2018-04-01", value: { amount: 100000 }, note: "s112A exemption per FY" },
  { key: "equity_ltcg_exemption", effectiveFrom: "2024-04-01", value: { amount: 125000 }, note: "1.25L from FY 2024-25" },
  { key: "equity_stcg", effectiveFrom: "2008-04-01", value: { ratePct: 15 }, note: "s111A STCG on STT-paid equity" },
  { key: "equity_stcg", effectiveFrom: "2024-07-23", value: { ratePct: 20 }, note: "Finance (No.2) Act 2024" },
  { key: "cess", effectiveFrom: "2018-04-01", value: { ratePct: 4 }, note: "Health & education cess" },
  {
    key: "fno_audit",
    effectiveFrom: "2023-04-01",
    value: {
      auditTurnover: 100_000_000, // 10Cr: >=95% digital transactions (s44AB proviso)
      presumptiveLimit: 30_000_000, // 3Cr digital, s44AD from FY23-24
      presumptiveRatePct: 6, // digital receipts
    },
    note: "s44AB/s44AD thresholds, digital assumption",
  },
  {
    key: "advance_tax",
    effectiveFrom: "2016-04-01",
    value: {
      threshold: 10000,
      installments: [
        { due: "06-15", cumulativePct: 15 },
        { due: "09-15", cumulativePct: 45 },
        { due: "12-15", cumulativePct: 75 },
        { due: "03-15", cumulativePct: 100 },
      ],
    },
    note: "s208/s211",
  },
  { key: "slab_assumption", effectiveFrom: "2020-04-01", value: { ratePct: 30 }, note: "ASSUMPTION: marginal slab for business income/debt gains — edit to your slab" },
];
