import { describe, expect, it } from "vitest";
import { buildArchivePack, type ArchivePackInputs } from "@/lib/export/archive-pack";

const INPUTS: ArchivePackInputs = {
  fy: "2025-26",
  generatedAt: "2026-08-26T10:00:00.000Z",
  netWorth: { assets: 1331000, liabilities: 0, netWorth: 1331000, unknownCount: 1 },
  accounts: [
    { name: "SBI Savings", kind: "bank", category: "asset", owner: "self", balance: 239556.07, balanceDate: "2025-06-24" },
    { name: "EPF", kind: "epf", category: "asset", owner: "self", balance: null, balanceDate: null },
  ],
  mfHoldings: [
    { amc: "Alpha", schemeName: "Alpha Small Cap", folio: "910/0", isin: "INF846K01K35", assetClass: "equity", units: 100.5, value: 25000 },
  ],
  tradingPeriodsInFy: [
    { period: "2025-04", realizedPnl: -1000.25, grossPnl: -800, charges: 200.25, tradeCount: 3 },
    { period: "2025-05", realizedPnl: 500.5, grossPnl: 700.5, charges: 200, tradeCount: 2 },
  ],
  tax: { fy: "2025-26", ltcg: 14400 },
  expensesMonthly: [
    { month: "2025-04", spend: 40000, income: 90000 },
    { month: "2025-05", spend: 42000.5, income: 90000 },
  ],
  goals: [{ name: "House", targetAmount: 1000000, targetDate: "2036-08-01", inflatedTarget: 1790847.7, mappedValue: 760608.96 }],
  insurance: [
    { kind: "life", insurer: "LIC", policyNo: "12345", sumAssured: 5000000, premium: 25000, premiumFrequency: "yearly", renewalDate: "2027-03-01" },
  ],
};

describe("buildArchivePack", () => {
  const pack = buildArchivePack(INPUTS);

  it("propagates FY totals and counts exactly", () => {
    expect(pack.fy).toBe("2025-26");
    expect(pack.ay).toBe("AY 2026-27");
    expect(pack.fyFrom).toBe("2025-04-01");
    expect(pack.fyTo).toBe("2026-03-31");
    expect(pack.counts).toEqual({ accounts: 2, mfHoldings: 1, tradingPeriods: 2, expenseMonths: 2, goals: 1, insurance: 1 });
    expect(pack.totals.tradingRealizedPnlFy).toBeCloseTo(-499.75, 2);
    expect(pack.totals.tradingChargesFy).toBeCloseTo(400.25, 2);
    expect(pack.totals.expensesSpendFy).toBeCloseTo(82000.5, 2);
    expect(pack.totals.expensesIncomeFy).toBe(180000);
  });

  it("keeps unknown balances null and embeds the tax pack verbatim", () => {
    expect(pack.accounts[1].balance).toBeNull();
    expect(pack.tax).toEqual({ fy: "2025-26", ltcg: 14400 });
    expect(pack.units).toContain("RUPEES");
  });

  it("refuses a non-FY label instead of guessing", () => {
    expect(() => buildArchivePack({ ...INPUTS, fy: "2025" })).toThrow();
  });
});
