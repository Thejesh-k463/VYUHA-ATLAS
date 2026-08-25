import Link from "next/link";
import { getExpensesView, listRules } from "@/lib/queries/expenses";
import { formatInr, formatInrCompact } from "@/lib/domain/money";
import { TxCategorySelect } from "@/components/expenses/tx-category-select";
import { RulesEditor } from "@/components/expenses/rules-editor";
import { BudgetsEditor } from "@/components/expenses/budgets-editor";

export const dynamic = "force-dynamic";

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month } = await searchParams;
  const view = getExpensesView(month);
  const rules = listRules();

  if (!view.imported) {
    return (
      <div className="space-y-6">
        <h1 className="font-display text-2xl font-semibold">Expenses</h1>
        <p className="text-sm text-ink-soft">
          No bank transactions yet.{" "}
          <Link href="/import" className="text-teal underline">
            Import a bank statement CSV
          </Link>{" "}
          to see spending, budgets and recurring commitments.
        </p>
      </div>
    );
  }

  const s = view.summary!;
  const mi = view.months.indexOf(view.month);
  const newer = mi > 0 ? view.months[mi - 1] : null;
  const older = mi < view.months.length - 1 ? view.months[mi + 1] : null;

  return (
    <div className="space-y-8">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-ink-soft">Spent in {view.month}</p>
          <h1 className="num font-display text-5xl font-semibold">{formatInrCompact(s.spent)}</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Income {formatInrCompact(s.income)} · Net{" "}
            <span className={s.net >= 0 ? "text-profit" : "text-loss"}>{formatInrCompact(s.net)}</span>
            {s.transferVolume > 0 && ` · Self-transfers ${formatInrCompact(s.transferVolume)} (excluded)`}
          </p>
        </div>
        <nav className="flex items-center gap-2 text-sm">
          {older ? (
            <Link href={`/expenses?month=${older}`} className="text-teal hover:underline">
              ← {older}
            </Link>
          ) : (
            <span className="text-ink-soft">←</span>
          )}
          <span className="num font-display">{view.month}</span>
          {newer ? (
            <Link href={`/expenses?month=${newer}`} className="text-teal hover:underline">
              {newer} →
            </Link>
          ) : (
            <span className="text-ink-soft">→</span>
          )}
        </nav>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="panel p-5">
          <h2 className="mb-3 font-display text-sm font-medium text-violet">By category</h2>
          {s.byCategory.length === 0 ? (
            <p className="text-sm text-ink-soft">No debits this month.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {s.byCategory.map((c) => (
                  <tr key={c.category} className="border-b border-panel-edge/50 last:border-0">
                    <td className="py-1.5">{c.category}</td>
                    <td className="py-1.5 text-right text-ink-soft">{c.count}</td>
                    <td className="num py-1.5 text-right text-gold">{formatInr(c.spent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="panel p-5">
          <h2 className="mb-3 font-display text-sm font-medium text-violet">Budgets · {view.month}</h2>
          {view.budgets.length > 0 ? (
            <div className="mb-4 space-y-2">
              {view.budgets.map((b) => (
                <div key={b.category}>
                  <div className="mb-0.5 flex justify-between text-xs">
                    <span>{b.category}</span>
                    <span className={`num ${b.over ? "text-loss" : "text-ink-soft"}`}>
                      {formatInr(b.spent)} / {formatInr(b.limit)}
                      {b.over && " — over"}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded bg-ground">
                    <div
                      className={`h-full ${b.over ? "bg-loss" : b.usagePct > 80 ? "bg-gold" : "bg-teal-deep"}`}
                      style={{ width: `${Math.min(b.usagePct, 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mb-4 text-sm text-ink-soft">No budgets set.</p>
          )}
          <BudgetsEditor budgets={view.budgetRows} categories={view.categories} />
        </div>
      </section>

      {view.recurring.length > 0 && (
        <section className="panel p-5">
          <h2 className="mb-3 font-display text-sm font-medium text-violet">
            Recurring commitments (detected)
          </h2>
          <table className="w-full text-sm">
            <tbody>
              {view.recurring.map((r) => (
                <tr key={r.merchant} className="border-b border-panel-edge/50 last:border-0">
                  <td className="max-w-72 truncate py-1.5 pr-3" title={r.merchant}>
                    {r.merchant}
                  </td>
                  <td className="py-1.5 pr-3 text-right text-xs text-ink-soft">
                    {r.count}× · every ~{r.medianIntervalDays}d
                  </td>
                  <td className="num py-1.5 pr-3 text-right text-gold">{formatInr(r.medianAmount)}</td>
                  <td className="py-1.5 text-right text-xs text-ink-soft">next ~{r.nextExpected}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="panel p-5">
        <h2 className="mb-3 font-display text-sm font-medium text-violet">
          Transactions · {view.month} ({view.transactions.length})
        </h2>
        <div className="max-h-[32rem] overflow-y-auto overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <tbody>
              {view.transactions.map((t) => (
                <tr key={t.id} className="border-b border-panel-edge/50 last:border-0">
                  <td className="py-1.5 pr-3 text-xs text-ink-soft">{t.date}</td>
                  <td className="max-w-96 truncate py-1.5 pr-3" title={t.description}>
                    {t.description}
                  </td>
                  <td className={`num py-1.5 pr-3 text-right ${t.amount < 0 ? "text-gold" : "text-profit"}`}>
                    {formatInr(t.amount)}
                  </td>
                  <td className="py-1.5 text-right">
                    <TxCategorySelect id={t.id} value={t.category} categories={view.categories} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel p-5">
        <h2 className="mb-3 font-display text-sm font-medium text-violet">Categorization rules</h2>
        <RulesEditor rules={rules} />
      </section>
    </div>
  );
}
