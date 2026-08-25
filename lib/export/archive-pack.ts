// Per-FY archive pack assembly. Pure — no DB, no React, no fs. The route
// gathers query results and this module shapes them into the open-format
// envelope (runtime rupees, stated in the payload — unlike /api/export, which
// dumps raw paise; both state their units so a file read in 2036 explains itself).

import { ayOf, fyBounds } from "@/lib/tax/fy";

export interface ArchiveAccountRow {
  name: string;
  kind: string;
  category: "asset" | "liability";
  owner: string;
  balance: number | null; // rupees; null = unknown, NEVER 0
  balanceDate: string | null;
}

export interface ArchiveMfRow {
  amc: string;
  schemeName: string;
  folio: string;
  isin: string;
  assetClass: string;
  units: number;
  value: number | null; // rupees at latest known NAV; null without one
}

export interface ArchiveTradingPeriodRow {
  period: string; // yyyy-mm
  realizedPnl: number;
  grossPnl: number;
  charges: number;
  tradeCount: number;
}

export interface ArchiveExpenseMonthRow {
  month: string; // yyyy-mm
  spend: number; // positive rupees
  income: number;
}

export interface ArchiveGoalRow {
  name: string;
  targetAmount: number;
  targetDate: string;
  inflatedTarget: number;
  mappedValue: number;
}

export interface ArchiveInsuranceRow {
  kind: string;
  insurer: string;
  policyNo: string;
  sumAssured: number;
  premium: number;
  premiumFrequency: string;
  renewalDate: string;
}

export interface ArchivePackInputs {
  fy: string; // "2025-26"
  generatedAt: string; // ISO
  netWorth: { assets: number; liabilities: number; netWorth: number; unknownCount: number };
  accounts: ArchiveAccountRow[];
  mfHoldings: ArchiveMfRow[];
  tradingPeriodsInFy: ArchiveTradingPeriodRow[];
  /** The FY's tax pack, embedded verbatim (it is already self-describing). */
  tax: unknown;
  expensesMonthly: ArchiveExpenseMonthRow[];
  goals: ArchiveGoalRow[];
  insurance: ArchiveInsuranceRow[];
}

export interface ArchivePack {
  atlasArchive: true;
  v: 1;
  fy: string;
  ay: string;
  fyFrom: string;
  fyTo: string;
  generatedAt: string;
  units: string;
  note: string;
  counts: Record<string, number>;
  totals: {
    tradingRealizedPnlFy: number;
    tradingChargesFy: number;
    expensesSpendFy: number;
    expensesIncomeFy: number;
  };
  netWorth: ArchivePackInputs["netWorth"];
  accounts: ArchiveAccountRow[];
  mfHoldings: ArchiveMfRow[];
  tradingPeriods: ArchiveTradingPeriodRow[];
  tax: unknown;
  expensesMonthly: ArchiveExpenseMonthRow[];
  goals: ArchiveGoalRow[];
  insurance: ArchiveInsuranceRow[];
}

export function buildArchivePack(inp: ArchivePackInputs): ArchivePack {
  if (!/^\d{4}-\d{2}$/.test(inp.fy)) throw new Error(`Not a FY label: ${inp.fy}`);
  const { from, to } = fyBounds(inp.fy);
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  return {
    atlasArchive: true,
    v: 1,
    fy: inp.fy,
    ay: ayOf(inp.fy),
    fyFrom: from,
    fyTo: to,
    generatedAt: inp.generatedAt,
    units: "all money values are RUNTIME RUPEES (not paise)",
    note:
      "Snapshot taken on generatedAt: balances/valuations are as-of that day, not reconstructed to the FY boundary. " +
      "FY-scoped figures (trading periods, expenses, tax) cover only the stated FY.",
    counts: {
      accounts: inp.accounts.length,
      mfHoldings: inp.mfHoldings.length,
      tradingPeriods: inp.tradingPeriodsInFy.length,
      expenseMonths: inp.expensesMonthly.length,
      goals: inp.goals.length,
      insurance: inp.insurance.length,
    },
    totals: {
      tradingRealizedPnlFy: sum(inp.tradingPeriodsInFy.map((p) => p.realizedPnl)),
      tradingChargesFy: sum(inp.tradingPeriodsInFy.map((p) => p.charges)),
      expensesSpendFy: sum(inp.expensesMonthly.map((m) => m.spend)),
      expensesIncomeFy: sum(inp.expensesMonthly.map((m) => m.income)),
    },
    netWorth: inp.netWorth,
    accounts: inp.accounts,
    mfHoldings: inp.mfHoldings,
    tradingPeriods: inp.tradingPeriodsInFy,
    tax: inp.tax,
    expensesMonthly: inp.expensesMonthly,
    goals: inp.goals,
    insurance: inp.insurance,
  };
}
