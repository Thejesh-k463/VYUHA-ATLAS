import Link from "next/link";
import { formatInr, formatInrCompact } from "@/lib/domain/money";
import { getProtectionView, listNomineeRows } from "@/lib/queries/protection";
import { getTaxView } from "@/lib/queries/tax";
import { fyOf } from "@/lib/tax/fy";
import { PolicyActions, PolicyForm } from "@/components/protection/policy-form";
import { NomineeDelete, NomineeForm } from "@/components/protection/nominee-form";
import { DeathPackForm } from "@/components/protection/death-pack-form";
import { ProtectionSettingsForm } from "@/components/protection/settings-form";

export const dynamic = "force-dynamic";

const BASIS_STYLE: Record<string, string> = {
  "real-data": "text-profit",
  assumption: "text-gold",
  "rule-of-thumb": "text-violet",
};

export default function ProtectionPage() {
  const today = new Date().toISOString().slice(0, 10);
  const view = getProtectionView(today);
  const nomineeRows = listNomineeRows();
  const rowsByAsset = new Map<string, typeof nomineeRows>();
  for (const n of nomineeRows) {
    const k = `${n.assetType}:${n.refId}`;
    rowsByAsset.set(k, [...(rowsByAsset.get(k) ?? []), n]);
  }
  const fys = getTaxView()?.fys ?? [fyOf(today)];

  return (
    <div className="space-y-8">
      <section>
        <p className="text-xs uppercase tracking-widest text-ink-soft">Protection &amp; estate</p>
        <h1 className="font-display text-3xl font-semibold">Protection</h1>
      </section>

      {view.reminders.length > 0 && (
        <section className="panel border-gold/60 p-4">
          <h2 className="mb-2 font-display text-sm font-medium text-gold">Renewals needing attention</h2>
          <ul className="space-y-1 text-sm">
            {view.reminders.map((p) => (
              <li key={p.id}>
                <span className={p.renewal.status === "overdue" ? "text-loss" : "text-gold"}>
                  {p.renewal.status === "overdue"
                    ? `OVERDUE ${-p.renewal.daysUntil} day(s)`
                    : `due in ${p.renewal.daysUntil} day(s)`}
                </span>{" "}
                — {p.insurer} {p.policyNo} ({p.kind}), premium {formatInr(p.premium)} {p.premiumFrequency.replace("_", "-")}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="panel p-5">
        <h2 className="mb-1 font-display text-sm font-medium text-violet">Life cover adequacy</h2>
        <p className="mb-3 text-xs text-ink-soft">
          Needs-based build-up from your mapped data. Basis of every line is labeled:{" "}
          <span className="text-profit">real data</span> · <span className="text-gold">assumption</span> ·{" "}
          <span className="text-violet">rule of thumb</span>. Nothing missing is ever counted as zero.
        </p>
        <table className="w-full text-sm">
          <tbody>
            {view.adequacy.components.map((c) => (
              <tr key={c.key} className="border-b border-panel-edge/50 last:border-0">
                <td className="py-1.5 pr-3">
                  {c.label}
                  <p className="text-xs text-ink-soft">{c.detail}</p>
                </td>
                <td className={`py-1.5 text-right text-xs ${BASIS_STYLE[c.basis]}`}>{c.basis}</td>
                <td className="num py-1.5 pl-4 text-right align-top">
                  {c.amount === null ? "missing" : `${c.sign < 0 ? "−" : "+"} ${formatInr(c.amount)}`}
                </td>
              </tr>
            ))}
            <tr className="border-t border-panel-edge">
              <td className="py-2 font-medium">
                Required cover{view.adequacy.incomplete && " (LOWER BOUND — data missing)"}
              </td>
              <td />
              <td className="num py-2 pl-4 text-right font-medium">{formatInr(view.adequacy.requiredCover)}</td>
            </tr>
            <tr>
              <td className="py-1">Existing life cover ({view.adequacyBasis.lifePolicyCount} policies)</td>
              <td />
              <td className="num py-1 pl-4 text-right">{formatInr(view.adequacy.existingLifeCover)}</td>
            </tr>
            <tr>
              <td className="py-1 font-medium">{view.adequacy.gap >= 0 ? "Cover gap" : "Cover surplus"}</td>
              <td />
              <td className={`num py-1 pl-4 text-right font-medium ${view.adequacy.gap > 0 ? "text-loss" : "text-profit"}`}>
                {formatInr(Math.abs(view.adequacy.gap))}
              </td>
            </tr>
          </tbody>
        </table>
        <p className="mt-2 text-xs text-ink-soft">
          Basis: liabilities {formatInrCompact(view.adequacyBasis.liabilitiesTotal)} ·{" "}
          {view.adequacyBasis.goalCount} active goal(s) · burn from {view.adequacyBasis.monthsOfSpendData} imported
          month(s) · counted assets {formatInrCompact(view.adequacyBasis.countedAssets)}.
        </p>
        {view.adequacy.ruleOfThumb ? (
          <p className="mt-2 text-xs">
            <span className="text-violet">Rule of thumb</span> ({view.adequacy.ruleOfThumb.multiple}× your stated
            income): cover {formatInr(view.adequacy.ruleOfThumb.requiredCover)} → gap{" "}
            {formatInr(view.adequacy.ruleOfThumb.gap)}. A cross-check only — the needs-based figure above is the one
            grounded in your data.
          </p>
        ) : (
          <p className="mt-2 text-xs text-ink-soft">
            State your annual income in the settings below to see the income-multiple rule-of-thumb cross-check.
          </p>
        )}
      </section>

      <section className="panel p-5">
        <h2 className="mb-3 font-display text-sm font-medium text-violet">Insurance policies</h2>
        {view.policies.length === 0 ? (
          <p className="mb-3 text-sm text-ink-soft">No policies on record yet — add the first one below.</p>
        ) : (
          <table className="mb-4 w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-soft">
                <th className="py-1 font-normal">Policy</th>
                <th className="py-1 font-normal">Type</th>
                <th className="py-1 text-right font-normal">Sum assured</th>
                <th className="py-1 text-right font-normal">Premium</th>
                <th className="py-1 text-right font-normal">Renewal</th>
                <th className="py-1 text-right font-normal" />
              </tr>
            </thead>
            <tbody>
              {view.policies.map((p) => (
                <tr key={p.id} className="border-b border-panel-edge/50 last:border-0">
                  <td className="py-1.5">
                    {p.insurer} <span className="num text-ink-soft">{p.policyNo}</span>
                    {p.planName && <p className="text-xs text-ink-soft">{p.planName}</p>}
                  </td>
                  <td className="py-1.5">{p.kind}</td>
                  <td className="num py-1.5 text-right">{formatInrCompact(p.sumAssured)}</td>
                  <td className="num py-1.5 text-right text-gold">
                    {formatInr(p.premium)} <span className="text-xs text-ink-soft">{p.premiumFrequency.replace("_", "-")}</span>
                  </td>
                  <td className={`num py-1.5 text-right ${p.renewal.status === "overdue" ? "text-loss" : p.renewal.status === "due_soon" ? "text-gold" : ""}`}>
                    {p.renewalDate}
                  </td>
                  <td className="py-1.5 text-right">
                    <PolicyActions id={p.id} renewalDate={p.renewalDate} />
                  </td>
                </tr>
              ))}
              <tr>
                <td className="py-1.5 text-xs text-ink-soft">Annual premium outgo (single-premium excluded)</td>
                <td colSpan={2} />
                <td className="num py-1.5 text-right text-gold">{formatInr(view.premiumAnnualTotal)}</td>
                <td colSpan={2} />
              </tr>
            </tbody>
          </table>
        )}
        <PolicyForm />
      </section>

      <section className="panel p-5">
        <h2 className="mb-1 font-display text-sm font-medium text-violet">Nominee coverage</h2>
        <p className="mb-3 text-xs text-ink-soft">
          {view.report.missingCount} asset(s) without a nominee · {view.report.sharesInvalidCount} with shares ≠ 100% ·{" "}
          {view.report.variantNames.length} name(s) spelled differently across assets. CAS-sourced nominees carry no
          share % (the CAS prints names only). MF nominees refresh from the CAS on re-import.
        </p>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-soft">
              <th className="py-1 font-normal">Asset</th>
              <th className="py-1 text-right font-normal">Value</th>
              <th className="py-1 font-normal">Nominee(s)</th>
              <th className="py-1 text-right font-normal">Status</th>
            </tr>
          </thead>
          <tbody>
            {view.report.assets.map((a) => (
              <tr key={`${a.assetType}:${a.refId}`} className="border-b border-panel-edge/50 last:border-0">
                <td className="py-1.5 pr-3">{a.label}</td>
                <td className="num py-1.5 text-right">{a.value === null ? "—" : formatInrCompact(a.value)}</td>
                <td className="py-1.5 pl-4">
                  {(rowsByAsset.get(`${a.assetType}:${a.refId}`) ?? []).map((n) => (
                    <span key={n.id} className="mr-3 inline-flex items-center gap-1.5">
                      {n.name}
                      {n.sharePct !== null && <span className="num text-xs text-ink-soft">{n.sharePct}%</span>}
                      {n.source === "cas" && <span className="text-xs text-ink-soft">(CAS)</span>}
                      <NomineeDelete id={n.id} />
                    </span>
                  ))}
                </td>
                <td className={`py-1.5 text-right text-xs ${a.status === "ok" ? "text-profit" : a.status === "missing" ? "text-loss" : "text-gold"}`}>
                  {a.status === "shares_invalid" ? `shares = ${a.shareTotal}%` : a.status}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {view.report.variantNames.length > 0 && (
          <div className="mt-3 text-xs">
            <p className="mb-1 text-gold">Same person, different spellings — worth unifying with the registrars:</p>
            {view.report.variantNames.map((c) => (
              <p key={c.key} className="text-ink-soft">
                {c.variants.join("  ·  ")} <span>({c.assetCount} asset(s))</span>
              </p>
            ))}
          </div>
        )}
        <div className="mt-4">
          <NomineeForm
            options={view.report.assets.map((a) => ({ assetType: a.assetType, refId: a.refId, label: a.label }))}
          />
        </div>
      </section>

      <section className="panel p-5">
        <h2 className="mb-1 font-display text-sm font-medium text-violet">Encrypted estate pack</h2>
        <p className="mb-3 text-xs text-ink-soft">
          One self-contained HTML file listing what exists, where it is, and who to contact — accounts, policies,
          folios, nominees, your contacts and instructions. Encrypted in memory with your passphrase
          (scrypt + AES-256-GCM, the same scheme protecting the database); the plaintext never touches disk. Anyone
          with the file and the passphrase can open it in a browser — no app, no internet. A wrong passphrase reveals
          nothing.
        </p>
        <DeathPackForm />
      </section>

      <section className="panel p-5">
        <h2 className="mb-1 font-display text-sm font-medium text-violet">Annual archive packs</h2>
        <p className="mb-2 text-xs text-ink-soft">
          Per-FY JSON snapshot: net worth, accounts, holdings, the FY&apos;s trading months, tax pack, expense months,
          goals and policies. Plain JSON (open format) — store it with your records.
        </p>
        <ul className="flex flex-wrap gap-3 text-sm">
          {fys.map((fy) => (
            <li key={fy}>
              <a href={`/api/archive?fy=${fy}`} className="text-teal underline">
                FY {fy}
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel p-5">
        <h2 className="mb-3 font-display text-sm font-medium text-violet">Assumptions, contacts &amp; instructions</h2>
        <ProtectionSettingsForm
          yearsOfExpenses={view.settings.yearsOfExpenses}
          annualIncome={view.settings.annualIncome}
          incomeMultiple={view.settings.incomeMultiple}
          contacts={view.settings.contacts}
          instructions={view.settings.instructions}
        />
      </section>

      <p className="text-xs text-ink-soft">
        Everything here stays on this machine. <Link href="/system" className="text-teal underline">System</Link> holds
        backups and export.
      </p>
    </div>
  );
}
