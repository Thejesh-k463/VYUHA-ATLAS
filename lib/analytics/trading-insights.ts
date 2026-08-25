// Pure planner-side trading intelligence. Everything here is what a FINANCIAL
// PLANNER needs from a trading book — not journal analytics (VYUHA owns those).
// No DB, no React (invariant 2); nothing fabricated (invariant 6).

import { roundPaise } from "@/lib/domain/money";
import { UNDATED_PERIOD } from "@/lib/import/vyuha-envelope";

// ── Mark-to-market trading equity ──────────────────────────────────────────
//
// Accounting identity: capital only changes form (cash ⇄ holdings); value
// changes only through P&L and external flows. So:
//   equity = Σ openingCapital − Σ realisedPnlToDate   (capital base, P&L-free)
//          + realizedPnlTotal + dividends + netDeposits + unrealizedPnl
// Subtracting realisedPnlToDate makes the formula immune to VYUHA's
// `pnlRolledIn` setting: rolled-in P&L sits inside openingCapital AND inside
// realisedPnlToDate, so it cancels instead of double-counting.

export interface EquityInputs {
  capital: { openingCapital: number; realisedPnlToDate: number; asOfDate: string }[];
  realizedPnlTotal: number;
  dividends: number;
  netDeposits: number;
  unrealizedPnl: number; // Σ over open positions with a known MTM (nulls excluded upstream)
  unpricedOpenCount: number; // open positions whose MTM is unknown
}

export interface EquityView {
  hasCapitalBase: boolean;
  capitalBase: number;
  capitalAsOf: string | null;
  equity: number;
  components: { label: string; amount: number }[];
  unpricedOpenCount: number;
}

export function computeTradingEquity(inp: EquityInputs): EquityView {
  const capitalBase = roundPaise(
    inp.capital.reduce((s, c) => s + c.openingCapital - c.realisedPnlToDate, 0),
  );
  const hasCapitalBase = inp.capital.length > 0;
  const equity = roundPaise(
    capitalBase + inp.realizedPnlTotal + inp.dividends + inp.netDeposits + inp.unrealizedPnl,
  );
  const capitalAsOf = inp.capital.map((c) => c.asOfDate).sort().at(-1) ?? null;
  return {
    hasCapitalBase,
    capitalBase,
    capitalAsOf,
    equity,
    components: [
      { label: "Capital set in VYUHA", amount: capitalBase },
      { label: "Net deposits since", amount: inp.netDeposits },
      { label: "Realized P&L", amount: inp.realizedPnlTotal },
      { label: "Dividends", amount: inp.dividends },
      { label: "Unrealized P&L (open)", amount: inp.unrealizedPnl },
    ],
    unpricedOpenCount: inp.unpricedOpenCount,
  };
}

// ── The cost of trading ────────────────────────────────────────────────────

export interface ChargesStory {
  gross: number;
  /** Charges on CLOSED trades — reconciles exactly: gross − charges = net. */
  charges: number;
  net: number;
  /** Σ breakdown (ALL trades — open positions paid entry charges too). */
  chargesAllTrades: number;
  /** charges as a multiple of |gross| — the "your costs are 3× your edge" number. Null when gross ≈ 0. */
  chargesToGrossMultiple: number | null;
  topCharge: { chargeType: string; amount: number; shareOfCharges: number } | null;
}

export function chargesStory(
  gross: number,
  net: number,
  chargesClosed: number,
  breakdown: { chargeType: string; amount: number }[],
): ChargesStory {
  const chargesAllTrades = roundPaise(breakdown.reduce((s, c) => s + c.amount, 0));
  const top = breakdown[0] ?? null;
  return {
    gross,
    charges: chargesClosed,
    net,
    chargesAllTrades,
    chargesToGrossMultiple: Math.abs(gross) >= 1 ? Math.abs(chargesClosed / gross) : null,
    topCharge:
      top && chargesAllTrades > 0
        ? { chargeType: top.chargeType, amount: top.amount, shareOfCharges: top.amount / chargesAllTrades }
        : null,
  };
}

// ── Risk-capital fence ─────────────────────────────────────────────────────
// Planner convention (blueprint §risk layer): trading capital fenced to a slice
// of net worth. Default threshold is a user-tunable convention, not regulation.

export const DEFAULT_TRADING_FENCE_PCT = 25;

export type FenceStatus = "inside" | "watch" | "breached" | "unknown";

export interface FenceView {
  status: FenceStatus;
  tradingSharePct: number | null; // of total assets incl. trading book
  thresholdPct: number;
}

export function riskFence(
  tradingEquity: number,
  nonTradingAssets: number,
  thresholdPct = DEFAULT_TRADING_FENCE_PCT,
): FenceView {
  const total = tradingEquity + nonTradingAssets;
  if (total <= 0 || tradingEquity < 0) return { status: "unknown", tradingSharePct: null, thresholdPct };
  const share = (tradingEquity / total) * 100;
  const status: FenceStatus = share <= thresholdPct ? "inside" : share <= thresholdPct * 1.2 ? "watch" : "breached";
  return { status, tradingSharePct: share, thresholdPct };
}

// ── Planning view of trading income ────────────────────────────────────────
// Trading P&L enters a financial plan as a VOLATILE stream, never a salary.
// Below MIN_PLANNING_MONTHS of dated history we say so instead of extrapolating
// (VYUHA's MIN_SAMPLE ethos). The undated bucket never feeds these stats —
// timing-unknown money cannot describe a monthly distribution.

export const MIN_PLANNING_MONTHS = 6;

export interface PlanningView {
  monthsTracked: number;
  sufficient: boolean;
  medianMonthly: number | null;
  worstMonth: number | null;
  bestMonth: number | null;
  /** Conservative annual figure for goal planning: 12 × min(median, 0) never
   * projects optimism; a positive median is haircut by half. */
  planningAnnual: number | null;
}

export function planningView(periods: { period: string; realizedPnl: number }[]): PlanningView {
  const dated = periods.filter((p) => p.period !== UNDATED_PERIOD).map((p) => p.realizedPnl);
  const monthsTracked = dated.length;
  if (monthsTracked < MIN_PLANNING_MONTHS) {
    return { monthsTracked, sufficient: false, medianMonthly: null, worstMonth: null, bestMonth: null, planningAnnual: null };
  }
  const sorted = [...dated].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return {
    monthsTracked,
    sufficient: true,
    medianMonthly: roundPaise(median),
    worstMonth: sorted[0],
    bestMonth: sorted[sorted.length - 1],
    planningAnnual: roundPaise(median > 0 ? median * 12 * 0.5 : median * 12),
  };
}
