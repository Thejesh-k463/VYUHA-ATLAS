"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const CLASSES = ["equity", "debt", "hybrid", "gold", "other"] as const;

export function TargetsEditor({
  initial,
}: {
  initial: { assetClass: string; targetPct: number; driftBandPct: number }[];
}) {
  const router = useRouter();
  const [pcts, setPcts] = useState<Record<string, string>>(() =>
    Object.fromEntries(CLASSES.map((c) => [c, String(initial.find((t) => t.assetClass === c)?.targetPct ?? "")])),
  );
  const [band, setBand] = useState<string>(String(initial[0]?.driftBandPct ?? 5));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const sum = CLASSES.reduce((s, c) => s + (Number(pcts[c]) || 0), 0);

  async function onSave() {
    setBusy(true);
    setMsg(null);
    try {
      const targets = CLASSES.filter((c) => pcts[c] !== "" && Number(pcts[c]) > 0).map((c) => ({
        assetClass: c,
        targetPct: Number(pcts[c]),
        driftBandPct: Number(band) || 5,
      }));
      const res = await fetch("/api/allocation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targets }),
      });
      const body = (await res.json()) as { saved?: number; error?: string };
      if (!res.ok) {
        setMsg({ kind: "err", text: body.error ?? `Save failed (${res.status})` });
      } else {
        setMsg({ kind: "ok", text: targets.length === 0 ? "Targets cleared." : "Targets saved." });
        router.refresh();
      }
    } catch {
      setMsg({ kind: "err", text: "Save failed." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 text-sm">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {CLASSES.map((c) => (
          <label key={c} className="block">
            <span className="mb-1 block text-xs capitalize text-ink-soft">{c} %</span>
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              value={pcts[c]}
              disabled={busy}
              onChange={(e) => setPcts((p) => ({ ...p, [c]: e.target.value }))}
              className="num block w-full rounded border border-panel-edge bg-ground p-1.5"
            />
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2">
          <span className="text-xs text-ink-soft">Alert band ±%</span>
          <input
            type="number"
            min={0.5}
            max={50}
            step={0.5}
            value={band}
            disabled={busy}
            onChange={(e) => setBand(e.target.value)}
            className="num w-20 rounded border border-panel-edge bg-ground p-1.5"
          />
        </label>
        <span className={`num text-xs ${Math.abs(sum - 100) < 0.01 || sum === 0 ? "text-ink-soft" : "text-gold"}`}>
          Σ {sum.toFixed(0)}%
        </span>
        <button
          onClick={() => void onSave()}
          disabled={busy}
          className="rounded bg-teal-deep px-4 py-1.5 text-ground disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save targets"}
        </button>
        {msg && <span className={msg.kind === "ok" ? "text-profit" : "text-loss"}>{msg.text}</span>}
      </div>
    </div>
  );
}
