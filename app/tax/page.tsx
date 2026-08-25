import Link from "next/link";
import { getTaxView } from "@/lib/queries/tax";
import { ayOf } from "@/lib/tax/fy";
import { formatInr, formatInrCompact } from "@/lib/domain/money";
import { CarryForwardEditor } from "@/components/tax/carryforward-editor";

export const dynamic = "force-dynamic";

function Money({ v }: { v: number }) {
  return <span className={`num ${v > 0 ? "text-profit" : v < 0 ? "text-loss" : ""}`}>{formatInr(v)}</span>;
}

export default async function TaxPage({ searchParams }: { searchParams: Promise<{ fy?: string }> }) {
  const { fy } = await searchParams;
  const view = getTaxView(fy);

  if (!view) {
    return (
      <div className="space-y-6">
        <h1 className="font-display text-2xl font-semibold">Tax</h1>
        <p className="text-sm text-ink-soft">
          Nothing to compute yet — import a{" "}
          <Link href="/import" className="text-teal underline">CAS statement or VYUHA backup</Link> first.
        </p>
      </div>
    );
  }

  const v = view;
  const verdictColor =
    v.fno.verdict.verdict === "audit_required" ? "text-loss"
    : v.fno.verdict.verdict === "audit_likely" ? "text-gold"
    : "text-profit";

  return (
    <div className="space-y-8">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-ink-soft">
            FY {v.fy} · {ayOf(v.fy)} · estimated tax on investment income
          </p>
          <h1 className="num font-display text-5xl font-semibold">{formatInrCompact(v.estimate.total)}</h1>
        </div>
        <nav className="flex gap-2 text-sm">
          {v.fys.map((f) => (
            <Link key={f} href={`/tax?fy=${f}`}
              className={f === v.fy ? "rounded bg-teal-deep px-2 py-1 text-ground" : "px-2 py-1 text-teal hover:underline"}>
              {f}
            </Link>
          ))}
        </nav>
      </section>

      {!v.hasTradeFacts && (
        <p className="rounded border border-panel-edge bg-ground p-3 text-sm text-gold">
          No per-trade facts in the DB — this import predates the tax pack. Re-import your VYUHA
          backup on the <Link href="/import" className="underline">Import screen</Link> to light up
          the F&amp;O and equity panels (replace-by-source makes it safe).
        </p>
      )}
      {v.rates.mixedRateWarnings.map((w) => (
        <p key={w} className="text-xs text-gold">{w}</p>
      ))}

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="panel p-5">
          <h2 className="mb-3 font-display text-sm font-medium text-violet">
            Equity capital gains (MF + delivery)
          </h2>
          <dl className="grid grid-cols-2 gap-y-1.5 text-sm">
            <dt className="text-ink-soft">STCG (s111A) @ {v.rates.stcgRatePct}%</dt>
            <dd className="text-right"><Money v={v.mf.stcgTotal + v.equity.stcgTotal} /></dd>
            <dt className="text-ink-soft">LTCG (s112A) @ {v.rates.ltcgRatePct}%</dt>
            <dd className="text-right"><Money v={v.mf.ltcgTotal + v.equity.ltcgTotal} /></dd>
            <dt className="text-ink-soft">s112A exemption</dt>
            <dd className="num text-right text-ink-soft">{formatInr(v.rates.ltcgExemption)}</dd>
            <dt className="text-ink-soft">Non-equity MF (slab)</dt>
            <dd className="text-right"><Money v={v.mf.slabTotal} /></dd>
          </dl>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
            {(v.mf.ltcgLegs.length > 0) ? (
              <a href={`/api/tax/112a?fy=${v.fy}`} className="rounded bg-teal-deep px-3 py-1.5 text-ground">
                Download Schedule 112A CSV ({v.mf.ltcgLegs.length} rows)
              </a>
            ) : (
              <span className="text-ink-soft">No LTCG legs → no 112A file this FY.</span>
            )}
            <span className="text-ink-soft">MF legs: {v.mf.stcgLegs.length} ST · {v.mf.ltcgLegs.length} LT</span>
          </div>
          {v.equity.unclassifiable.length > 0 && (
            <p className="mt-2 text-xs text-gold">
              {v.equity.unclassifiable.length} delivery trade(s) lack dates and cannot join any FY
              (net {formatInr(v.equity.unclassifiable.reduce((s, u) => s + u.netPnl, 0))}) — from
              broker P&amp;L imports without trade dates.
            </p>
          )}
          {(v.mf.warnings.length > 0) && (
            <p className="mt-2 text-xs text-gold">{v.mf.warnings.join(" · ")}</p>
          )}
        </div>

        <div className="panel p-5">
          <h2 className="mb-3 font-display text-sm font-medium text-violet">F&amp;O business income</h2>
          <dl className="grid grid-cols-2 gap-y-1.5 text-sm">
            <dt className="text-ink-soft">ICAI turnover (Σ |P&amp;L|)</dt>
            <dd className="num text-right">{formatInr(v.fno.turnover)}</dd>
            <dt className="text-ink-soft">Net P&amp;L ({v.fno.tradeCount} trades)</dt>
            <dd className="text-right"><Money v={v.fno.netPnl} /></dd>
            <dt className="text-ink-soft">Charges</dt>
            <dd className="num text-right text-gold">{formatInr(v.fno.charges)}</dd>
            {v.intraday.tradeCount > 0 && (
              <>
                <dt className="text-ink-soft">Intraday (speculative)</dt>
                <dd className="text-right"><Money v={v.intraday.netPnl} /></dd>
              </>
            )}
          </dl>
          <p className={`mt-3 text-sm font-medium ${verdictColor}`}>
            {v.fno.verdict.verdict === "no_activity" ? "No dated F&O activity this FY."
              : v.fno.verdict.verdict === "audit_required" ? "Tax audit: REQUIRED"
              : v.fno.verdict.verdict === "audit_likely" ? "Tax audit: LIKELY — read the reasoning"
              : "Tax audit: not required"}
          </p>
          <ul className="mt-1 space-y-1 text-xs text-ink-soft">
            {v.fno.verdict.reasons.map((r) => <li key={r}>{r}</li>)}
            {v.fno.verdict.assumptions.map((a) => <li key={a}>Assumes: {a}</li>)}
          </ul>
          {(v.fno.undatedCount > 0) && (
            <p className="mt-2 text-xs text-gold">
              {v.fno.undatedCount} undated F&amp;O trade(s) (net {formatInr(v.fno.undatedNetPnl)}) are
              excluded from every FY — timing unknown, never guessed. Fix the dates in VYUHA and re-import.
            </p>
          )}
          {v.fno.usedNetForTurnover > 0 && (
            <p className="mt-1 text-xs text-gold">
              {v.fno.usedNetForTurnover} trade(s) had no gross P&amp;L — |net| used for turnover.
            </p>
          )}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="panel p-5">
          <h2 className="mb-3 font-display text-sm font-medium text-violet">Estimate &amp; advance tax</h2>
          <dl className="grid grid-cols-2 gap-y-1.5 text-sm">
            <dt className="text-ink-soft">STCG tax</dt>
            <dd className="num text-right">{formatInr(v.estimate.stcgTax)}</dd>
            <dt className="text-ink-soft">LTCG tax (on {formatInr(v.estimate.ltcgTaxable)})</dt>
            <dd className="num text-right">{formatInr(v.estimate.ltcgTax)}</dd>
            <dt className="text-ink-soft">Slab bucket @ {v.rates.slabRatePct}% (assumed)</dt>
            <dd className="num text-right">{formatInr(v.estimate.slabTax)}</dd>
            <dt className="text-ink-soft">Cess {v.rates.cessPct}%</dt>
            <dd className="num text-right">{formatInr(v.estimate.cess)}</dd>
            <dt className="font-medium">Total</dt>
            <dd className="num text-right font-medium">{formatInr(v.estimate.total)}</dd>
          </dl>
          {v.schedule.length > 0 ? (
            <table className="mt-3 w-full text-xs">
              <thead>
                <tr className="border-b border-panel-edge text-left text-ink-soft">
                  <th className="py-1 font-normal">Due</th>
                  <th className="py-1 text-right font-normal">Cumulative</th>
                  <th className="py-1 text-right font-normal">Installment</th>
                </tr>
              </thead>
              <tbody>
                {v.schedule.map((s) => (
                  <tr key={s.dueDate} className="border-b border-panel-edge/50 last:border-0">
                    <td className="num py-1">{s.dueDate} ({s.cumulativePct}%)</td>
                    <td className="num py-1 text-right">{formatInr(s.cumulativeDue)}</td>
                    <td className="num py-1 text-right">{formatInr(s.installment)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="mt-3 text-xs text-ink-soft">Below the advance-tax threshold — no installments due.</p>
          )}
          <ul className="mt-2 space-y-1 text-xs text-ink-soft">
            {v.estimate.notes.map((n) => <li key={n}>{n}</li>)}
          </ul>
        </div>

        <div className="panel p-5">
          <h2 className="mb-3 font-display text-sm font-medium text-violet">Loss carry-forward ledger</h2>
          {v.carryCandidates.length > 0 && (
            <p className="mb-2 text-xs text-gold">
              This FY produced losses eligible to carry:{" "}
              {v.carryCandidates.map((c) => `${c.lossType} ${formatInr(c.amount)}`).join(" · ")} — record
              them here once filed.
            </p>
          )}
          <CarryForwardEditor rows={v.carryForward} />
        </div>
      </section>

      <section className="panel p-5">
        <h2 className="mb-3 font-display text-sm font-medium text-violet">Rates in force (versioned, editable in DB)</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-xs">
            <tbody>
              {v.rateRows.map((r) => (
                <tr key={`${r.key}:${r.effectiveFrom}`} className="border-b border-panel-edge/50 last:border-0">
                  <td className="py-1 pr-3 font-medium">{r.key}</td>
                  <td className="num py-1 pr-3">{r.effectiveFrom}</td>
                  <td className="num py-1 pr-3">{r.value}</td>
                  <td className="py-1 text-ink-soft">{r.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-ink-soft">
          Computations read only this table (seeded once, then yours). This screen estimates — it does
          not replace your CA or the portal&apos;s own computation.
        </p>
      </section>
    </div>
  );
}
