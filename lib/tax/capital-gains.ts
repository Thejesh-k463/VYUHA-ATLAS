// Pure capital-gains classification for one FY. No DB, no React (invariant 2).
//
// MF units: FIFO legs (lib/domain/lots) → per-leg holding period. assetClass
// 'equity' gets s111A/112A treatment (>12 months = LT); everything else
// (debt/gold/other/hybrid) is listed as slab-taxed — hybrid funds vary by
// equity share, and guessing a fund's equity % would be fabrication, so
// non-equity classes are surfaced for the user to reclassify if needed.
//
// Equity delivery trades (VYUHA): ST/LT by buy→sell dates; rows with missing
// dates land in a loud "unclassifiable" bucket, never guessed.

import { roundPaise } from "@/lib/domain/money";
import { buildLots, type LotTx } from "@/lib/domain/lots";
import { fyOf, heldOverMonths } from "@/lib/tax/fy";

export interface MfGainLeg {
  isin: string;
  schemeName: string;
  assetClass: string;
  sellDate: string;
  lotDate: string;
  units: number;
  cost: number;
  proceeds: number;
  gain: number;
  term: "short" | "long";
}

export interface MfHoldingTax {
  isin: string;
  schemeName: string;
  assetClass: string;
  transactions: LotTx[];
}

export interface MfGainsResult {
  stcgLegs: MfGainLeg[]; // equity, <= 12 months
  ltcgLegs: MfGainLeg[]; // equity, > 12 months
  slabLegs: MfGainLeg[]; // non-equity classes (term still computed, taxed at slab)
  stcgTotal: number;
  ltcgTotal: number;
  slabTotal: number;
  warnings: string[];
}

const EQUITY_LT_MONTHS = 12;

export function classifyMfGains(holdings: MfHoldingTax[], fy: string): MfGainsResult {
  const stcgLegs: MfGainLeg[] = [];
  const ltcgLegs: MfGainLeg[] = [];
  const slabLegs: MfGainLeg[] = [];
  const warnings: string[] = [];
  for (const h of holdings) {
    const ledger = buildLots(h.transactions);
    warnings.push(...ledger.warnings.map((w) => `${h.schemeName}: ${w}`));
    for (const ev of ledger.realized) {
      if (fyOf(ev.date) !== fy) continue;
      for (const leg of ev.legs) {
        const term: "short" | "long" = heldOverMonths(leg.lotDate, ev.date, EQUITY_LT_MONTHS)
          ? "long"
          : "short";
        const row: MfGainLeg = {
          isin: h.isin,
          schemeName: h.schemeName,
          assetClass: h.assetClass,
          sellDate: ev.date,
          lotDate: leg.lotDate,
          units: leg.units,
          cost: leg.cost,
          proceeds: leg.proceeds,
          gain: roundPaise(leg.proceeds - leg.cost),
          term,
        };
        if (h.assetClass !== "equity") slabLegs.push(row);
        else if (term === "long") ltcgLegs.push(row);
        else stcgLegs.push(row);
      }
    }
  }
  const sum = (legs: MfGainLeg[]) => roundPaise(legs.reduce((s, l) => s + l.gain, 0));
  return {
    stcgLegs,
    ltcgLegs,
    slabLegs,
    stcgTotal: sum(stcgLegs),
    ltcgTotal: sum(ltcgLegs),
    slabTotal: sum(slabLegs),
    warnings,
  };
}

// ---- Equity delivery trades (from the VYUHA per-trade facts) ----

export interface EquityTradeInput {
  symbol: string;
  segment: string;
  buyDate: string | null;
  sellDate: string | null;
  buyValue: number | null;
  sellValue: number | null;
  grossPnl: number | null;
  netPnl: number;
}

export interface EquityTradeGain {
  symbol: string;
  buyDate: string;
  sellDate: string;
  gain: number; // gross (before charges) when known, else net — flagged
  usedNet: boolean;
  term: "short" | "long";
}

export interface EquityGainsResult {
  stcg: EquityTradeGain[];
  ltcg: EquityTradeGain[];
  stcgTotal: number;
  ltcgTotal: number;
  unclassifiable: { symbol: string; reason: string; netPnl: number }[];
}

/** Segments that are DELIVERY equity (capital gains, not business income). */
export function isDeliverySegment(segment: string): boolean {
  return /delivery|invest/i.test(segment);
}

export function classifyEquityTrades(trades: EquityTradeInput[], fy: string): EquityGainsResult {
  const stcg: EquityTradeGain[] = [];
  const ltcg: EquityTradeGain[] = [];
  const unclassifiable: EquityGainsResult["unclassifiable"] = [];
  for (const t of trades) {
    if (!isDeliverySegment(t.segment)) continue;
    if (!t.sellDate || !t.buyDate) {
      unclassifiable.push({
        symbol: t.symbol,
        reason: !t.sellDate && !t.buyDate ? "no dates (broker P&L import)" : !t.sellDate ? "no sell date" : "no buy date",
        netPnl: t.netPnl,
      });
      continue;
    }
    if (fyOf(t.sellDate) !== fy) continue;
    const gain = t.grossPnl ?? t.netPnl;
    stcg.push({
      symbol: t.symbol,
      buyDate: t.buyDate,
      sellDate: t.sellDate,
      gain,
      usedNet: t.grossPnl === null,
      term: "short",
    });
    const last = stcg[stcg.length - 1];
    if (heldOverMonths(t.buyDate, t.sellDate, EQUITY_LT_MONTHS)) {
      last.term = "long";
      ltcg.push(last);
      stcg.pop();
    }
  }
  const sum = (rows: EquityTradeGain[]) => roundPaise(rows.reduce((s, r) => s + r.gain, 0));
  return { stcg, ltcg, stcgTotal: sum(stcg), ltcgTotal: sum(ltcg), unclassifiable };
}
