import { AccountForm } from "@/components/accounts/account-form";
import { formatInr } from "@/lib/domain/money";
import { listAccountsWithBalances } from "@/lib/queries/accounts";

export const dynamic = "force-dynamic";

export default function AccountsPage() {
  const rows = listAccountsWithBalances();
  return (
    <div className="space-y-8">
      <section>
        <h1 className="font-display text-2xl font-semibold">Accounts</h1>
        <p className="text-sm text-ink-soft">Every asset and liability you want on the map.</p>
      </section>

      <section className="panel overflow-x-auto p-5">
        {rows.length === 0 ? (
          <p className="text-sm text-ink-soft">No accounts yet — add the first one below.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-ink-soft">
                <th className="pb-2">Name</th>
                <th className="pb-2">Kind</th>
                <th className="pb-2">Owner</th>
                <th className="pb-2 text-right">Balance</th>
                <th className="pb-2 text-right">As of</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.accountId} className="border-t border-panel-edge/50">
                  <td className="py-2">{r.name}</td>
                  <td className="py-2 capitalize">{r.kind.replace("_", " ")}</td>
                  <td className="py-2 capitalize">{r.owner}</td>
                  <td className={`num py-2 text-right ${r.category === "liability" ? "text-loss" : ""}`}>
                    {r.balance === null ? "—" : formatInr(r.balance)}
                  </td>
                  <td className="num py-2 text-right text-ink-soft">{r.balanceDate ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <AccountForm />
    </div>
  );
}
