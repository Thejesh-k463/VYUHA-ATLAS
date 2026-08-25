import Link from "next/link";
import { getInvestmentsView } from "@/lib/queries/investments";
import { formatInr, formatInrCompact } from "@/lib/domain/money";
import { NavRefresh } from "@/components/investments/nav-refresh";
import { TargetsEditor } from "@/components/investments/targets-editor";
import { HoldingClassSelect } from "@/components/investments/holding-class-select";

export const dynamic = "force-dynamic";

function pct(v: number | null): string {
  return v === null ? "—" : `${v.toFixed(1)}%`;
}

export default function InvestmentsPage() {
  const view = getInvestmentsView();

  if (!view.imported || !view.portfolio) {
    return (
      <div className="space-y-6">
        <h1 className="font-display text-2xl font-semibold">Investments</h1>
        <p className="text-sm text-ink-soft">
          No mutual-fund data yet.{" "}
          <Link href="/import" className="text-teal underline">
            Import a CAS statement
          </Link>{" "}
          (CAMS/KFintech detailed PDF) to map your funds with full SIP history.
        </p>
      </div>
    );
  }

  const p = view.portfolio;
  const active = p.holdings.filter((h) => h.unitsHeld > 0.0005);
  const closed = p.holdings.filter((h) => h.unitsHeld <= 0.0005);
  const mismatches = p.holdings.filter((h) => !h.unitsMatchCas);

  return (
    <div className="space-y-8">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-ink-soft">Mutual funds</p>
          <h1 className="num font-display text-5xl font-semibold">{formatInrCompact(p.totalValue)}</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Invested {formatInrCompact(p.totalInvested)} · Unrealized{" "}
            <span className={p.totalUnrealizedGain >= 0 ? "text-profit" : "text-loss"}>
              {formatInrCompact(p.totalUnrealizedGain)}
            </span>{" "}
            · Realized{" "}
            <span className={p.totalRealizedGain >= 0 ? "text-profit" : "text-loss"}>
              {formatInrCompact(p.totalRealizedGain)}
            </span>
            {" · XIRR "}
            <span className="num">{pct(p.xirrPct)}</span>
          </p>
        </div>
        <NavRefresh navAsOf={view.navAsOf} />
      </section>

      {view.staleIsinCount > 0 && (
        <p className="text-xs text-gold">
          {view.staleIsinCount} held scheme(s) carry an older NAV than the newest — refresh NAVs or
          check the failures list.
        </p>
      )}
      {mismatches.length > 0 && (
        <p className="text-xs text-gold">
          Lot ledger disagrees with the CAS closing units for:{" "}
          {mismatches.map((h) => h.schemeName).join("; ")} — inspect before trusting those figures.
        </p>
      )}

      <section className="panel p-5">
        <h2 className="mb-3 font-display text-sm font-medium text-violet">Holdings</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-panel-edge text-left text-xs uppercase tracking-wider text-ink-soft">
                <th className="py-2 pr-3 font-normal">Scheme</th>
                <th className="py-2 pr-3 text-right font-normal">Units</th>
                <th className="py-2 pr-3 text-right font-normal">Invested</th>
                <th className="py-2 pr-3 text-right font-normal">Value</th>
                <th className="py-2 pr-3 text-right font-normal">Gain</th>
                <th className="py-2 pr-3 text-right font-normal">XIRR</th>
                <th className="py-2 font-normal">Class</th>
              </tr>
            </thead>
            <tbody>
              {active.map((h) => (
                <tr key={h.id} className="border-b border-panel-edge/50 last:border-0">
                  <td className="max-w-72 py-2 pr-3">
                    <span className="block truncate" title={`${h.schemeName} · Folio ${h.folio} · ${h.isin}`}>
                      {h.schemeName}
                    </span>
                    <span className="block text-xs text-ink-soft">
                      {h.amc} · folio {h.folio}
                    </span>
                  </td>
                  <td className="num py-2 pr-3 text-right">{h.unitsHeld.toFixed(3)}</td>
                  <td className="num py-2 pr-3 text-right">{formatInr(h.investedCost)}</td>
                  <td className="num py-2 pr-3 text-right">
                    {h.currentValue === null ? "—" : formatInr(h.currentValue)}
                  </td>
                  <td
                    className={`num py-2 pr-3 text-right ${
                      h.unrealizedGain === null ? "" : h.unrealizedGain >= 0 ? "text-profit" : "text-loss"
                    }`}
                  >
                    {h.unrealizedGain === null ? "—" : formatInr(h.unrealizedGain)}
                  </td>
                  <td className="num py-2 pr-3 text-right">{pct(h.xirrPct)}</td>
                  <td className="py-2">
                    <HoldingClassSelect id={h.id} value={h.assetClass} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {p.unvaluedHoldingCount > 0 && (
          <p className="mt-2 text-xs text-gold">
            {p.unvaluedHoldingCount} holding(s) have no NAV yet — value shown as “—”, never 0.
          </p>
        )}
      </section>

      {closed.length > 0 && (
        <section className="panel p-5">
          <h2 className="mb-3 font-display text-sm font-medium text-violet">Exited schemes</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <tbody>
                {closed.map((h) => (
                  <tr key={h.id} className="border-b border-panel-edge/50 last:border-0">
                    <td className="max-w-80 truncate py-1.5 pr-3" title={h.schemeName}>
                      {h.schemeName}
                    </td>
                    <td className="py-1.5 pr-3 text-xs text-ink-soft">{h.amc}</td>
                    <td
                      className={`num py-1.5 pr-3 text-right ${h.realizedGain >= 0 ? "text-profit" : "text-loss"}`}
                    >
                      {formatInr(h.realizedGain)} realized
                    </td>
                    <td className="num py-1.5 text-right">{pct(h.xirrPct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="panel p-5">
          <h2 className="mb-3 font-display text-sm font-medium text-violet">Allocation</h2>
          {view.allocation && view.allocation.rows.length > 0 ? (
            <table className="w-full text-sm">
              <tbody>
                {view.allocation.rows.map((r) => (
                  <tr key={r.assetClass} className="border-b border-panel-edge/50 last:border-0">
                    <td className="py-1.5 capitalize">{r.assetClass}</td>
                    <td className="num py-1.5 text-right">{formatInrCompact(r.value)}</td>
                    <td className="num py-1.5 text-right">{r.actualPct.toFixed(1)}%</td>
                    <td className="num py-1.5 text-right text-ink-soft">
                      {r.targetPct === null ? "no target" : `target ${r.targetPct.toFixed(0)}%`}
                    </td>
                    <td className={`num py-1.5 text-right ${r.alert ? "text-loss" : "text-ink-soft"}`}>
                      {r.driftPct === null ? "" : `${r.driftPct >= 0 ? "+" : ""}${r.driftPct.toFixed(1)}pp`}
                      {r.alert && " ⚠"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-ink-soft">No valued holdings yet.</p>
          )}
        </div>
        <div className="panel p-5">
          <h2 className="mb-3 font-display text-sm font-medium text-violet">Allocation targets</h2>
          <TargetsEditor initial={view.targets} />
        </div>
      </section>

      {view.batch && (
        <p className="text-xs text-ink-soft">
          CAS: {view.batch.fileName ?? "unnamed"} · imported {view.batch.createdAt} · statement period{" "}
          {String((view.batch.meta as { periodFrom?: string }).periodFrom ?? "?")} →{" "}
          {String((view.batch.meta as { periodTo?: string }).periodTo ?? "?")} · re-importing a newer
          CAS replaces all of this.
        </p>
      )}
    </div>
  );
}
