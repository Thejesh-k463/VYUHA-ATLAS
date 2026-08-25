"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface AccountOption {
  accountId: number;
  name: string;
  kind: string;
}

interface DryRunResult {
  dryRun: true;
  layout: { headerIndex: number; headers: string[]; mapping: Record<string, unknown> };
  parsedCount: number;
  rejectedCount: number;
  rejected: { rowNumber: number; reason: string; raw: string }[];
  sample: { date: string; description: string; amount: number; balance: number | null }[];
  dateRange: { from: string; to: string } | null;
}

interface CommitResult {
  parsed: number;
  inserted: number;
  duplicatesSkipped: number;
  categorized: number;
  balanceSnapshotDate: string | null;
  rejectedCount: number;
  rejected: { rowNumber: number; reason: string; raw: string }[];
}

export function BankImport({ accounts }: { accounts: AccountOption[] }) {
  const router = useRouter();
  const [accountId, setAccountId] = useState<number>(accounts[0]?.accountId ?? 0);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<DryRunResult | null>(null);
  const [result, setResult] = useState<CommitResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function post(dryRun: boolean) {
    if (!file || !accountId) return;
    setBusy(true);
    setError(null);
    if (dryRun) setResult(null);
    try {
      const csvText = await file.text();
      const res = await fetch("/api/import/bank", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, csvText, fileName: file.name, dryRun }),
      });
      const bodyJson = (await res.json()) as (DryRunResult | CommitResult) & { error?: string };
      if (!res.ok) {
        setError(bodyJson.error ?? `Import failed (${res.status})`);
        setPreview(null);
      } else if (dryRun) {
        setPreview(bodyJson as DryRunResult);
      } else {
        setPreview(null);
        setResult(bodyJson as CommitResult);
        router.refresh();
      }
    } catch {
      setError("Could not read that file as CSV.");
    } finally {
      setBusy(false);
    }
  }

  if (accounts.length === 0) {
    return (
      <div className="panel p-5 text-sm text-ink-soft">
        Add a bank or credit-card account on the Accounts screen first — statement rows attach to an
        account.
      </div>
    );
  }

  return (
    <div className="panel space-y-4 p-5 text-sm">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-2 block text-xs uppercase tracking-wider text-ink-soft">Account</span>
          <select
            value={accountId}
            disabled={busy}
            onChange={(e) => setAccountId(Number(e.target.value))}
            className="block w-full rounded border border-panel-edge bg-ground p-2"
          >
            {accounts.map((a) => (
              <option key={a.accountId} value={a.accountId}>
                {a.name} ({a.kind.replace("_", " ")})
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-2 block text-xs uppercase tracking-wider text-ink-soft">
            Statement CSV
          </span>
          <input
            type="file"
            accept=".csv,text/csv,.txt"
            disabled={busy}
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setPreview(null);
              setResult(null);
            }}
            className="block w-full cursor-pointer rounded border border-panel-edge bg-ground p-2 file:mr-3 file:rounded file:border-0 file:bg-teal-deep file:px-3 file:py-1 file:text-ground"
          />
        </label>
      </div>
      <div className="flex gap-3">
        <button
          onClick={() => void post(true)}
          disabled={busy || !file}
          className="rounded border border-panel-edge px-4 py-1.5 disabled:opacity-50"
        >
          Preview
        </button>
        <button
          onClick={() => void post(false)}
          disabled={busy || !file || !preview}
          className="rounded bg-teal-deep px-4 py-1.5 text-ground disabled:opacity-50"
          title={preview ? "" : "Preview first"}
        >
          {busy ? "Working…" : "Import"}
        </button>
      </div>
      {error && <p className="text-loss">{error}</p>}

      {preview && (
        <div className="space-y-2">
          <p>
            Detected header at row {preview.layout.headerIndex + 1}: {preview.layout.headers.join(" · ")}
          </p>
          <p className="text-ink-soft">
            {preview.parsedCount} readable rows
            {preview.dateRange && ` (${preview.dateRange.from} → ${preview.dateRange.to})`}
            {preview.rejectedCount > 0 && `, ${preview.rejectedCount} rejected`}
          </p>
          <ul className="text-xs text-ink-soft">
            {preview.sample.map((s, i) => (
              <li key={i} className="truncate">
                {s.date} · {s.description.slice(0, 60)} · {s.amount}
              </li>
            ))}
          </ul>
          {preview.rejected.length > 0 && (
            <details className="text-xs text-gold">
              <summary>Rejected rows (never coerced — fix the source or ignore)</summary>
              <ul>
                {preview.rejected.map((r) => (
                  <li key={r.rowNumber} className="truncate">
                    row {r.rowNumber}: {r.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {result && (
        <div className="space-y-1">
          <p className="text-profit">Imported.</p>
          <ul className="text-ink-soft">
            <li>
              {result.inserted} new transaction(s), {result.duplicatesSkipped} duplicate(s) skipped,{" "}
              {result.categorized} matched a rule
            </li>
            {result.balanceSnapshotDate && (
              <li>Balance snapshot recorded as of {result.balanceSnapshotDate} — the Map follows.</li>
            )}
            {result.rejectedCount > 0 && (
              <li className="text-gold">
                {result.rejectedCount} unreadable row(s) rejected with reasons — never coerced to zero.
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
