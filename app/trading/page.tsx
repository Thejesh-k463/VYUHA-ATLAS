import Link from "next/link";
import { formatInr, formatInrCompact } from "@/lib/domain/money";
import { getTradingFacts } from "@/lib/queries/trading";
import { MIN_PLANNING_MONTHS } from "@/lib/analytics/trading-insights";
import { UNDATED_PERIOD } from "@/lib/import/vyuha-envelope";

export const dynamic = "force-dynamic";

const CHARGE_LABELS: Record<string, string> = {
  brokerage: "Brokerage",
  sttCtt: "STT / CTT",
  exchangeTxn: "Exchange txn",
  sebi: "SEBI fees",
  stampDuty: "Stamp duty",
  ipft: "IPFT",
  gst: "GST",
  dpCharges: "DP charges",
  mtfInterest: "MTF interest",
  pledgeCharges: "Pledge charges",
};

function MonthlyBars({ periods }: { periods: { period: string; realizedPnl: number }[] }) {
  const dated = periods.filter((p) => p.period !== UNDATED_PERIOD);
  if (dated.length === 0) return null;
  const max = Math.max(...dated.map((p) => Math.abs(p.realizedPnl)), 1);
  const w = 46;
  const width = dated.length * w;
  const mid = 60;
  return (
    <svg viewBox={`0 0 ${width} 140`} className="h-36 w-full max-w-md" role="img" aria-label="Monthly realized P&L">
      <line x1="0" y1={mid} x2={width} y2={mid} stroke="var(--color-panel-edge)" strokeWidth="1" />
      {dated.map((p, i) => {
        const h = (Math.abs(p.realizedPnl) / max) * 52;
        const up = p.realizedPnl >= 0;
        return (
          <g key={p.period}>
            <rect
              x={i * w + 8}
              y={up ? mid - h : mid}
              width={w - 16}
              height={Math.max(h, 1)}
              rx="2"
              fill={up ? "var(--color-profit)" : "var(--color-loss)"}
            />
            <text x={i * w + w / 2} y={132} textAnchor="middle" fontSize="9" fill="var(--color-ink-soft)">
              {p.period.slice(2)}
            </text>
            <text
              x={i * w + w / 2}
              y={up ? mid - h - 5 : mid + h + 11}
              textAnchor="middle"
              fontSize="8.5"
              fill="var(--color-ink-soft)"
            >
              {formatInrCompact(p.realizedPnl)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export default function TradingPage() {
  const t = getTradingFacts();

  if (!t.imported) {
    return (
      <p className="text-sm text-ink-soft">
        No trading data yet — <Link href="/import" className="text-teal underline">import a VYUHA backup</Link>.
      </p>
    );
  }

  const undated = t.periods.find((p) => p.period === UNDATED_PERIOD);
  const story = t.charges;

  return (
    <div className="space-y-8">
      <section>
        <p className="text-xs uppercase tracking-widest text-ink-soft">Trading book · from VYUHA</p>
        <h1 className="num font-display text-4xl font-semibold">{formatInr(t.equity.equity)}</h1>
        <p className="mt-1 text-sm text-ink-soft">
          {t.equity.hasCapitalBase
            ? `Marked to market from capital set in VYUHA${t.equity.capitalAsOf ? ` (as of ${t.equity.capitalAsOf})` : ""}.`
            : "No capital set in VYUHA — this is cash flows + P&L only. Set capital in VYUHA's Cash screen and re-import for true equity."}
          {t.equity.unpricedOpenCount > 0 && ` ${t.equity.unpricedOpenCount} open position(s) have no MTM price and are not valued here.`}
        </p>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="panel p-5 text-sm">
          <h2 className="mb-3 font-display text-sm font-medium text-violet">How the value is built</h2>
          <dl className="space-y-1.5">
            {t.equity.components.map((c) => (
              <div key={c.label} className="flex justify-between">
                <dt className="text-ink-soft">{c.label}</dt>
                <dd className={`num ${c.label.includes("P&L") ? (c.amount >= 0 ? "text-profit" : "text-loss") : ""}`}>
                  {formatInr(c.amount)}
                </dd>
              </div>
            ))}
            <div className="mt-2 flex justify-between border-t border-panel-edge pt-2 font-medium">
              <dt>Trading book value</dt>
              <dd className="num">{formatInr(t.equity.equity)}</dd>
            </div>
          </dl>
        </div>

        <div className="panel border-l-2 border-l-gold p-5 text-sm">
          <h2 className="mb-3 font-display text-sm font-medium text-gold">The cost of trading</h2>
          <dl className="space-y-1.5">
            <div className="flex justify-between">
              <dt className="text-ink-soft">Gross P&amp;L (before charges)</dt>
              <dd className={`num ${story.gross >= 0 ? "text-profit" : "text-loss"}`}>{formatInr(story.gross)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-soft">Charges &amp; taxes</dt>
              <dd className="num text-gold">−{formatInr(story.charges)}</dd>
            </div>
            <div className="flex justify-between border-t border-panel-edge pt-2 font-medium">
              <dt>Net P&amp;L</dt>
              <dd className={`num ${story.net >= 0 ? "text-profit" : "text-loss"}`}>{formatInr(story.net)}</dd>
            </div>
          </dl>
          {story.chargesToGrossMultiple !== null && story.charges > 0 && (
            <p className="mt-3 text-gold">
              Charges are {story.chargesToGrossMultiple.toFixed(1)}× your gross result
              {story.topCharge &&
                ` — ${CHARGE_LABELS[story.topCharge.chargeType] ?? story.topCharge.chargeType} alone is ${Math.round(story.topCharge.shareOfCharges * 100)}% of them`}
              .
            </p>
          )}
          <table className="mt-3 w-full">
            <tbody>
              {t.chargeRows.map((r) => (
                <tr key={r.chargeType} className="border-t border-panel-edge/40">
                  <td className="py-1 text-ink-soft">{CHARGE_LABELS[r.chargeType] ?? r.chargeType}</td>
                  <td className="num py-1 text-right">{formatInr(r.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {story.chargesAllTrades > story.charges && (
            <p className="mt-2 text-xs text-ink-soft">
              Breakdown totals {formatInr(story.chargesAllTrades)} — it includes {formatInr(story.chargesAllTrades - story.charges)}{" "}
              of entry charges on positions still open, which the waterfall above excludes until they close.
            </p>
          )}
        </div>
      </section>

      <section className="panel p-5 text-sm">
        <h2 className="mb-1 font-display text-sm font-medium text-violet">Monthly rhythm</h2>
        <MonthlyBars periods={t.periods} />
        {undated && (
          <p className="mt-2 text-xs text-gold">
            {formatInr(undated.realizedPnl)} across {undated.tradeCount} trades came from a broker P&amp;L report with no
            trade dates — counted in every total above, absent from the monthly chart. Import a dated tradebook in VYUHA
            to place them in time.
          </p>
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="panel p-5 text-sm">
          <h2 className="mb-3 font-display text-sm font-medium text-violet">Open positions</h2>
          {t.openPositions.length === 0 ? (
            <p className="text-ink-soft">None open.</p>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-ink-soft">
                  <th className="pb-2">Symbol</th>
                  <th className="pb-2 text-right">Invested</th>
                  <th className="pb-2 text-right">Unrealized</th>
                </tr>
              </thead>
              <tbody>
                {t.openPositions.map((o) => (
                  <tr key={o.symbol} className="border-t border-panel-edge/40">
                    <td className="py-1.5">{o.symbol}</td>
                    <td className="num py-1.5 text-right">{formatInrCompact(o.invested)}</td>
                    <td className={`num py-1.5 text-right ${o.unrealizedPnl === null ? "text-ink-soft" : o.unrealizedPnl >= 0 ? "text-profit" : "text-loss"}`}>
                      {o.unrealizedPnl === null ? "—" : formatInr(o.unrealizedPnl)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="panel p-5 text-sm">
          <h2 className="mb-3 font-display text-sm font-medium text-violet">Where the P&amp;L comes from</h2>
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-ink-soft">
                <th className="pb-2">Segment</th>
                <th className="pb-2 text-right">Trades</th>
                <th className="pb-2 text-right">Win rate</th>
                <th className="pb-2 text-right">Net P&amp;L</th>
              </tr>
            </thead>
            <tbody>
              {t.segments.map((s) => (
                <tr key={s.segment} className="border-t border-panel-edge/40">
                  <td className="py-1.5 capitalize">{s.segment.replace(/_/g, " ")}</td>
                  <td className="num py-1.5 text-right">{s.tradeCount}</td>
                  <td className="num py-1.5 text-right">{s.tradeCount > 0 ? `${Math.round((s.wins / s.tradeCount) * 100)}%` : "—"}</td>
                  <td className={`num py-1.5 text-right ${s.realizedPnl >= 0 ? "text-profit" : "text-loss"}`}>
                    {formatInr(s.realizedPnl)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <h2 className="mb-2 mt-6 font-display text-sm font-medium text-violet">In your financial plan</h2>
          {t.planning.sufficient ? (
            <dl className="space-y-1.5">
              <div className="flex justify-between"><dt className="text-ink-soft">Months tracked</dt><dd className="num">{t.planning.monthsTracked}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-soft">Median month</dt><dd className="num">{formatInr(t.planning.medianMonthly!)}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-soft">Worst month</dt><dd className="num text-loss">{formatInr(t.planning.worstMonth!)}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-soft">Planning figure (annual, haircut)</dt><dd className="num">{formatInr(t.planning.planningAnnual!)}</dd></div>
            </dl>
          ) : (
            <p className="text-ink-soft">
              Only {t.planning.monthsTracked} dated month(s) of history — Atlas won&apos;t project trading income from fewer
              than {MIN_PLANNING_MONTHS}. Until then, plan as if trading income is ₹0; anything better is a bonus.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
