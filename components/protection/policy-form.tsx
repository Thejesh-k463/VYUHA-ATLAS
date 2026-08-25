"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const KINDS = ["life", "health", "motor", "other"] as const;
const FREQS = ["yearly", "half_yearly", "quarterly", "monthly", "single"] as const;
const OWNERS = ["self", "spouse", "joint", "family"] as const;

const inputCls = "block w-full rounded border border-panel-edge bg-ground p-1.5";

export function PolicyForm() {
  const router = useRouter();
  const [kind, setKind] = useState<string>("life");
  const [insurer, setInsurer] = useState("");
  const [policyNo, setPolicyNo] = useState("");
  const [planName, setPlanName] = useState("");
  const [sumAssured, setSumAssured] = useState("");
  const [premium, setPremium] = useState("");
  const [frequency, setFrequency] = useState<string>("yearly");
  const [renewalDate, setRenewalDate] = useState("");
  const [owner, setOwner] = useState<string>("self");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onCreate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/protection/policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          insurer: insurer.trim(),
          policyNo: policyNo.trim(),
          planName: planName.trim() || null,
          sumAssured: Number(sumAssured),
          premium: Number(premium),
          premiumFrequency: frequency,
          renewalDate,
          owner,
        }),
      });
      if (!res.ok) {
        setError(((await res.json()) as { error?: string }).error ?? "Failed.");
      } else {
        setInsurer("");
        setPolicyNo("");
        setPlanName("");
        setSumAssured("");
        setPremium("");
        setRenewalDate("");
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  const valid =
    insurer.trim() && policyNo.trim() && Number(sumAssured) > 0 && Number(premium) >= 0 && /^\d{4}-\d{2}-\d{2}$/.test(renewalDate);

  return (
    <div className="space-y-3 text-sm">
      <div className="grid gap-2 sm:grid-cols-4">
        <label className="block">
          <span className="mb-1 block text-xs text-ink-soft">Type</span>
          <select value={kind} disabled={busy} onChange={(e) => setKind(e.target.value)} className={inputCls}>
            {KINDS.map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-ink-soft">Insurer</span>
          <input value={insurer} disabled={busy} onChange={(e) => setInsurer(e.target.value)} placeholder="LIC / HDFC Ergo…" className={inputCls} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-ink-soft">Policy number</span>
          <input value={policyNo} disabled={busy} onChange={(e) => setPolicyNo(e.target.value)} className={`num ${inputCls}`} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-ink-soft">Plan name (optional)</span>
          <input value={planName} disabled={busy} onChange={(e) => setPlanName(e.target.value)} className={inputCls} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-ink-soft">Sum assured ₹</span>
          <input type="number" min={1} value={sumAssured} disabled={busy} onChange={(e) => setSumAssured(e.target.value)} className={`num ${inputCls}`} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-ink-soft">Premium ₹ (per period)</span>
          <input type="number" min={0} value={premium} disabled={busy} onChange={(e) => setPremium(e.target.value)} className={`num ${inputCls}`} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-ink-soft">Premium frequency</span>
          <select value={frequency} disabled={busy} onChange={(e) => setFrequency(e.target.value)} className={inputCls}>
            {FREQS.map((f) => (
              <option key={f} value={f}>{f.replace("_", "-")}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-ink-soft">Next renewal / premium due</span>
          <input type="date" value={renewalDate} disabled={busy} onChange={(e) => setRenewalDate(e.target.value)} className={`num ${inputCls}`} />
        </label>
      </div>
      <div className="flex items-end gap-3">
        <label className="block">
          <span className="mb-1 block text-xs text-ink-soft">Owner</span>
          <select value={owner} disabled={busy} onChange={(e) => setOwner(e.target.value)} className={inputCls}>
            {OWNERS.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </label>
        <button onClick={() => void onCreate()} disabled={busy || !valid}
          className="rounded bg-teal-deep px-4 py-1.5 text-ground disabled:opacity-50">
          {busy ? "Saving…" : "Add policy"}
        </button>
      </div>
      {error && <p className="text-loss">{error}</p>}
    </div>
  );
}

export function PolicyActions({ id, renewalDate }: { id: number; renewalDate: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState(renewalDate);

  async function call(method: "PATCH" | "DELETE", body: Record<string, unknown>) {
    setBusy(true);
    try {
      await fetch("/api/protection/policies", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setEditing(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <input type="date" value={date} disabled={busy} onChange={(e) => setDate(e.target.value)}
          className="num rounded border border-panel-edge bg-ground p-1 text-xs" />
        <button disabled={busy || !/^\d{4}-\d{2}-\d{2}$/.test(date)}
          onClick={() => void call("PATCH", { id, renewalDate: date })}
          className="text-xs text-teal hover:underline disabled:opacity-50">save</button>
        <button disabled={busy} onClick={() => setEditing(false)} className="text-xs text-ink-soft hover:underline">cancel</button>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2">
      <button disabled={busy} onClick={() => setEditing(true)} className="text-xs text-teal hover:underline">
        renewed?
      </button>
      <button disabled={busy}
        onClick={() => { if (confirm("Delete this policy (and its nominee rows)?")) void call("DELETE", { id }); }}
        className="text-xs text-loss hover:underline">
        delete
      </button>
    </span>
  );
}
