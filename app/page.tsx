import Link from "next/link";
import { computeNetWorth } from "@/lib/analytics/networth";
import { riskFence } from "@/lib/analytics/trading-insights";
import { formatInrCompact, formatInr } from "@/lib/domain/money";
import { listAccountsWithBalances } from "@/lib/queries/accounts";
import { getMfBookValue } from "@/lib/queries/investments";
import { getTradingFacts } from "@/lib/queries/trading";

export const dynamic = "force-dynamic";

export default function MapPage() {
  const rows = listAccountsWithBalances();
  const trading = getTradingFacts();
  const mfBook = getMfBookValue();

  // Trading and MF books join net worth as derived asset lines when imported.
  const derived = [
    ...(trading.imported
      ? [
          {
            accountId: -1,
            name: "Trading book (VYUHA)",
            kind: "trading",
            category: "asset" as const,
            owner: "self",
            balance: trading.equity.equity,
          },
        ]
      : []),
    ...(mfBook
      ? [
          {
            accountId: -2,
            name: "Mutual funds (CAS)",
            kind: "mutual_fund",
            category: "asset" as const,
            owner: "self",
            balance: mfBook.value,
          },
        ]
      : []),
  ];
  const withDerived = [...rows, ...derived];
  const summary = computeNetWorth(withDerived);
  const nonTradingAssets = computeNetWorth([...rows, ...derived.filter((d) => d.kind !== "trading")]).assets;
  const fence = trading.imported ? riskFence(trading.equity.equity, nonTradingAssets) : null;

  return (
    <div className="space-y-8">
      <section>
        <p className="text-xs uppercase tracking-widest text-ink-soft">Net worth</p>
        <h1 className="num font-display text-5xl font-semibold">{formatInrCompact(summary.netWorth)}</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Assets {formatInrCompact(summary.assets)} · Liabilities {formatInrCompact(summary.liabilities)}
          {summary.unknownCount > 0 && ` · ${summary.unknownCount} account(s) without a balance`}
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="panel p-5">
          <h2 className="mb-3 font-display text-sm font-medium text-violet">By asset class</h2>
          {summary.byKind.length === 0 ? (
            <p className="text-sm text-ink-soft">
              Nothing mapped yet. <Link href="/accounts" className="text-teal underline">Add your first account</Link>.
            </p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {summary.byKind.map((k) => (
                  <tr key={k.kind} className="border-b border-panel-edge/50 last:border-0">
                    <td className="py-1.5 capitalize">{k.kind.replace("_", " ")}</td>
                    <td className="py-1.5 text-right text-ink-soft">{k.count}</td>
                    <td className={`num py-1.5 text-right ${k.category === "liability" ? "text-loss" : ""}`}>
                      {formatInrCompact(k.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="panel p-5">
          <h2 className="mb-3 font-display text-sm font-medium text-violet">
            <Link href="/trading" className="hover:text-teal">Trading book →</Link>
          </h2>
          {!trading.imported ? (
            <p className="text-sm text-ink-soft">
              No journal data yet. <Link href="/import" className="text-teal underline">Import a VYUHA backup</Link>.
            </p>
          ) : (
            <div className="space-y-3 text-sm">
              <p className="num font-display text-2xl">{formatInr(trading.equity.equity)}</p>
              <dl className="grid grid-cols-2 gap-y-1.5">
                <dt className="text-ink-soft">Realized P&amp;L</dt>
                <dd className={`num text-right ${trading.realizedPnlTotal >= 0 ? "text-profit" : "text-loss"}`}>
                  {formatInr(trading.realizedPnlTotal)}
                </dd>
                <dt className="text-ink-soft">Charges paid</dt>
                <dd className="num text-right text-gold">{formatInr(trading.charges.charges)}</dd>
                <dt className="text-ink-soft">Open positions</dt>
                <dd className="num text-right">{trading.openPositions.length}</dd>
              </dl>
              {fence && fence.tradingSharePct !== null && (
                <div>
                  <div className="mb-1 flex justify-between text-xs text-ink-soft">
                    <span>Trading share of assets</span>
                    <span className={fence.status === "breached" ? "text-loss" : fence.status === "watch" ? "text-gold" : "text-profit"}>
                      {fence.tradingSharePct.toFixed(0)}% (fence {fence.thresholdPct}%)
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded bg-ground">
                    <div
                      className={`h-full ${fence.status === "breached" ? "bg-loss" : fence.status === "watch" ? "bg-gold" : "bg-teal-deep"}`}
                      style={{ width: `${Math.min(fence.tradingSharePct, 100)}%` }}
                    />
                  </div>
                  {fence.status === "breached" && (
                    <p className="mt-1 text-xs text-loss">
                      Most of your mapped wealth is trading capital — add your other assets, or that is genuinely the risk picture.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
