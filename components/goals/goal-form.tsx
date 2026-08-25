"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function GoalForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [inflation, setInflation] = useState("6");
  const [ret, setRet] = useState("11");
  const [vol, setVol] = useState("14");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onCreate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          targetAmount: Number(amount),
          targetDate: date,
          inflationPct: Number(inflation),
          expectedReturnPct: Number(ret),
          volatilityPct: Number(vol),
        }),
      });
      if (!res.ok) {
        setError(((await res.json()) as { error?: string }).error ?? "Failed.");
      } else {
        setName("");
        setAmount("");
        setDate("");
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  const valid = name.trim() && Number(amount) > 0 && /^\d{4}-\d{2}-\d{2}$/.test(date);

  return (
    <div className="space-y-3 text-sm">
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="block">
          <span className="mb-1 block text-xs text-ink-soft">Goal name</span>
          <input value={name} disabled={busy} onChange={(e) => setName(e.target.value)}
            placeholder="House down payment"
            className="block w-full rounded border border-panel-edge bg-ground p-1.5" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-ink-soft">Target ₹ (today&apos;s money)</span>
          <input type="number" min={1} value={amount} disabled={busy} onChange={(e) => setAmount(e.target.value)}
            className="num block w-full rounded border border-panel-edge bg-ground p-1.5" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-ink-soft">Target date</span>
          <input type="date" value={date} disabled={busy} onChange={(e) => setDate(e.target.value)}
            className="num block w-full rounded border border-panel-edge bg-ground p-1.5" />
        </label>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        {[
          ["Inflation %", inflation, setInflation],
          ["Expected return %", ret, setRet],
          ["Volatility %", vol, setVol],
        ].map(([label, value, set]) => (
          <label key={label as string} className="block">
            <span className="mb-1 block text-xs text-ink-soft">{label as string}</span>
            <input type="number" step={0.5} min={0} value={value as string} disabled={busy}
              onChange={(e) => (set as (v: string) => void)(e.target.value)}
              className="num block w-28 rounded border border-panel-edge bg-ground p-1.5" />
          </label>
        ))}
        <button onClick={() => void onCreate()} disabled={busy || !valid}
          className="rounded bg-teal-deep px-4 py-1.5 text-ground disabled:opacity-50">
          {busy ? "Saving…" : "Create goal"}
        </button>
      </div>
      {error && <p className="text-loss">{error}</p>}
    </div>
  );
}
