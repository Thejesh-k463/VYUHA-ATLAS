"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface AssetOption {
  assetType: string;
  refId: number;
  label: string;
  value: number | null;
}

export function MappingForm({ goalId, options }: { goalId: number; options: AssetOption[] }) {
  const router = useRouter();
  const [key, setKey] = useState("");
  const [share, setShare] = useState("100");
  const [busy, setBusy] = useState(false);

  async function onAdd() {
    const opt = options.find((o) => `${o.assetType}:${o.refId}` === key);
    if (!opt) return;
    setBusy(true);
    try {
      await fetch("/api/goals/mappings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goalId,
          assetType: opt.assetType,
          refId: opt.refId,
          sharePct: Number(share) || 100,
        }),
      });
      setKey("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <select value={key} disabled={busy} onChange={(e) => setKey(e.target.value)}
        className="max-w-64 rounded border border-panel-edge bg-ground p-1">
        <option value="">map an asset…</option>
        {options.map((o) => (
          <option key={`${o.assetType}:${o.refId}`} value={`${o.assetType}:${o.refId}`}>
            {o.label}
          </option>
        ))}
      </select>
      <input type="number" min={1} max={100} value={share} disabled={busy}
        onChange={(e) => setShare(e.target.value)} title="share %"
        className="num w-16 rounded border border-panel-edge bg-ground p-1" />
      <span className="text-ink-soft">%</span>
      <button onClick={() => void onAdd()} disabled={busy || !key}
        className="rounded bg-teal-deep px-2 py-1 text-ground disabled:opacity-50">
        Map
      </button>
    </div>
  );
}

export function DeleteButton({ url, label }: { url: string; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      onClick={() => {
        setBusy(true);
        fetch(url, { method: "DELETE" })
          .then(() => router.refresh())
          .finally(() => setBusy(false));
      }}
      disabled={busy}
      className="text-xs text-loss hover:underline disabled:opacity-50"
    >
      {label}
    </button>
  );
}
