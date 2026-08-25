import { describe, expect, it } from "vitest";
import { buildLots, type LotTx } from "@/lib/domain/lots";

const buy = (date: string, amount: number, units: number, nav: number): LotTx => ({
  date,
  txType: "purchase",
  amount,
  units,
  nav,
});

describe("buildLots (FIFO)", () => {
  it("consumes lots first-in-first-out across a partial lot", () => {
    const ledger = buildLots([
      buy("2022-01-01", 1000, 100, 10),
      buy("2022-06-01", 1000, 50, 20),
      { date: "2023-01-01", txType: "redemption", amount: -1800, units: -120, nav: 15 },
    ]);
    // 120 sold = full first lot (cost 1000) + 20/50 of second (cost 400)
    expect(ledger.realized).toHaveLength(1);
    expect(ledger.realized[0].costConsumed).toBeCloseTo(1400, 2);
    expect(ledger.realized[0].proceeds).toBeCloseTo(1800, 2);
    expect(ledger.realized[0].gain).toBeCloseTo(400, 2);
    expect(ledger.unitsHeld).toBeCloseTo(30, 3);
    expect(ledger.investedCost).toBeCloseTo(600, 2);
    expect(ledger.warnings).toHaveLength(0);
  });

  it("sorts by date regardless of input order", () => {
    const ledger = buildLots([
      { date: "2023-01-01", txType: "redemption", amount: -500, units: -40, nav: 12.5 },
      buy("2022-01-01", 400, 40, 10),
    ]);
    expect(ledger.realized[0].costConsumed).toBeCloseTo(400, 2);
    expect(ledger.unitsHeld).toBeCloseTo(0, 3);
  });

  it("warns on oversell and never fabricates units", () => {
    const ledger = buildLots([
      buy("2022-01-01", 1000, 100, 10),
      { date: "2023-01-01", txType: "redemption", amount: -1650, units: -110, nav: 15 },
    ]);
    expect(ledger.warnings).toHaveLength(1);
    expect(ledger.unitsHeld).toBeCloseTo(0, 3);
    expect(ledger.realized[0].costConsumed).toBeCloseTo(1000, 2);
  });

  it("treats segregated units as zero-cost lots", () => {
    const ledger = buildLots([
      buy("2022-01-01", 1000, 100, 10),
      { date: "2022-03-01", txType: "segregation", amount: null, units: 10, nav: null },
    ]);
    expect(ledger.unitsHeld).toBeCloseTo(110, 3);
    expect(ledger.investedCost).toBeCloseTo(1000, 2);
  });

  it("accumulates tax_or_charge rows without touching lots", () => {
    const ledger = buildLots([
      buy("2022-01-01", 1999.9, 28.909, 69.18),
      { date: "2022-01-01", txType: "tax_or_charge", amount: 0.1, units: null, nav: null },
      { date: "2022-02-01", txType: "tax_or_charge", amount: 0.1, units: null, nav: null },
    ]);
    expect(ledger.chargesTotal).toBeCloseTo(0.2, 2);
    expect(ledger.investedCost).toBeCloseTo(1999.9, 2);
  });

  it("switch out disposes, switch in acquires", () => {
    const ledger = buildLots([
      buy("2022-01-01", 5000, 100, 50),
      { date: "2022-06-01", txType: "switch_out", amount: -2750, units: -50, nav: 55 },
      { date: "2022-06-03", txType: "switch_in", amount: 2750, units: 25, nav: 110 },
    ]);
    expect(ledger.unitsHeld).toBeCloseTo(75, 3);
    expect(ledger.investedCost).toBeCloseTo(2500 + 2750, 2);
    expect(ledger.realized[0].gain).toBeCloseTo(2750 - 2500, 2);
  });

  it("ignores misc rows (invalid redemptions carry no money)", () => {
    const ledger = buildLots([
      buy("2022-01-01", 1000, 100, 10),
      { date: "2023-01-01", txType: "misc", amount: null, units: null, nav: null },
    ]);
    expect(ledger.unitsHeld).toBeCloseTo(100, 3);
    expect(ledger.warnings).toHaveLength(0);
  });
});
