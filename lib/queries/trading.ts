import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  importBatches,
  tradingCapital,
  tradingCashflows,
  tradingCharges,
  tradingOpenPositions,
  tradingPeriods,
  tradingSegments,
} from "@/lib/db/schema";
import type { VyuhaTradingFacts } from "@/lib/import/vyuha-envelope";
import { summarizeTradingFacts } from "@/lib/analytics/networth";
import {
  chargesStory,
  computeTradingEquity,
  planningView,
  type ChargesStory,
  type EquityView,
  type PlanningView,
} from "@/lib/analytics/trading-insights";
import { roundPaise } from "@/lib/domain/money";

const SOURCE = "vyuha";

/** Replace-by-source (docs/DECISIONS.md 2026-08-25): the envelope is a complete
 *  snapshot, so prior vyuha rows are deleted and re-inserted in one transaction. */
export function replaceVyuhaFacts(facts: VyuhaTradingFacts, fileName: string | null): number {
  const db = getDb();
  return db.transaction((tx) => {
    for (const t of [tradingPeriods, tradingCashflows, tradingSegments, tradingCharges, tradingOpenPositions, tradingCapital]) {
      tx.delete(t).where(eq(t.source, SOURCE)).run();
    }
    const batch = tx
      .insert(importBatches)
      .values({
        source: SOURCE,
        fileName,
        meta: JSON.stringify({
          envelopeVersion: facts.envelopeVersion,
          envelopeCreatedAt: facts.envelopeCreatedAt,
          closedTradeCount: facts.closedTradeCount,
          openTradeCount: facts.openTradeCount,
          skippedTradeRows: facts.skippedTradeRows,
          skippedLedgerRows: facts.skippedLedgerRows,
        }),
      })
      .returning({ id: importBatches.id })
      .all();
    const importBatchId = batch[0].id;
    for (const p of facts.periods) {
      tx.insert(tradingPeriods).values({ source: SOURCE, importBatchId, ...p }).run();
    }
    for (const c of facts.cashflows) {
      tx.insert(tradingCashflows).values({ source: SOURCE, importBatchId, ...c }).run();
    }
    for (const s of facts.segments) {
      tx.insert(tradingSegments).values({ source: SOURCE, importBatchId, ...s }).run();
    }
    for (const c of facts.chargesBreakdown) {
      tx.insert(tradingCharges).values({ source: SOURCE, importBatchId, ...c }).run();
    }
    for (const o of facts.openPositions) {
      tx.insert(tradingOpenPositions).values({ source: SOURCE, importBatchId, ...o }).run();
    }
    for (const c of facts.capital) {
      tx.insert(tradingCapital).values({ source: SOURCE, importBatchId, ...c }).run();
    }
    return importBatchId;
  });
}

export interface TradingFactsView {
  imported: boolean;
  equity: EquityView;
  charges: ChargesStory;
  chargeRows: { chargeType: string; amount: number }[];
  planning: PlanningView;
  periods: { period: string; realizedPnl: number; grossPnl: number; charges: number; tradeCount: number }[];
  segments: { segment: string; realizedPnl: number; charges: number; tradeCount: number; wins: number }[];
  openPositions: { symbol: string; segment: string; invested: number; unrealizedPnl: number | null }[];
  realizedPnlTotal: number;
  chargesTotal: number;
  tradeCount: number;
  lastPeriod: string | null;
  netDeposits: number;
  dividends: number;
}

export function getTradingFacts(): TradingFactsView {
  const db = getDb();
  const periods = db.select().from(tradingPeriods).where(eq(tradingPeriods.source, SOURCE)).all();
  const cashflows = db.select().from(tradingCashflows).where(eq(tradingCashflows.source, SOURCE)).all();
  const segments = db.select().from(tradingSegments).where(eq(tradingSegments.source, SOURCE)).all();
  const charges = db.select().from(tradingCharges).where(eq(tradingCharges.source, SOURCE)).all();
  const open = db.select().from(tradingOpenPositions).where(eq(tradingOpenPositions.source, SOURCE)).all();
  const capital = db.select().from(tradingCapital).where(eq(tradingCapital.source, SOURCE)).all();

  const summary = summarizeTradingFacts(periods, cashflows);
  const pricedOpen = open.filter((o) => o.unrealizedPnl !== null);
  const equity = computeTradingEquity({
    capital,
    realizedPnlTotal: summary.realizedPnlTotal,
    dividends: summary.dividends,
    netDeposits: summary.netDeposits,
    unrealizedPnl: roundPaise(pricedOpen.reduce((s, o) => s + (o.unrealizedPnl ?? 0), 0)),
    unpricedOpenCount: open.length - pricedOpen.length,
  });
  const grossTotal = roundPaise(periods.reduce((s, p) => s + p.grossPnl, 0));

  return {
    imported: periods.length > 0 || cashflows.length > 0 || open.length > 0,
    equity,
    charges: chargesStory(grossTotal, summary.realizedPnlTotal, summary.chargesTotal, charges),
    chargeRows: charges
      .map((c) => ({ chargeType: c.chargeType, amount: c.amount }))
      .sort((a, b) => b.amount - a.amount),
    planning: planningView(periods),
    periods: periods.sort((a, b) => a.period.localeCompare(b.period)),
    segments: segments.sort((a, b) => b.tradeCount - a.tradeCount),
    openPositions: open.sort((a, b) => b.invested - a.invested),
    realizedPnlTotal: summary.realizedPnlTotal,
    chargesTotal: summary.chargesTotal,
    tradeCount: summary.tradeCount,
    lastPeriod: summary.lastPeriod,
    netDeposits: summary.netDeposits,
    dividends: summary.dividends,
  };
}
