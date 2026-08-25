"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface RefreshResult {
  schemes: number;
  upserted: number;
  fromMfapi: number;
  fromAmfi: number;
  failures: { isin: string; reason: string }[];
}

export function NavRefresh({ navAsOf }: { navAsOf: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RefreshResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onRefresh() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/nav/refresh", { method: "POST" });
      const body = (await res.json()) as RefreshResult & { error?: string };
      if (!res.ok) {
        setError(body.error ?? `Refresh failed (${res.status})`);
      } else {
        setResult(body);
        router.refresh();
      }
    } catch {
      setError("NAV refresh failed — are you online?");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <button
        onClick={() => void onRefresh()}
        disabled={busy}
        className="rounded bg-teal-deep px-4 py-1.5 text-ground disabled:opacity-50"
      >
        {busy ? "Fetching NAVs…" : "Refresh NAVs"}
      </button>
      <span className="text-ink-soft">{navAsOf ? `NAVs as of ${navAsOf}` : "No NAVs yet"}</span>
      {error && <span className="text-loss">{error}</span>}
      {result && (
        <span className={result.failures.length > 0 ? "text-gold" : "text-profit"}>
          {result.upserted} NAV(s) updated ({result.fromMfapi} mfapi, {result.fromAmfi} AMFI)
          {result.failures.length > 0 && ` — ${result.failures.length} scheme(s) failed`}
        </span>
      )}
    </div>
  );
}
