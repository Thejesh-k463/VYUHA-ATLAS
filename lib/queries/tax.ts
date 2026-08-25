import "server-only";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { lossCarryForward, mfHoldings, mfTransactions, taxRates, tradingTrades } from "@/lib/db/schema";
import { DEFAULT_TAX_RATES, resolveRate, type RateRow } from "@/lib/tax/rates";
import {
  classifyEquityTrades,
  classifyMfGains,
  type EquityGainsResult,
  type MfGainsResult,
  type MfHoldingTax,
} from "@/lib/tax/capital-gains";
import { auditVerdict, isFnoSegment, isIntradaySegment, summarizeFno, type AuditConfig, type AuditVerdict, type FnoSummary } from "@/lib/tax/fno";
import { generate112aCsv, validate112aCsv, type S112aViolation } from "@/lib/tax/schedule112a";
import { advanceSchedule, estimateTax, type InstallmentConfig, type InstallmentRow, type TaxEstimate } from "@/lib/tax/advance";
import { fyBounds, fyOf } from "@/lib/tax/fy";
import type { LotTx } from "@/lib/domain/lots";
import { roundPaise } from "@/lib/domain/money";

/** Seed the versioned rate table once; afterwards the TABLE is the authority. */
export function ensureTaxRates(): RateRow[] {
  const db = getDb();
  let rows = db.select().from(taxRates).all();
  if (rows.length === 0) {
    db.transaction((tx) => {
      for (const r of DEFAULT_TAX_RATES) {
        tx.insert(taxRates)
          .values({ key: r.key, effectiveFrom: r.effectiveFrom, value: JSON.stringify(r.value), note: r.note })
          .run();
      }
    });
    rows = db.select().from(taxRates).all();
  }
  return rows.map((r) => ({ key: r.key, effectiveFrom: r.effectiveFrom, value: JSON.parse(r.value) }));
}

function loadMfForTax(): MfHoldingTax[] {
  const db = getDb();
  const holdings = db.select().from(mfHoldings).where(eq(mfHoldings.source, "cas")).all();
  if (holdings.length === 0) return [];
  const txs = db
    .select()
    .from(mfTransactions)
    .where(inArray(mfTransactions.holdingId, holdings.map((h) => h.id)))
    .all();
  const byHolding = new Map<number, LotTx[]>();
  for (const t of txs) {
    const list = byHolding.get(t.holdingId) ?? [];
    list.push({ date: t.date, txType: t.txType as LotTx["txType"], amount: t.amount, units: t.units, nav: t.nav });
    byHolding.set(t.holdingId, list);
  }
  return holdings.map((h) => ({
    isin: h.isin,
    schemeName: h.schemeName,
    assetClass: h.assetClass,
    transactions: byHolding.get(h.id) ?? [],
  }));
}

export interface RateBucketNote {
  bucket: "stcg" | "ltcg";
  note: string;
}

export interface TaxView {
  fy: string;
  fys: string[];
  hasTradeFacts: boolean; // per-trade rows present (re-import needed on old imports)
  mf: MfGainsResult;
  equity: EquityGainsResult;
  fno: FnoSummary & { verdict: AuditVerdict };
  intraday: FnoSummary;
  rates: {
    stcgRatePct: number;
    ltcgRatePct: number;
    ltcgExemption: number;
    slabRatePct: number;
    cessPct: number;
    mixedRateWarnings: string[];
  };
  estimate: TaxEstimate;
  schedule: InstallmentRow[];
  carryForward: { id: number; fy: string; lossType: string; amount: number; note: string | null }[];
  carryCandidates: { lossType: string; amount: number }[];
  rateRows: { key: string; effectiveFrom: string; value: string; note: string | null }[];
}

export function getTaxView(fyWanted?: string): TaxView | null {
  const db = getDb();
  const rateRows = ensureTaxRates();
  const mfHold = loadMfForTax();
  const trades = db.select().from(tradingTrades).where(eq(tradingTrades.source, "vyuha")).all();

  // FY universe: every MF disposal date + every dated trade.
  const fySet = new Set<string>();
  for (const h of mfHold) {
    for (const t of h.transactions) {
      if ((t.txType === "redemption" || t.txType === "switch_out") && t.units !== null && t.units < 0) {
        fySet.add(fyOf(t.date));
      }
    }
  }
  for (const t of trades) {
    const d = t.sellDate || t.buyDate;
    if (d) fySet.add(fyOf(d));
  }
  if (fySet.size === 0 && trades.length === 0 && mfHold.length === 0) return null;
  const fys = [...fySet].sort().reverse();
  const fy = fyWanted && fys.includes(fyWanted) ? fyWanted : (fys[0] ?? fyOf(new Date().toISOString().slice(0, 10)));

  const mf = classifyMfGains(mfHold, fy);
  const equity = classifyEquityTrades(trades, fy);
  const fnoSummary = summarizeFno(trades, fy, isFnoSegment);
  const intraday = summarizeFno(trades, fy, isIntradaySegment);

  // Rates resolve PER SALE DATE. A FY straddling a rate change (2024-25) can mix
  // buckets — netting across different-rate buckets is not automated; warn instead.
  const mixedRateWarnings: string[] = [];
  const pickPct = (key: string, dates: string[], fallbackDate: string): number => {
    const uniq = new Set(
      (dates.length > 0 ? dates : [fallbackDate]).map(
        (d) => ((resolveRate(rateRows, key, d) as { ratePct?: number } | null)?.ratePct ?? 0),
      ),
    );
    if (uniq.size > 1) {
      mixedRateWarnings.push(
        `${key}: sales in this FY straddle a rate change (${[...uniq].join("% / ")}%) — the latest rate is applied to the net; review the split manually.`,
      );
    }
    return Math.max(...uniq);
  };
  const fyEnd = fyBounds(fy).to;
  const stcgDates = [...mf.stcgLegs.map((l) => l.sellDate), ...equity.stcg.map((t) => t.sellDate)];
  const ltcgDates = [...mf.ltcgLegs.map((l) => l.sellDate), ...equity.ltcg.map((t) => t.sellDate)];
  const stcgRatePct = pickPct("equity_stcg", stcgDates, fyEnd);
  const ltcgRatePct = pickPct("equity_ltcg", ltcgDates, fyEnd);
  const ltcgExemption = (resolveRate(rateRows, "equity_ltcg_exemption", fyBounds(fy).from) as { amount: number }).amount;
  const slabRatePct = (resolveRate(rateRows, "slab_assumption", fyEnd) as { ratePct: number }).ratePct;
  const cessPct = (resolveRate(rateRows, "cess", fyEnd) as { ratePct: number }).ratePct;
  const auditCfg = resolveRate(rateRows, "fno_audit", fyEnd) as AuditConfig;
  const advCfg = resolveRate(rateRows, "advance_tax", fyEnd) as InstallmentConfig;

  const stcg111a = roundPaise(mf.stcgTotal + equity.stcgTotal);
  const ltcg112a = roundPaise(mf.ltcgTotal + equity.ltcgTotal);
  const slabIncome = roundPaise(mf.slabTotal + fnoSummary.netPnl + intraday.netPnl);
  const estimate = estimateTax({
    stcg111a,
    ltcg112a,
    slabIncome,
    stcgRatePct,
    ltcgRatePct,
    ltcgExemption,
    slabRatePct,
    cessPct,
  });
  const schedule = advanceSchedule(estimate.total, fy, advCfg);

  const carryForward = db.select().from(lossCarryForward).all();
  const carryCandidates: { lossType: string; amount: number }[] = [];
  if (stcg111a < 0) carryCandidates.push({ lossType: "stcl", amount: -stcg111a });
  if (ltcg112a < 0) carryCandidates.push({ lossType: "ltcl", amount: -ltcg112a });
  if (fnoSummary.netPnl < 0) carryCandidates.push({ lossType: "fno", amount: -fnoSummary.netPnl });
  if (intraday.netPnl < 0) carryCandidates.push({ lossType: "speculative", amount: -intraday.netPnl });

  const rawRates = db.select().from(taxRates).all();
  return {
    fy,
    fys,
    hasTradeFacts: trades.length > 0,
    mf,
    equity,
    fno: { ...fnoSummary, verdict: auditVerdict(fnoSummary, auditCfg) },
    intraday,
    rates: { stcgRatePct, ltcgRatePct, ltcgExemption, slabRatePct, cessPct, mixedRateWarnings },
    estimate,
    schedule,
    carryForward: carryForward.map((c) => ({ id: c.id, fy: c.fy, lossType: c.lossType, amount: c.amount, note: c.note })),
    carryCandidates,
    rateRows: rawRates.map((r) => ({ key: r.key, effectiveFrom: r.effectiveFrom, value: r.value, note: r.note })),
  };
}

/** 112A CSV for the FY — refuses to emit a file its own validator rejects. */
export function get112aCsv(fy: string): { ok: true; csv: string; rows: number } | { ok: false; violations: S112aViolation[] } {
  const mf = classifyMfGains(loadMfForTax(), fy);
  const csv = generate112aCsv(mf.ltcgLegs);
  const violations = validate112aCsv(csv);
  if (violations.length > 0) return { ok: false, violations };
  return { ok: true, csv, rows: mf.ltcgLegs.length };
}

export function addCarryForward(fy: string, lossType: string, amount: number, note: string | null): number {
  const r = getDb()
    .insert(lossCarryForward)
    .values({ fy, lossType, amount, note })
    .returning({ id: lossCarryForward.id })
    .all();
  return r[0].id;
}

export function deleteCarryForward(id: number): void {
  getDb().delete(lossCarryForward).where(eq(lossCarryForward.id, id)).run();
}
