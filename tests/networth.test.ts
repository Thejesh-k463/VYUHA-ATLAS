import { describe, expect, it } from "vitest";
import { computeNetWorth, summarizeTradingFacts } from "@/lib/analytics/networth";

describe("computeNetWorth", () => {
  it("nets assets against liabilities and excludes unknowns", () => {
    const s = computeNetWorth([
      { accountId: 1, name: "HDFC", kind: "bank", category: "asset", owner: "self", balance: 500_000 },
      { accountId: 2, name: "EPF", kind: "epf", category: "asset", owner: "self", balance: 1_200_000 },
      { accountId: 3, name: "Home loan", kind: "loan", category: "liability", owner: "joint", balance: 2_000_000 },
      { accountId: 4, name: "Plot", kind: "property", category: "asset", owner: "self", balance: null },
    ]);
    expect(s.assets).toBe(1_700_000);
    expect(s.liabilities).toBe(2_000_000);
    expect(s.netWorth).toBe(-300_000);
    expect(s.unknownCount).toBe(1);
    expect(s.byKind.find((k) => k.kind === "epf")?.total).toBe(1_200_000);
  });

  it("returns zeros on an empty book, not fabrications", () => {
    const s = computeNetWorth([]);
    expect(s.netWorth).toBe(0);
    expect(s.byKind).toEqual([]);
  });
});

describe("summarizeTradingFacts", () => {
  it("computes trading equity from signed cashflows plus P&L", () => {
    const s = summarizeTradingFacts(
      [
        { period: "2026-06", realizedPnl: 40_000, charges: 3_000, tradeCount: 12 },
        { period: "2026-07", realizedPnl: -15_000, charges: 2_500, tradeCount: 9 },
        { period: "undated", realizedPnl: 5_000, charges: 400, tradeCount: 3 },
      ],
      [
        { type: "deposit", amount: 300_000 },
        { type: "withdrawal", amount: -50_000 }, // VYUHA stores signed amounts
        { type: "dividend", amount: 1_200 },
        { type: "charge", amount: -999 }, // not a cashflow type Atlas counts
      ],
    );
    expect(s.realizedPnlTotal).toBe(30_000); // undated bucket counts toward totals
    expect(s.netDeposits).toBe(250_000);
    expect(s.dividends).toBe(1_200);
    expect(s.tradingEquity).toBe(281_200);
    expect(s.lastPeriod).toBe("2026-07"); // ...but never becomes the latest period
    expect(s.tradeCount).toBe(24);
  });
});
