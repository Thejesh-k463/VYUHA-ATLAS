"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const LOSS_TYPES = [
  ["stcl", "Short-term capital loss"],
  ["ltcl", "Long-term capital loss"],
  ["fno", "F&O (non-speculative) loss"],
  ["speculative", "Intraday (speculative) loss"],
] as const;

export function CarryForwardEditor({
  rows,
}: {
  rows: { id: number; fy: string; lossType: string; amount: number; note: string | null }[];
}) {
  const router = useRouter();
  const [fy, setFy] = useState("");
  const [lossType, setLossType] = useState<string>("stcl");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onAdd() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/tax/carryforward", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fy, lossType, amount: Number(amount), note: note || null }),
      });
      if (!res.ok) {
        setError(((await res.json()) as { error?: string }).error ?? "Failed.");
      } else {
        setFy("");
        setAmount("");
        setNote("");
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id: number) {
    setBusy(true);
    try {
      await fetch(`/api/tax/carryforward?id=${id}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 text-sm">
      {rows.length > 0 && (
        <ul className="space-y-1 text-xs">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2">
              <span>
                FY {r.fy} · {LOSS_TYPES.find(([k]) => k === r.lossType)?.[1] ?? r.lossType} ·{" "}
                ₹{r.amount.toLocaleString("en-IN")}
                {r.note && <span className="text-ink-soft"> — {r.note}</span>}
              </span>
              <button onClick={() => void onDelete(r.id)} disabled={busy} className="text-loss hover:underline disabled:opacity-50">
                remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <label className="block">
          <span className="mb-1 block text-xs text-ink-soft">Loss FY</span>
          <input value={fy} disabled={busy} onChange={(e) => setFy(e.target.value)} placeholder="2024-25"
            className="num block w-24 rounded border border-panel-edge bg-ground p-1.5" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-ink-soft">Type</span>
          <select value={lossType} disabled={busy} onChange={(e) => setLossType(e.target.value)}
            className="block rounded border border-panel-edge bg-ground p-1.5">
            {LOSS_TYPES.map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-ink-soft">Amount ₹</span>
          <input type="number" min={1} value={amount} disabled={busy} onChange={(e) => setAmount(e.target.value)}
            className="num block w-28 rounded border border-panel-edge bg-ground p-1.5" />
        </label>
        <label className="block grow">
          <span className="mb-1 block text-xs text-ink-soft">Note (as filed)</span>
          <input value={note} disabled={busy} onChange={(e) => setNote(e.target.value)}
            className="block w-full rounded border border-panel-edge bg-ground p-1.5" />
        </label>
        <button onClick={() => void onAdd()} disabled={busy || !/^\d{4}-\d{2}$/.test(fy) || !(Number(amount) > 0)}
          className="rounded bg-teal-deep px-3 py-1.5 text-ground disabled:opacity-50">
          Record loss
        </button>
      </div>
      {error && <p className="text-loss">{error}</p>}
      <p className="text-xs text-ink-soft">
        Ledger of losses as FILED (from your returns) — carried losses set off per the Act&apos;s
        rules when you file; Atlas records, it does not auto-apply.
      </p>
    </div>
  );
}
