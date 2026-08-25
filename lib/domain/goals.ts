// Pure goal math. No DB, no React (invariant 2). Conventions:
// - Rates arrive as % p.a.; monthly compounding uses the EFFECTIVE monthly rate
//   (1+r)^(1/12)−1, so 12%/yr genuinely compounds to 12% over a year.
// - SIP contributions land at month-END (ordinary annuity).
// - Nothing is fabricated: horizons ≤ 0 months return null, never a guess.

export function inflatedTarget(targetToday: number, inflationPct: number, years: number): number {
  if (years <= 0) return targetToday;
  return targetToday * Math.pow(1 + inflationPct / 100, years);
}

export function effectiveMonthlyRate(annualPct: number): number {
  return Math.pow(1 + annualPct / 100, 1 / 12) - 1;
}

export function fvLumpSum(corpus: number, annualPct: number, months: number): number {
  return corpus * Math.pow(1 + effectiveMonthlyRate(annualPct), months);
}

/** Future value of an end-of-month SIP after `months` at the effective monthly rate. */
export function fvSip(monthly: number, annualPct: number, months: number): number {
  const i = effectiveMonthlyRate(annualPct);
  if (i === 0) return monthly * months;
  return (monthly * (Math.pow(1 + i, months) - 1)) / i;
}

/**
 * Monthly saving needed so corpus + SIP reach `target` in `months` at annualPct.
 * 0 when the corpus alone already gets there; null when months <= 0.
 */
export function requiredMonthlySip(
  target: number,
  corpus: number,
  annualPct: number,
  months: number,
): number | null {
  if (months <= 0) return null;
  const need = target - fvLumpSum(corpus, annualPct, months);
  if (need <= 0) return 0;
  const i = effectiveMonthlyRate(annualPct);
  if (i === 0) return need / months;
  return (need * i) / (Math.pow(1 + i, months) - 1);
}

export function monthsBetween(fromIso: string, toIso: string): number {
  const ms = Date.parse(toIso) - Date.parse(fromIso);
  return Math.max(0, Math.round(ms / 86_400_000 / 30.4375)); // mean month length
}
