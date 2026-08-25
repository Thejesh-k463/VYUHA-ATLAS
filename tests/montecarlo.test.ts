import { describe, expect, it } from "vitest";
import { mulberry32, simulateGoal } from "@/lib/analytics/montecarlo";
import { fvLumpSum, fvSip } from "@/lib/domain/goals";

// ROADMAP phase 4 gate: Monte Carlo deterministic under a fixed seed.

const BASE = {
  corpus: 300_000,
  monthlySip: 10_000,
  months: 120,
  annualReturnPct: 11,
  annualVolPct: 14,
  target: 2_500_000,
  sims: 500,
  seed: 42,
};

describe("simulateGoal determinism (gate)", () => {
  it("identical seed → byte-identical result", () => {
    expect(simulateGoal(BASE)).toEqual(simulateGoal(BASE));
  });
  it("different seed → different paths", () => {
    const a = simulateGoal(BASE)!;
    const b = simulateGoal({ ...BASE, seed: 43 })!;
    expect(a.p50).not.toBe(b.p50);
  });
});

describe("simulateGoal sanity", () => {
  it("zero volatility collapses to the deterministic FV (monthly-simple mean)", () => {
    // With sd=0 every path is identical: value grows at exactly mean/12 per month.
    const r = simulateGoal({ ...BASE, annualVolPct: 0, sims: 10 })!;
    expect(r.p10).toBeCloseTo(r.p90, 6);
    // reachable target → 100%; impossible target → 0%
    expect(simulateGoal({ ...BASE, annualVolPct: 0, target: 1, sims: 10 })!.successPct).toBe(100);
    expect(
      simulateGoal({ ...BASE, annualVolPct: 0, target: 1e12, sims: 10 })!.successPct,
    ).toBe(0);
  });
  it("percentiles are ordered and success rises with a lower target", () => {
    const r = simulateGoal(BASE)!;
    expect(r.p10).toBeLessThanOrEqual(r.p50);
    expect(r.p50).toBeLessThanOrEqual(r.p90);
    const easier = simulateGoal({ ...BASE, target: 1_500_000 })!;
    expect(easier.successPct).toBeGreaterThan(r.successPct);
  });
  it("median lands in the same region as the deterministic projection", () => {
    // Not an equality — vol drags the median below the mean — but the same order of magnitude.
    const det = fvLumpSum(BASE.corpus, 11, 120) + fvSip(BASE.monthlySip, 11, 120);
    const r = simulateGoal({ ...BASE, sims: 2000 })!;
    expect(r.p50).toBeGreaterThan(det * 0.6);
    expect(r.p50).toBeLessThan(det * 1.4);
  });
  it("refuses dead horizons", () => {
    expect(simulateGoal({ ...BASE, months: 0 })).toBeNull();
  });
});

describe("mulberry32", () => {
  it("is deterministic and uniform-ish in [0,1)", () => {
    const a = mulberry32(7);
    const b = mulberry32(7);
    const seqA = [a(), a(), a()];
    const seqB = [b(), b(), b()];
    expect(seqA).toEqual(seqB);
    expect(seqA.every((x) => x >= 0 && x < 1)).toBe(true);
  });
});
