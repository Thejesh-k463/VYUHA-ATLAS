// Pure seeded Monte Carlo for goal funding. No DB, no React (invariant 2).
// Gate (ROADMAP phase 4): deterministic under a fixed seed — the PRNG is
// mulberry32, no Math.random anywhere.
//
// Model: monthly returns are i.i.d. Normal(mean = annualReturn/12,
// sd = annualVol/√12), SIP lands at month-end. Simple arithmetic Brownian
// convention, recorded in DECISIONS.md — not a market model, a funding gauge.

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box–Muller: two uniforms → one standard normal. */
function gaussian(rng: () => number): number {
  let u = 0;
  while (u === 0) u = rng(); // avoid log(0)
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export interface MonteCarloInput {
  corpus: number;
  monthlySip: number;
  months: number;
  annualReturnPct: number;
  annualVolPct: number;
  target: number;
  sims?: number; // default 2000
  seed: number;
}

export interface MonteCarloResult {
  successPct: number; // share of paths with final corpus >= target
  p10: number;
  p50: number;
  p90: number;
  sims: number;
}

export function simulateGoal(input: MonteCarloInput): MonteCarloResult | null {
  const { corpus, monthlySip, months, annualReturnPct, annualVolPct, target, seed } = input;
  const sims = input.sims ?? 2000;
  if (months <= 0 || sims <= 0) return null;
  const meanM = annualReturnPct / 100 / 12;
  const sdM = annualVolPct / 100 / Math.sqrt(12);
  const rng = mulberry32(seed);
  const finals = new Array<number>(sims);
  let successes = 0;
  for (let s = 0; s < sims; s++) {
    let value = corpus;
    for (let m = 0; m < months; m++) {
      const r = meanM + sdM * gaussian(rng);
      value = Math.max(0, value * (1 + r)) + monthlySip;
    }
    finals[s] = value;
    if (value >= target) successes++;
  }
  finals.sort((a, b) => a - b);
  const pct = (p: number) => finals[Math.min(sims - 1, Math.max(0, Math.floor((p / 100) * sims)))];
  return {
    successPct: (successes / sims) * 100,
    p10: pct(10),
    p50: pct(50),
    p90: pct(90),
    sims,
  };
}
