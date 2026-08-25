// Pure parser for the VYUHA backup envelope (BACKUP_VERSION <= 3).
// One-way bridge, journal -> Atlas (AGENTS.md invariant 3).
//
// UNITS — verified against VYUHA source 2026-08-25 (docs/DECISIONS.md):
//   trades.*        money fields arrive in RUPEES  (drizzle moneyPaise custom type)
//   ledger_entries.amountPaise arrives in PAISE    (plain integer column, signed)
// Do not "fix" this symmetry without re-reading VYUHA's schema.

import { z } from "zod";
import { paiseToRupees, roundPaise } from "@/lib/domain/money";

export const SUPPORTED_ENVELOPE_VERSIONS = [1, 2, 3] as const;

const envelopeSchema = z.object({
  vyuhaBackup: z.literal(true),
  version: z.number().int(),
  createdAt: z.string(),
  counts: z.record(z.string(), z.number()),
  tables: z.record(z.string(), z.array(z.unknown())),
});

export type VyuhaEnvelope = z.infer<typeof envelopeSchema>;

const tradeRow = z.looseObject({
  sellDate: z.string().nullish(),
  buyDate: z.string().nullish(),
  netPnl: z.number().nullish(), // rupees
  grossPnl: z.number().nullish(), // rupees
  chargesTotal: z.number().nullish(), // rupees
  isOpen: z.union([z.boolean(), z.number()]).nullish(),
  symbol: z.string().nullish(),
  segment: z.string().nullish(),
  buyValue: z.number().nullish(), // rupees
  sellValue: z.number().nullish(), // rupees
  unrealisedPnl: z.number().nullish(), // rupees
});

// Per-trade statutory charge columns (rupees in the envelope, same moneyPaise rule).
const CHARGE_TYPES = [
  "brokerage",
  "sttCtt",
  "exchangeTxn",
  "sebi",
  "stampDuty",
  "ipft",
  "gst",
  "dpCharges",
  "mtfInterest",
  "pledgeCharges",
] as const;

const capitalRow = z.looseObject({
  bucket: z.string(),
  asOfDate: z.string(),
  openingCapital: z.number(), // REAL column in VYUHA => rupees in the envelope
  realisedPnlToDate: z.number(),
});

const ledgerRow = z.looseObject({
  date: z.string(),
  type: z.string(),
  amountPaise: z.number(), // paise, signed
});

/** Closed trades whose source report carried no trade date (e.g. broker P&L CSVs)
 *  are REAL money and must reach net worth. They aggregate under this period key
 *  rather than a guessed month — timing unknown is stated, not fabricated. */
export const UNDATED_PERIOD = "undated";

export interface TradingPeriodFact {
  period: string; // yyyy-mm, or UNDATED_PERIOD
  realizedPnl: number; // rupees
  grossPnl: number; // rupees
  charges: number; // rupees
  tradeCount: number;
}

export interface TradingSegmentFact {
  segment: string;
  realizedPnl: number;
  charges: number;
  tradeCount: number;
  wins: number;
}

export interface TradingChargeFact {
  chargeType: string;
  amount: number; // rupees, all trades (open positions paid entry charges too)
}

export interface OpenPositionFact {
  symbol: string;
  segment: string;
  invested: number; // remaining entry value (buyValue − sellValue, floored at 0)
  unrealizedPnl: number | null; // null when VYUHA holds no MTM price — never 0
}

export interface TradingCapitalFact {
  bucket: string;
  asOfDate: string;
  openingCapital: number;
  realisedPnlToDate: number;
}

export interface TradingCashflowFact {
  date: string;
  type: "deposit" | "withdrawal" | "dividend" | "dividend_tds" | "other";
  amount: number; // rupees, signed as VYUHA stored it
}

export interface VyuhaTradingFacts {
  envelopeVersion: number;
  envelopeCreatedAt: string;
  periods: TradingPeriodFact[];
  segments: TradingSegmentFact[];
  chargesBreakdown: TradingChargeFact[];
  openPositions: OpenPositionFact[];
  capital: TradingCapitalFact[];
  cashflows: TradingCashflowFact[];
  closedTradeCount: number;
  openTradeCount: number;
  skippedTradeRows: number;
  skippedLedgerRows: number;
}

export type EnvelopeResult =
  | { ok: true; facts: VyuhaTradingFacts }
  | { ok: false; error: string };

const CASHFLOW_TYPES = new Set(["deposit", "withdrawal", "dividend", "dividend_tds"]);

export function parseVyuhaEnvelope(raw: unknown): EnvelopeResult {
  const parsed = envelopeSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Not a VYUHA backup envelope (missing vyuhaBackup/version/tables)." };
  }
  const env = parsed.data;
  if (!SUPPORTED_ENVELOPE_VERSIONS.includes(env.version as 1 | 2 | 3)) {
    return {
      ok: false,
      error: `Envelope version ${env.version} is newer than Atlas understands (max ${Math.max(...SUPPORTED_ENVELOPE_VERSIONS)}). Update Atlas rather than guessing.`,
    };
  }

  const periods = new Map<string, TradingPeriodFact>();
  const segments = new Map<string, TradingSegmentFact>();
  const charges = new Map<string, number>();
  const openPositions: OpenPositionFact[] = [];
  let closedTradeCount = 0;
  let openTradeCount = 0;
  let skippedTradeRows = 0;

  for (const row of env.tables["trades"] ?? []) {
    const t = tradeRow.safeParse(row);
    if (!t.success) {
      skippedTradeRows++;
      continue;
    }
    // Charges are real money spent whether the trade is open or closed.
    for (const c of CHARGE_TYPES) {
      const v = (t.data as Record<string, unknown>)[c];
      if (typeof v === "number" && v !== 0) charges.set(c, roundPaise((charges.get(c) ?? 0) + v));
    }
    const open = t.data.isOpen === true || t.data.isOpen === 1;
    if (open) {
      openTradeCount++;
      openPositions.push({
        symbol: t.data.symbol ?? "(unknown)",
        segment: t.data.segment ?? "unknown",
        invested: roundPaise(Math.max((t.data.buyValue ?? 0) - (t.data.sellValue ?? 0), 0)),
        unrealizedPnl: t.data.unrealisedPnl ?? null, // null = no MTM price, never 0
      });
      continue;
    }
    if (t.data.netPnl == null) {
      // A closed trade without a P&L cannot be valued at all — skip and count,
      // never coerce to zero (invariant 6).
      skippedTradeRows++;
      continue;
    }
    closedTradeCount++;
    const date = t.data.sellDate || t.data.buyDate || null; // "" and null both mean absent
    const period = date ? date.slice(0, 7) : UNDATED_PERIOD;
    const p = periods.get(period) ?? { period, realizedPnl: 0, grossPnl: 0, charges: 0, tradeCount: 0 };
    p.realizedPnl = roundPaise(p.realizedPnl + t.data.netPnl);
    p.grossPnl = roundPaise(p.grossPnl + (t.data.grossPnl ?? 0));
    p.charges = roundPaise(p.charges + (t.data.chargesTotal ?? 0));
    p.tradeCount += 1;
    periods.set(period, p);

    const segKey = t.data.segment ?? "unknown";
    const s = segments.get(segKey) ?? { segment: segKey, realizedPnl: 0, charges: 0, tradeCount: 0, wins: 0 };
    s.realizedPnl = roundPaise(s.realizedPnl + t.data.netPnl);
    s.charges = roundPaise(s.charges + (t.data.chargesTotal ?? 0));
    s.tradeCount += 1;
    if (t.data.netPnl > 0) s.wins += 1;
    segments.set(segKey, s);
  }

  const capital: TradingCapitalFact[] = [];
  for (const row of env.tables["capital_snapshots"] ?? []) {
    const c = capitalRow.safeParse(row);
    if (c.success) {
      capital.push({
        bucket: c.data.bucket,
        asOfDate: c.data.asOfDate,
        openingCapital: c.data.openingCapital,
        realisedPnlToDate: c.data.realisedPnlToDate,
      });
    }
  }

  const cashflows: TradingCashflowFact[] = [];
  let skippedLedgerRows = 0;
  for (const row of env.tables["ledger_entries"] ?? []) {
    const l = ledgerRow.safeParse(row);
    if (!l.success) {
      skippedLedgerRows++;
      continue;
    }
    const type = CASHFLOW_TYPES.has(l.data.type)
      ? (l.data.type as TradingCashflowFact["type"])
      : "other";
    cashflows.push({ date: l.data.date, type, amount: paiseToRupees(l.data.amountPaise) });
  }

  return {
    ok: true,
    facts: {
      envelopeVersion: env.version,
      envelopeCreatedAt: env.createdAt,
      periods: [...periods.values()].sort((a, b) => a.period.localeCompare(b.period)),
      segments: [...segments.values()].sort((a, b) => b.tradeCount - a.tradeCount),
      chargesBreakdown: [...charges.entries()]
        .map(([chargeType, amount]) => ({ chargeType, amount }))
        .sort((a, b) => b.amount - a.amount),
      openPositions,
      capital,
      cashflows,
      closedTradeCount,
      openTradeCount,
      skippedTradeRows,
      skippedLedgerRows,
    },
  };
}
