import { describe, expect, it } from "vitest";
import { cagr, weightedAcquisitionDate, xirr } from "@/lib/analytics/xirr";

// ROADMAP phase 2 gate: XIRR against known-good fixtures to ±1bp (0.0001).
const BP = 0.0001;

describe("xirr", () => {
  it("matches the Microsoft-documented XIRR example to ±1bp", () => {
    // Excel docs: XIRR({-10000,2750,4250,3250,2750}, {1/1/08,3/1/08,10/30/08,2/15/09,4/1/09}) = 0.373362535
    const r = xirr([
      { date: "2008-01-01", amount: -10000 },
      { date: "2008-03-01", amount: 2750 },
      { date: "2008-10-30", amount: 4250 },
      { date: "2009-02-15", amount: 3250 },
      { date: "2009-04-01", amount: 2750 },
    ]);
    expect(r).not.toBeNull();
    expect(Math.abs(r! - 0.373362535)).toBeLessThan(BP);
  });

  it("matches the analytic two-flow case exactly (730 days at 10% p.a.)", () => {
    // -1000 → +1210 after exactly 2 × 365 days: (1.21)^(1/2) − 1 = 0.1
    const r = xirr([
      { date: "2020-01-01", amount: -1000 },
      { date: "2021-12-31", amount: 1210 },
    ]);
    expect(Math.abs(r! - 0.1)).toBeLessThan(BP);
  });

  it("handles negative returns (analytic: −10% over exactly one 365-day year)", () => {
    const r = xirr([
      { date: "2021-01-01", amount: -1000 },
      { date: "2022-01-01", amount: 900 },
    ]);
    expect(Math.abs(r! - -0.1)).toBeLessThan(BP);
  });

  it("returns null when flows cannot define a rate", () => {
    expect(xirr([])).toBeNull();
    expect(xirr([{ date: "2022-01-01", amount: -100 }])).toBeNull();
    expect(
      xirr([
        { date: "2022-01-01", amount: -100 },
        { date: "2023-01-01", amount: -200 },
      ]),
    ).toBeNull();
  });

  it("survives a steep-loss portfolio via the bisection fallback", () => {
    // −50% in a month annualizes to ≈ −99.97% — Newton diverges here, bisection must land it.
    const r = xirr([
      { date: "2022-01-01", amount: -10000 },
      { date: "2022-02-01", amount: 5000 },
    ]);
    expect(r).not.toBeNull();
    expect(r!).toBeLessThan(-0.9);
    expect(r!).toBeGreaterThan(-1);
    // A total-wipeout rate steeper than the −99.99% bracket is honestly null, not guessed.
    expect(
      xirr([
        { date: "2022-01-01", amount: -10000 },
        { date: "2022-02-01", amount: 100 },
      ]),
    ).toBeNull();
  });
});

describe("cagr", () => {
  it("computes the textbook case", () => {
    expect(Math.abs(cagr(1000, 1210, 2)! - 0.1)).toBeLessThan(BP);
  });
  it("refuses degenerate inputs instead of fabricating", () => {
    expect(cagr(0, 100, 1)).toBeNull();
    expect(cagr(100, 200, 0)).toBeNull();
    expect(cagr(-5, 100, 1)).toBeNull();
  });
});

describe("weightedAcquisitionDate", () => {
  it("is the lot date for a single lot", () => {
    expect(weightedAcquisitionDate([{ date: "2023-04-15", cost: 5000 }])).toBe("2023-04-15");
  });
  it("weights by cost", () => {
    // 75% of cost on day 0, 25% on day 100 → mean at day 25
    const d = weightedAcquisitionDate([
      { date: "2023-01-01", cost: 7500 },
      { date: "2023-04-11", cost: 2500 },
    ]);
    expect(d).toBe("2023-01-26");
  });
  it("returns null with no cost", () => {
    expect(weightedAcquisitionDate([])).toBeNull();
    expect(weightedAcquisitionDate([{ date: "2023-01-01", cost: 0 }])).toBeNull();
  });
});
