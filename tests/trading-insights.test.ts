import { describe, expect, it } from "vitest";
import {
  chargesStory,
  computeTradingEquity,
  planningView,
  riskFence,
  MIN_PLANNING_MONTHS,
} from "@/lib/analytics/trading-insights";

describe("computeTradingEquity", () => {
  const capital = [
    { openingCapital: 395_000, realisedPnlToDate: 0, asOfDate: "2026-06-19" },
    { openingCapital: 360_000, realisedPnlToDate: 0, asOfDate: "2026-06-19" },
  ];

  it("marks the book to market from the capital base", () => {
    const v = computeTradingEquity({
      capital,
      realizedPnlTotal: -120_900.53,
      dividends: 0,
      netDeposits: 0,
      unrealizedPnl: 6_731.45,
      unpricedOpenCount: 0,
    });
    expect(v.hasCapitalBase).toBe(true);
    expect(v.capitalBase).toBe(755_000);
    expect(v.equity).toBe(640_830.92);
    expect(v.capitalAsOf).toBe("2026-06-19");
  });

  it("is immune to pnlRolledIn double-counting via realisedPnlToDate", () => {
    // VYUHA rolled ₹50k of realized P&L into capital: openingCapital includes it
    // AND realisedPnlToDate records it — subtracting cancels the duplicate.
    const rolled = [{ openingCapital: 445_000, realisedPnlToDate: 50_000, asOfDate: "2026-07-01" }];
    const v = computeTradingEquity({
      capital: rolled,
      realizedPnlTotal: 50_000,
      dividends: 0,
      netDeposits: 0,
      unrealizedPnl: 0,
      unpricedOpenCount: 0,
    });
    expect(v.equity).toBe(445_000); // not 495,000
  });

  it("degrades honestly with no capital base", () => {
    const v = computeTradingEquity({
      capital: [],
      realizedPnlTotal: 10_000,
      dividends: 0,
      netDeposits: 200_000,
      unrealizedPnl: 0,
      unpricedOpenCount: 2,
    });
    expect(v.hasCapitalBase).toBe(false);
    expect(v.equity).toBe(210_000);
    expect(v.unpricedOpenCount).toBe(2);
  });
});

describe("chargesStory", () => {
  it("waterfall reconciles on closed charges; breakdown may exceed it (open entries)", () => {
    const s = chargesStory(-29_739.92, -120_900.53, 91_160.61, [
      { chargeType: "sttCtt", amount: 83_856 },
      { chargeType: "stampDuty", amount: 6_315 },
      { chargeType: "brokerage", amount: 3_961.9 }, // includes open-entry charges
    ]);
    expect(s.charges).toBe(91_160.61);
    expect(s.gross - s.charges).toBeCloseTo(s.net, 2); // the waterfall must add up
    expect(s.chargesAllTrades).toBe(94_132.9);
    expect(s.chargesToGrossMultiple).toBeCloseTo(3.07, 2);
    expect(s.topCharge?.chargeType).toBe("sttCtt");
    expect(s.topCharge?.shareOfCharges).toBeCloseTo(0.89, 2);
  });

  it("returns null multiple when gross is ~0 (no fabricated ratios)", () => {
    expect(chargesStory(0.5, -100, 100, [{ chargeType: "gst", amount: 100 }]).chargesToGrossMultiple).toBeNull();
  });
});

describe("riskFence", () => {
  it("classifies inside / watch / breached", () => {
    expect(riskFence(20_000, 80_000).status).toBe("inside"); // 20%
    expect(riskFence(28_000, 72_000).status).toBe("watch"); // 28%
    expect(riskFence(60_000, 40_000).status).toBe("breached"); // 60%
  });
  it("is unknown with no assets or negative equity", () => {
    expect(riskFence(0, 0).status).toBe("unknown");
    expect(riskFence(-5_000, 100_000).status).toBe("unknown");
  });
});

describe("planningView", () => {
  it("refuses to project below the minimum months", () => {
    const v = planningView([
      { period: "2026-07", realizedPnl: 10_000 },
      { period: "undated", realizedPnl: -99_999 },
    ]);
    expect(v.monthsTracked).toBe(1); // undated never counts
    expect(v.sufficient).toBe(false);
    expect(v.planningAnnual).toBeNull();
  });

  it("uses the median with a 50% haircut on positive expectancy", () => {
    const months = [4_000, 12_000, -6_000, 8_000, 10_000, 2_000].map((v, i) => ({
      period: `2026-0${i + 1}`,
      realizedPnl: v,
    }));
    const v = planningView(months);
    expect(v.monthsTracked).toBe(MIN_PLANNING_MONTHS);
    expect(v.medianMonthly).toBe(6_000); // (4000+8000)/2
    expect(v.worstMonth).toBe(-6_000);
    expect(v.planningAnnual).toBe(36_000); // 6000*12*0.5
  });

  it("never haircuts a negative median upward", () => {
    const months = Array.from({ length: 6 }, (_, i) => ({ period: `2026-0${i + 1}`, realizedPnl: -1_000 }));
    expect(planningView(months).planningAnnual).toBe(-12_000);
  });
});
