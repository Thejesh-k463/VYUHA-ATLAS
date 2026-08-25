// Pure portfolio math: composes the FIFO lot engine and XIRR into per-holding
// and portfolio views. No DB, no React (invariant 2). Inputs are rupee amounts
// already resolved by the query layer; nothing here is ever fabricated —
// missing NAV renders as null, not 0 (invariant 6).

import { buildLots, type LotLedger, type LotTx } from "@/lib/domain/lots";
import { cagr, weightedAcquisitionDate, xirr, yearsBetween, type CashFlow } from "@/lib/analytics/xirr";
import { roundPaise } from "@/lib/domain/money";

export interface HoldingInput {
  id: number;
  schemeName: string;
  folio: string;
  amc: string;
  isin: string;
  assetClass: string;
  owner: string;
  closingUnits: number; // CAS-stated, cross-check for the lot engine
  transactions: LotTx[];
  latestNav: number | null;
  latestNavDate: string | null; // ISO
}

export interface HoldingView {
  id: number;
  schemeName: string;
  folio: string;
  amc: string;
  isin: string;
  assetClass: string;
  owner: string;
  unitsHeld: number;
  investedCost: number; // cost basis of open lots
  latestNav: number | null;
  latestNavDate: string | null;
  currentValue: number | null; // null when no NAV is known — rendered "—"
  unrealizedGain: number | null;
  realizedGain: number;
  chargesTotal: number;
  xirrPct: number | null; // full-history money-weighted return, % p.a.
  heldLotsCagrPct: number | null; // annualized growth of currently-held lots' cost → value
  unitsMatchCas: boolean; // FIFO ledger units == CAS closing units (±0.002)
  warnings: string[];
}

export interface PortfolioView {
  holdings: HoldingView[];
  totalValue: number; // sum over holdings with a known NAV
  totalInvested: number;
  totalUnrealizedGain: number;
  totalRealizedGain: number;
  totalCharges: number;
  valuedHoldingCount: number;
  unvaluedHoldingCount: number;
  xirrPct: number | null; // money-weighted, all external flows + terminal value
  activeCount: number; // holdings with units > 0
}

// External (pocket) cashflows for XIRR. CAS sign convention makes this uniform:
// purchases arrive positive (flow = −amount = outflow), redemptions arrive
// negative (flow = −amount = inflow). Dividend reinvest and segregation move no
// external money; taxes ride inside the printed amounts (see DECISIONS.md).
const FLOW_TYPES: ReadonlySet<string> = new Set([
  "purchase",
  "purchase_sip",
  "switch_in",
  "redemption",
  "switch_out",
]);

export function externalFlows(txs: LotTx[]): CashFlow[] {
  const flows: CashFlow[] = [];
  for (const t of txs) {
    if (t.amount === null) continue;
    if (FLOW_TYPES.has(t.txType)) {
      flows.push({ date: t.date, amount: -t.amount });
    } else if (t.txType === "dividend_payout") {
      flows.push({ date: t.date, amount: Math.abs(t.amount) });
    }
  }
  return flows;
}

function holdingView(h: HoldingInput): { view: HoldingView; ledger: LotLedger; flows: CashFlow[] } {
  const ledger = buildLots(h.transactions);
  const currentValue =
    h.latestNav !== null && ledger.unitsHeld > 0
      ? roundPaise(ledger.unitsHeld * h.latestNav)
      : h.latestNav !== null
        ? 0
        : null;
  const flows = externalFlows(h.transactions);

  let xirrPct: number | null = null;
  if (flows.length > 0) {
    const withTerminal =
      currentValue !== null && currentValue > 0 && h.latestNavDate
        ? [...flows, { date: h.latestNavDate, amount: currentValue }]
        : flows;
    const r = xirr(withTerminal);
    xirrPct = r === null ? null : r * 100;
  }

  let heldLotsCagrPct: number | null = null;
  if (currentValue !== null && currentValue > 0 && h.latestNavDate && ledger.investedCost > 0) {
    const acq = weightedAcquisitionDate(ledger.openLots);
    if (acq) {
      const years = yearsBetween(acq, h.latestNavDate);
      const c = years >= 0.25 ? cagr(ledger.investedCost, currentValue, years) : null; // <3 months annualizes noise
      heldLotsCagrPct = c === null ? null : c * 100;
    }
  }

  return {
    ledger,
    flows,
    view: {
      id: h.id,
      schemeName: h.schemeName,
      folio: h.folio,
      amc: h.amc,
      isin: h.isin,
      assetClass: h.assetClass,
      owner: h.owner,
      unitsHeld: ledger.unitsHeld,
      investedCost: ledger.investedCost,
      latestNav: h.latestNav,
      latestNavDate: h.latestNavDate,
      currentValue,
      unrealizedGain: currentValue === null ? null : roundPaise(currentValue - ledger.investedCost),
      realizedGain: ledger.realizedGainTotal,
      chargesTotal: ledger.chargesTotal,
      xirrPct,
      heldLotsCagrPct,
      unitsMatchCas: Math.abs(ledger.unitsHeld - h.closingUnits) <= 0.002,
      warnings: ledger.warnings,
    },
  };
}

export function computePortfolio(inputs: HoldingInput[]): PortfolioView {
  const holdings: HoldingView[] = [];
  const allFlows: CashFlow[] = [];
  let totalValue = 0;
  let totalInvested = 0;
  let totalRealizedGain = 0;
  let totalCharges = 0;
  let valued = 0;
  let unvalued = 0;
  let latestNavDate: string | null = null;

  for (const input of inputs) {
    const { view, flows } = holdingView(input);
    holdings.push(view);
    allFlows.push(...flows);
    totalInvested = roundPaise(totalInvested + view.investedCost);
    totalRealizedGain = roundPaise(totalRealizedGain + view.realizedGain);
    totalCharges = roundPaise(totalCharges + view.chargesTotal);
    if (view.currentValue !== null) {
      totalValue = roundPaise(totalValue + view.currentValue);
      valued++;
      if (view.latestNavDate && (latestNavDate === null || view.latestNavDate > latestNavDate)) {
        latestNavDate = view.latestNavDate;
      }
    } else if (view.unitsHeld > 0) {
      unvalued++;
    }
  }

  let xirrPct: number | null = null;
  if (allFlows.length > 0) {
    const withTerminal =
      totalValue > 0 && latestNavDate ? [...allFlows, { date: latestNavDate, amount: totalValue }] : allFlows;
    const r = xirr(withTerminal);
    xirrPct = r === null ? null : r * 100;
  }

  holdings.sort((a, b) => (b.currentValue ?? 0) - (a.currentValue ?? 0));
  return {
    holdings,
    totalValue,
    totalInvested,
    totalUnrealizedGain: roundPaise(totalValue - totalInvested),
    totalRealizedGain,
    totalCharges,
    valuedHoldingCount: valued,
    unvaluedHoldingCount: unvalued,
    xirrPct,
    activeCount: holdings.filter((h) => h.unitsHeld > 0.0005).length,
  };
}
