import { describe, expect, it } from "vitest";
import { computePortfolio, externalFlows, type HoldingInput } from "@/lib/analytics/portfolio";
import { computeAllocation, guessAssetClass } from "@/lib/analytics/allocation";
import type { LotTx } from "@/lib/domain/lots";

const sip = (date: string, amount: number, units: number, nav: number): LotTx => ({
  date,
  txType: "purchase_sip",
  amount,
  units,
  nav,
});

function holding(over: Partial<HoldingInput>): HoldingInput {
  return {
    id: 1,
    schemeName: "Test Fund Direct Growth",
    folio: "123 / 0",
    amc: "Test AMC",
    isin: "INF000TEST01",
    assetClass: "equity",
    owner: "self",
    closingUnits: 0,
    transactions: [],
    latestNav: null,
    latestNavDate: null,
    ...over,
  };
}

describe("externalFlows", () => {
  it("negates CAS signs into pocket flows and skips internal legs", () => {
    const flows = externalFlows([
      sip("2022-04-13", 1999.9, 28.909, 69.18),
      { date: "2022-04-13", txType: "tax_or_charge", amount: 0.1, units: null, nav: null },
      { date: "2024-06-19", txType: "redemption", amount: -4070.63, units: -61.238, nav: 66.47 },
      { date: "2023-01-01", txType: "dividend_reinvest", amount: 50, units: 1.2, nav: 41.67 },
      { date: "2023-02-01", txType: "dividend_payout", amount: 75, units: null, nav: null },
    ]);
    expect(flows).toEqual([
      { date: "2022-04-13", amount: -1999.9 },
      { date: "2024-06-19", amount: 4070.63 },
      { date: "2023-02-01", amount: 75 },
    ]);
  });
});

describe("computePortfolio", () => {
  it("values a live SIP holding and cross-checks units against the CAS", () => {
    const h = holding({
      closingUnits: 61.238,
      transactions: [sip("2024-01-10", 2000, 28.909, 69.18), sip("2024-02-12", 2000, 32.329, 61.86)],
      latestNav: 80,
      latestNavDate: "2026-08-24",
    });
    const p = computePortfolio([h]);
    const v = p.holdings[0];
    expect(v.unitsHeld).toBeCloseTo(61.238, 3);
    expect(v.unitsMatchCas).toBe(true);
    expect(v.currentValue).toBeCloseTo(61.238 * 80, 2);
    expect(v.investedCost).toBeCloseTo(4000, 2);
    expect(v.unrealizedGain).toBeCloseTo(61.238 * 80 - 4000, 2);
    expect(v.xirrPct).not.toBeNull();
    expect(v.xirrPct!).toBeGreaterThan(0);
    expect(p.totalValue).toBeCloseTo(61.238 * 80, 2);
    expect(p.xirrPct).not.toBeNull();
  });

  it("renders unknown NAV as null value, never 0 (invariant 6)", () => {
    const h = holding({
      closingUnits: 10,
      transactions: [sip("2024-01-10", 1000, 10, 100)],
      latestNav: null,
    });
    const p = computePortfolio([h]);
    expect(p.holdings[0].currentValue).toBeNull();
    expect(p.holdings[0].unrealizedGain).toBeNull();
    expect(p.unvaluedHoldingCount).toBe(1);
    // XIRR without a terminal value cannot be defined from a lone outflow
    expect(p.holdings[0].xirrPct).toBeNull();
  });

  it("flags a units mismatch against the CAS closing balance", () => {
    const h = holding({
      closingUnits: 99,
      transactions: [sip("2024-01-10", 1000, 10, 100)],
      latestNav: 100,
      latestNavDate: "2026-08-24",
    });
    expect(computePortfolio([h]).holdings[0].unitsMatchCas).toBe(false);
  });

  it("a fully-redeemed holding contributes realized gain and no value", () => {
    const h = holding({
      closingUnits: 0,
      transactions: [
        sip("2022-01-10", 1000, 10, 100),
        { date: "2023-01-10", txType: "redemption", amount: -1500, units: -10, nav: 150 },
      ],
      latestNav: 160,
      latestNavDate: "2026-08-24",
    });
    const p = computePortfolio([h]);
    expect(p.holdings[0].currentValue).toBe(0);
    expect(p.holdings[0].realizedGain).toBeCloseTo(500, 2);
    expect(p.activeCount).toBe(0);
    // XIRR over the closed round-trip: 50% over ~1 year
    expect(p.holdings[0].xirrPct).toBeGreaterThan(40);
  });
});

describe("computeAllocation", () => {
  it("computes mix, drift and alerts against targets", () => {
    const { rows, totalValue } = computeAllocation(
      [
        { assetClass: "equity", currentValue: 80000 },
        { assetClass: "debt", currentValue: 15000 },
        { assetClass: "gold", currentValue: 5000 },
      ],
      [
        { assetClass: "equity", targetPct: 60, driftBandPct: 5 },
        { assetClass: "debt", targetPct: 30, driftBandPct: 5 },
        { assetClass: "gold", targetPct: 10, driftBandPct: 5 },
      ],
    );
    expect(totalValue).toBe(100000);
    const equity = rows.find((r) => r.assetClass === "equity")!;
    expect(equity.actualPct).toBeCloseTo(80, 5);
    expect(equity.driftPct).toBeCloseTo(20, 5);
    expect(equity.alert).toBe(true);
    const gold = rows.find((r) => r.assetClass === "gold")!;
    expect(gold.alert).toBe(false);
  });

  it("shows targeted classes with no holdings and skips unknown-value holdings", () => {
    const { rows } = computeAllocation(
      [{ assetClass: "equity", currentValue: null }],
      [{ assetClass: "debt", targetPct: 40, driftBandPct: 5 }],
    );
    const debt = rows.find((r) => r.assetClass === "debt")!;
    expect(debt.value).toBe(0);
    expect(debt.alert).toBe(true); // 0% vs 40% target is a real drift
  });
});

describe("guessAssetClass", () => {
  it("classifies by scheme-name keywords", () => {
    expect(guessAssetClass("Axis Small Cap Fund Direct Growth")).toBe("equity");
    expect(guessAssetClass("HDFC Liquid Fund - Direct")).toBe("debt");
    expect(guessAssetClass("ICICI Prudential Balanced Advantage Fund")).toBe("hybrid");
    expect(guessAssetClass("SBI Gold Fund")).toBe("gold");
    expect(guessAssetClass("Kotak Corporate Bond Fund")).toBe("debt");
    expect(guessAssetClass("Edelweiss Arbitrage Fund")).toBe("hybrid");
  });
});
