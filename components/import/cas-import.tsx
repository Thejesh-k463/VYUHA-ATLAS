"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface CasImportResult {
  holdings: number;
  transactions: number;
  periodFrom: string;
  periodTo: string;
  pageCount: number;
  warnings: string[];
  reconciliation: {
    casCost: number;
    casMarket: number;
    parsedCost: number;
    parsedMarket: number;
    costMatches: boolean;
    marketMatches: boolean;
  } | null;
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function CasImport() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CasImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onImport() {
    if (!file) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const pdfBase64 = toBase64(await file.arrayBuffer());
      const res = await fetch("/api/import/cas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, pdfBase64, password: password || null }),
      });
      const body = (await res.json()) as CasImportResult & { error?: string };
      if (!res.ok) {
        setError(body.error ?? `Import failed (${res.status})`);
      } else {
        setResult(body);
        router.refresh();
      }
    } catch {
      setError("Could not read that file — is it the CAS PDF you downloaded?");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel space-y-4 p-5 text-sm">
      <label className="block">
        <span className="mb-2 block text-xs uppercase tracking-wider text-ink-soft">
          CAS PDF (CAMS / KFintech, detailed statement with transactions)
        </span>
        <input
          type="file"
          accept="application/pdf,.pdf"
          disabled={busy}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full cursor-pointer rounded border border-panel-edge bg-ground p-2 file:mr-3 file:rounded file:border-0 file:bg-teal-deep file:px-3 file:py-1 file:text-ground"
        />
      </label>
      <label className="block">
        <span className="mb-2 block text-xs uppercase tracking-wider text-ink-soft">
          PDF password (used once to open the file, never stored)
        </span>
        <input
          type="password"
          value={password}
          disabled={busy}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="off"
          className="block w-full rounded border border-panel-edge bg-ground p-2"
        />
      </label>
      <button
        onClick={() => void onImport()}
        disabled={busy || !file}
        className="rounded bg-teal-deep px-4 py-1.5 text-ground disabled:opacity-50"
      >
        {busy ? "Reading statement…" : "Import CAS"}
      </button>
      {error && <p className="text-loss">{error}</p>}
      {result && (
        <div className="space-y-1">
          <p className="text-profit">Imported.</p>
          <ul className="text-ink-soft">
            <li>
              {result.holdings} holdings, {result.transactions} transactions ({result.periodFrom} →{" "}
              {result.periodTo}, {result.pageCount} pages)
            </li>
            {result.reconciliation && (
              <li className={result.reconciliation.costMatches && result.reconciliation.marketMatches ? "text-profit" : "text-gold"}>
                {result.reconciliation.costMatches && result.reconciliation.marketMatches
                  ? "Reconciles with the CAS's own portfolio summary to the paisa."
                  : `Reconciliation gap vs the CAS summary — cost ${result.reconciliation.parsedCost} vs ${result.reconciliation.casCost}, market ${result.reconciliation.parsedMarket} vs ${result.reconciliation.casMarket}.`}
              </li>
            )}
            {result.warnings.map((w) => (
              <li key={w} className="text-gold">
                {w}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
