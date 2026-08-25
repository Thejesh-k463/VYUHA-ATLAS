import Link from "next/link";
import { getGoalsView } from "@/lib/queries/goals";
import { formatInr, formatInrCompact } from "@/lib/domain/money";
import { GoalForm } from "@/components/goals/goal-form";
import { DeleteButton, MappingForm } from "@/components/goals/mapping-controls";

export const dynamic = "force-dynamic";

export default function GoalsPage() {
  const today = new Date().toISOString().slice(0, 10);
  const view = getGoalsView(today);
  const e = view.emergency;

  return (
    <div className="space-y-8">
      <section>
        <h1 className="font-display text-2xl font-semibold">Goals</h1>
        <p className="text-sm text-ink-soft">
          Map what you own to what it&apos;s for. Targets inflate to their date; the Monte Carlo runs
          2,000 seeded paths at your expected return and volatility.
        </p>
      </section>

      <section className="panel p-5">
        <h2 className="mb-3 font-display text-sm font-medium text-violet">Emergency fund</h2>
        {e ? (
          <div className="space-y-2 text-sm">
            <p>
              <span className="num font-display text-2xl">{e.monthsCovered.toFixed(1)}</span>{" "}
              months covered
              <span
                className={`ml-2 ${e.status === "ok" ? "text-profit" : e.status === "watch" ? "text-gold" : "text-loss"}`}
              >
                {e.status === "ok" ? "healthy" : e.status === "watch" ? "getting thin" : "low"}
              </span>
            </p>
            <div className="h-2 max-w-md overflow-hidden rounded bg-ground">
              <div
                className={`h-full ${e.status === "ok" ? "bg-teal-deep" : e.status === "watch" ? "bg-gold" : "bg-loss"}`}
                style={{ width: `${Math.min((e.monthsCovered / e.targetMonths) * 100, 100)}%` }}
              />
            </div>
            <p className="text-xs text-ink-soft">
              Liquid {formatInrCompact(e.liquidValue)} ({view.emergencyBasis.liquidAccounts.join(", ")}) ÷
              median spend {formatInrCompact(e.monthlySpend)}/mo over {view.emergencyBasis.monthsUsed}{" "}
              completed month(s) · target {e.targetMonths} months
            </p>
          </div>
        ) : (
          <p className="text-sm text-ink-soft">
            Can&apos;t gauge yet — it needs a liquid account balance (bank/cash/FD) and at least one
            completed month of spending from{" "}
            <Link href="/import" className="text-teal underline">
              an imported bank statement
            </Link>
            . A made-up burn rate would be worse than none.
          </p>
        )}
      </section>

      {view.goals.map((g) => (
        <section key={g.id} className="panel space-y-3 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-lg font-semibold">{g.name}</h2>
            <DeleteButton url={`/api/goals?id=${g.id}`} label="delete goal" />
          </div>
          <p className="text-sm text-ink-soft">
            {formatInrCompact(g.targetAmount)} today → {formatInrCompact(g.inflatedTarget)} by{" "}
            {g.targetDate} at {g.inflationPct}% inflation · {g.months} months away
          </p>
          <div>
            <div className="mb-1 flex justify-between text-xs">
              <span>
                Mapped {formatInr(g.mappedValue)}
                {g.unknownMappings > 0 && (
                  <span className="text-gold"> (+{g.unknownMappings} mapping(s) without a value)</span>
                )}
              </span>
              <span className="num">{g.progressPct.toFixed(1)}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded bg-ground">
              <div
                className={`h-full ${g.progressPct >= 100 ? "bg-profit" : "bg-teal-deep"}`}
                style={{ width: `${Math.min(g.progressPct, 100)}%` }}
              />
            </div>
          </div>
          <div className="grid gap-2 text-sm sm:grid-cols-3">
            <div>
              <p className="text-xs uppercase tracking-wider text-ink-soft">Required SIP</p>
              <p className="num font-display text-xl">
                {g.requiredSip === null ? "—" : g.requiredSip === 0 ? "funded" : `${formatInr(g.requiredSip)}/mo`}
              </p>
            </div>
            {g.monteCarlo && (
              <>
                <div>
                  <p className="text-xs uppercase tracking-wider text-ink-soft">
                    Success odds (at that SIP)
                  </p>
                  <p
                    className={`num font-display text-xl ${g.monteCarlo.successPct >= 75 ? "text-profit" : g.monteCarlo.successPct >= 50 ? "text-gold" : "text-loss"}`}
                  >
                    {g.monteCarlo.successPct.toFixed(0)}%
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider text-ink-soft">Outcome band (p10–p90)</p>
                  <p className="num text-sm">
                    {formatInrCompact(g.monteCarlo.p10)} · {formatInrCompact(g.monteCarlo.p50)} ·{" "}
                    {formatInrCompact(g.monteCarlo.p90)}
                  </p>
                </div>
              </>
            )}
          </div>
          {g.mappings.length > 0 && (
            <ul className="space-y-1 text-xs">
              {g.mappings.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-2">
                  <span className="truncate">
                    {m.label} · {m.sharePct}% → {m.value === null ? "—" : formatInr(m.value)}
                  </span>
                  <DeleteButton url={`/api/goals/mappings?id=${m.id}`} label="unmap" />
                </li>
              ))}
            </ul>
          )}
          <MappingForm goalId={g.id} options={view.options} />
        </section>
      ))}

      <section className="panel p-5">
        <h2 className="mb-3 font-display text-sm font-medium text-violet">New goal</h2>
        <GoalForm />
      </section>
    </div>
  );
}
