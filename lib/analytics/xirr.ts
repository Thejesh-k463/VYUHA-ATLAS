// Pure XIRR/CAGR math. No DB, no React (invariant 2).
// Gate (ROADMAP phase 2): XIRR matches known-good fixtures to ±1bp.

export interface CashFlow {
  date: string; // ISO yyyy-mm-dd
  amount: number; // rupees; investments negative, receipts positive
}

const MS_PER_DAY = 86_400_000;
const DAYS_PER_YEAR = 365; // Excel XIRR convention

function yearsBetween(fromIso: string, toIso: string): number {
  return (Date.parse(toIso) - Date.parse(fromIso)) / MS_PER_DAY / DAYS_PER_YEAR;
}

function npv(rate: number, flows: CashFlow[], t0: string): number {
  let sum = 0;
  for (const f of flows) {
    sum += f.amount / Math.pow(1 + rate, yearsBetween(t0, f.date));
  }
  return sum;
}

/**
 * Annualized internal rate of return for dated cashflows (Excel XIRR convention,
 * 365-day years). Newton–Raphson with a bisection fallback; null when the flows
 * cannot define a rate (all same sign, empty, or no root in (-99.99%, 1000%)).
 */
export function xirr(flows: CashFlow[], guess = 0.1): number | null {
  if (flows.length < 2) return null;
  const hasNeg = flows.some((f) => f.amount < 0);
  const hasPos = flows.some((f) => f.amount > 0);
  if (!hasNeg || !hasPos) return null;
  const t0 = flows.reduce((min, f) => (f.date < min ? f.date : min), flows[0].date);

  // Newton–Raphson with a numerical derivative.
  let rate = guess;
  for (let iter = 0; iter < 100; iter++) {
    const v = npv(rate, flows, t0);
    if (Math.abs(v) < 1e-7) return rate;
    const h = 1e-6;
    const dv = (npv(rate + h, flows, t0) - v) / h;
    if (!Number.isFinite(dv) || dv === 0) break;
    const next = rate - v / dv;
    if (!Number.isFinite(next) || next <= -1) break;
    if (Math.abs(next - rate) < 1e-10) return next;
    rate = next;
  }

  // Bisection fallback over a wide bracket.
  let lo = -0.9999;
  let hi = 10;
  let vLo = npv(lo, flows, t0);
  const vHi = npv(hi, flows, t0);
  if (!Number.isFinite(vLo) || !Number.isFinite(vHi) || vLo * vHi > 0) return null;
  for (let iter = 0; iter < 200; iter++) {
    const mid = (lo + hi) / 2;
    const vMid = npv(mid, flows, t0);
    if (Math.abs(vMid) < 1e-7) return mid;
    if (vLo * vMid < 0) {
      hi = mid;
    } else {
      lo = mid;
      vLo = vMid;
    }
  }
  return (lo + hi) / 2;
}

/** Compound annual growth rate begin→end over `years`; null when undefined. */
export function cagr(beginValue: number, endValue: number, years: number): number | null {
  if (beginValue <= 0 || endValue < 0 || years <= 0) return null;
  return Math.pow(endValue / beginValue, 1 / years) - 1;
}

/** Cost-weighted mean acquisition date of open lots — deterministic input for a held-lots CAGR. */
export function weightedAcquisitionDate(lots: { date: string; cost: number }[]): string | null {
  const totalCost = lots.reduce((s, l) => s + l.cost, 0);
  if (totalCost <= 0) return null;
  const meanMs = lots.reduce((s, l) => s + Date.parse(l.date) * (l.cost / totalCost), 0);
  return new Date(meanMs).toISOString().slice(0, 10);
}

export { yearsBetween };
