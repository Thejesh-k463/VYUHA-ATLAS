"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface ImportResult {
  periods: number;
  cashflows: number;
  closedTrades: number;
  openTrades: number;
  skippedTradeRows: number;
  skippedLedgerRows: number;
}

export function VyuhaImport() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onFile(file: File) {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const text = await file.text();
      const res = await fetch("/api/import/vyuha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, envelope: JSON.parse(text) }),
      });
      const body = (await res.json()) as ImportResult & { error?: string };
      if (!res.ok) {
        setError(body.error ?? `Import failed (${res.status})`);
      } else {
        setResult(body);
        router.refresh();
      }
    } catch {
      setError("That file is not readable JSON — export a fresh backup from VYUHA and retry.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel space-y-4 p-5 text-sm">
      <label className="block">
        <span className="mb-2 block text-xs uppercase tracking-wider text-ink-soft">
          VYUHA backup (.json)
        </span>
        <input
          type="file"
          accept="application/json,.json"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFile(f);
          }}
          className="block w-full cursor-pointer rounded border border-panel-edge bg-ground p-2 file:mr-3 file:rounded file:border-0 file:bg-teal-deep file:px-3 file:py-1 file:text-ground"
        />
      </label>
      {busy && <p className="text-ink-soft">Reading envelope…</p>}
      {error && <p className="text-loss">{error}</p>}
      {result && (
        <div className="space-y-1">
          <p className="text-profit">Imported.</p>
          <ul className="text-ink-soft">
            <li>{result.closedTrades} closed trades → {result.periods} monthly periods</li>
            <li>{result.cashflows} cash flows (deposits, withdrawals, dividends)</li>
            <li>{result.openTrades} open positions noted (not valued yet — phase 2)</li>
            {(result.skippedTradeRows > 0 || result.skippedLedgerRows > 0) && (
              <li className="text-gold">
                Skipped {result.skippedTradeRows} trade row(s) and {result.skippedLedgerRows} ledger
                row(s) that could not be read — never coerced to zero.
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
