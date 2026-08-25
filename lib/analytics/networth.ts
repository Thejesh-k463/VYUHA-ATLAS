// Pure net-worth math. Inputs are already-resolved rupee balances; this module
// never touches the DB (invariant 2) and never invents a value (invariant 6).

export interface AccountBalance {
  accountId: number;
  name: string;
  kind: string;
  category: "asset" | "liability";
  owner: string;
  /** Latest known balance in rupees; null = unknown, rendered as "—", excluded from totals. */
  balance: number | null;
}

export interface NetWorthSummary {
  assets: number;
  liabilities: number;
  netWorth: number;
  byKind: { kind: string; category: "asset" | "liability"; total: number; count: number }[];
  unknownCount: number;
}

export function computeNetWorth(rows: AccountBalance[]): NetWorthSummary {
  let assets = 0;
  let liabilities = 0;
  let unknownCount = 0;
  const kinds = new Map<string, { kind: string; category: "asset" | "liability"; total: number; count: number }>();

  for (const r of rows) {
    if (r.balance === null) {
      unknownCount++;
      continue;
    }
    if (r.category === "asset") assets += r.balance;
    else liabilities += r.balance;
    const k = kinds.get(r.kind) ?? { kind: r.kind, category: r.category, total: 0, count: 0 };
    k.total += r.balance;
    k.count += 1;
    kinds.set(r.kind, k);
  }

  return {
    assets,
    liabilities,
    netWorth: assets - liabilities,
    byKind: [...kinds.values()].sort((a, b) => b.total - a.total),
    unknownCount,
  };
}

export interface TradingFactsSummary {
  realizedPnlTotal: number;
  chargesTotal: number;
  tradeCount: number;
  netDeposits: number; // deposits + withdrawals (withdrawals are negative in VYUHA's signed ledger)
  dividends: number;
  /** Capital currently in the trading book: net deposits + realized P&L + dividends. */
  tradingEquity: number;
  lastPeriod: string | null;
}

export function summarizeTradingFacts(
  periods: { period: string; realizedPnl: number; charges: number; tradeCount: number }[],
  cashflows: { type: string; amount: number }[],
): TradingFactsSummary {
  let realizedPnlTotal = 0;
  let chargesTotal = 0;
  let tradeCount = 0;
  let lastPeriod: string | null = null;
  for (const p of periods) {
    realizedPnlTotal += p.realizedPnl;
    chargesTotal += p.charges;
    tradeCount += p.tradeCount;
    // "undated" buckets count toward totals but can never be the latest period.
    if (p.period !== "undated" && (lastPeriod === null || p.period > lastPeriod)) {
      lastPeriod = p.period;
    }
  }
  let netDeposits = 0;
  let dividends = 0;
  for (const c of cashflows) {
    if (c.type === "deposit" || c.type === "withdrawal") netDeposits += c.amount;
    else if (c.type === "dividend" || c.type === "dividend_tds") dividends += c.amount;
  }
  return {
    realizedPnlTotal,
    chargesTotal,
    tradeCount,
    netDeposits,
    dividends,
    tradingEquity: netDeposits + realizedPnlTotal + dividends,
    lastPeriod,
  };
}
