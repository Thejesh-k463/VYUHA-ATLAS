import { describe, expect, it } from "vitest";
import {
  effectiveMonthlyRate,
  fvLumpSum,
  fvSip,
  inflatedTarget,
  monthsBetween,
  requiredMonthlySip,
} from "@/lib/domain/goals";

// ROADMAP phase 4 gate: goal projections match hand-computed fixtures.

describe("inflatedTarget (hand-computed)", () => {
  it("₹10,00,000 at 6% for 10 years = ₹17,90,847.70", () => {
    // 1.06^10 = 1.7908476965428546
    expect(inflatedTarget(1_000_000, 6, 10)).toBeCloseTo(1_790_847.7, 1);
  });
  it("zero years returns today's target unchanged", () => {
    expect(inflatedTarget(500_000, 6, 0)).toBe(500_000);
  });
});

describe("compounding conventions", () => {
  it("effective monthly rate compounds exactly to the annual rate", () => {
    const i = effectiveMonthlyRate(12);
    expect(Math.pow(1 + i, 12)).toBeCloseTo(1.12, 10);
  });
  it("lump sum: ₹1,00,000 at 12% for 120 months = ₹3,10,584.82 (1.12^10)", () => {
    // hand-computed: 100000 × 1.12^10 = 310,584.82…
    expect(fvLumpSum(100_000, 12, 120)).toBeCloseTo(310_584.82, 1);
  });
});

describe("requiredMonthlySip", () => {
  it("zero-rate case is exact: target/months", () => {
    expect(requiredMonthlySip(120_000, 0, 0, 12)).toBeCloseTo(10_000, 6);
  });
  it("closes the loop: FV(corpus) + FV(sip) reproduces the target to the paisa", () => {
    const target = 2_000_000;
    const corpus = 300_000;
    const months = 96;
    const sip = requiredMonthlySip(target, corpus, 11, months)!;
    expect(sip).toBeGreaterThan(0);
    expect(fvLumpSum(corpus, 11, months) + fvSip(sip, 11, months)).toBeCloseTo(target, 2);
  });
  it("returns 0 when the corpus alone suffices, null on a dead horizon", () => {
    expect(requiredMonthlySip(100_000, 200_000, 8, 60)).toBe(0);
    expect(requiredMonthlySip(100_000, 0, 8, 0)).toBeNull();
  });
});

describe("monthsBetween", () => {
  it("rounds to mean-month lengths and never goes negative", () => {
    expect(monthsBetween("2026-01-01", "2027-01-01")).toBe(12);
    expect(monthsBetween("2026-01-01", "2026-07-01")).toBe(6);
    expect(monthsBetween("2027-01-01", "2026-01-01")).toBe(0);
  });
});
