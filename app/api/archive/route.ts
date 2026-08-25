import { NextResponse } from "next/server";
import { buildArchivePack } from "@/lib/export/archive-pack";
import { computeNetWorth } from "@/lib/analytics/networth";
import { fyBounds } from "@/lib/tax/fy";
import { listAccountsWithBalances } from "@/lib/queries/accounts";
import { getInvestmentsView } from "@/lib/queries/investments";
import { getTradingFacts } from "@/lib/queries/trading";
import { getTaxView } from "@/lib/queries/tax";
import { getGoalsView } from "@/lib/queries/goals";
import { recentSpending } from "@/lib/queries/expenses";
import { listPolicies } from "@/lib/queries/protection";

/** Per-FY archive pack: one JSON download bundling the year's figures. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const fy = url.searchParams.get("fy");
  if (!fy || !/^\d{4}-\d{2}$/.test(fy)) {
    return NextResponse.json({ error: "Pass ?fy=YYYY-YY, e.g. ?fy=2025-26" }, { status: 400 });
  }

  const now = new Date();
  const todayIso = now.toISOString().slice(0, 10);
  const { from, to } = fyBounds(fy);
  const fromMonth = from.slice(0, 7);
  const toMonth = to.slice(0, 7);

  const accounts = listAccountsWithBalances();
  const trading = getTradingFacts();
  const inv = getInvestmentsView();

  // Net worth mirrors the Map: derived trading + MF lines join the accounts.
  const derived = [
    ...(trading.imported
      ? [{ accountId: -1, name: "Trading book (VYUHA)", kind: "trading", category: "asset" as const, owner: "self", balance: trading.equity.equity }]
      : []),
    ...(inv.imported && inv.portfolio
      ? [{ accountId: -2, name: "Mutual funds (CAS)", kind: "mutual_fund", category: "asset" as const, owner: "self", balance: inv.portfolio.totalValue }]
      : []),
  ];
  const nw = computeNetWorth([...accounts, ...derived]);

  const pack = buildArchivePack({
    fy,
    generatedAt: now.toISOString(),
    netWorth: { assets: nw.assets, liabilities: nw.liabilities, netWorth: nw.netWorth, unknownCount: nw.unknownCount },
    accounts: accounts.map((a) => ({
      name: a.name,
      kind: a.kind,
      category: a.category,
      owner: a.owner,
      balance: a.balance,
      balanceDate: a.balanceDate,
    })),
    mfHoldings:
      inv.imported && inv.portfolio
        ? inv.portfolio.holdings
            .filter((h) => h.unitsHeld > 0.0005)
            .map((h) => ({
              amc: h.amc,
              schemeName: h.schemeName,
              folio: h.folio,
              isin: h.isin,
              assetClass: h.assetClass,
              units: h.unitsHeld,
              value: h.currentValue,
            }))
        : [],
    tradingPeriodsInFy: trading.periods
      .filter((p) => p.period >= fromMonth && p.period <= toMonth) // "undated" never matches a FY
      .map((p) => ({ period: p.period, realizedPnl: p.realizedPnl, grossPnl: p.grossPnl, charges: p.charges, tradeCount: p.tradeCount })),
    tax: getTaxView(fy),
    expensesMonthly: recentSpending(600)
      .filter((m) => m.month >= fromMonth && m.month <= toMonth)
      .sort((a, b) => a.month.localeCompare(b.month))
      .map((m) => ({ month: m.month, spend: m.spent, income: m.income })),
    goals: getGoalsView(todayIso).goals.map((g) => ({
      name: g.name,
      targetAmount: g.targetAmount,
      targetDate: g.targetDate,
      inflatedTarget: g.inflatedTarget,
      mappedValue: g.mappedValue,
    })),
    insurance: listPolicies(todayIso).map((p) => ({
      kind: p.kind,
      insurer: p.insurer,
      policyNo: p.policyNo,
      sumAssured: p.sumAssured,
      premium: p.premium,
      premiumFrequency: p.premiumFrequency,
      renewalDate: p.renewalDate,
    })),
  });

  return new NextResponse(JSON.stringify(pack, null, 1), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="atlas-archive-FY${fy}-${todayIso}.json"`,
    },
  });
}
