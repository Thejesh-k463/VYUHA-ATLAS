"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export interface NomineeAssetOption {
  assetType: string;
  refId: number;
  label: string;
}

const inputCls = "block w-full rounded border border-panel-edge bg-ground p-1.5";

export function NomineeForm({ options }: { options: NomineeAssetOption[] }) {
  const router = useRouter();
  const [assetKey, setAssetKey] = useState(options[0] ? `${options[0].assetType}:${options[0].refId}` : "");
  const [name, setName] = useState("");
  const [relationship, setRelationship] = useState("");
  const [sharePct, setSharePct] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onAdd() {
    const [assetType, refIdStr] = assetKey.split(":");
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/protection/nominees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetType,
          refId: Number(refIdStr),
          name: name.trim(),
          relationship: relationship.trim() || null,
          sharePct: sharePct.trim() === "" ? null : Number(sharePct),
        }),
      });
      if (!res.ok) {
        setError(((await res.json()) as { error?: string }).error ?? "Failed.");
      } else {
        setName("");
        setRelationship("");
        setSharePct("");
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  const valid = assetKey && name.trim() && (sharePct.trim() === "" || (Number(sharePct) >= 0 && Number(sharePct) <= 100));

  return (
    <div className="space-y-2 text-sm">
      <div className="grid gap-2 sm:grid-cols-5">
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-xs text-ink-soft">Asset</span>
          <select value={assetKey} disabled={busy} onChange={(e) => setAssetKey(e.target.value)} className={inputCls}>
            {options.map((o) => (
              <option key={`${o.assetType}:${o.refId}`} value={`${o.assetType}:${o.refId}`}>{o.label}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-ink-soft">Nominee name</span>
          <input value={name} disabled={busy} onChange={(e) => setName(e.target.value)} className={inputCls} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-ink-soft">Relationship</span>
          <input value={relationship} disabled={busy} onChange={(e) => setRelationship(e.target.value)} placeholder="spouse / parent…" className={inputCls} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-ink-soft">Share % (blank = not stated)</span>
          <input type="number" min={0} max={100} value={sharePct} disabled={busy} onChange={(e) => setSharePct(e.target.value)} className={`num ${inputCls}`} />
        </label>
      </div>
      <div className="flex items-center gap-3">
        <button onClick={() => void onAdd()} disabled={busy || !valid}
          className="rounded bg-teal-deep px-4 py-1.5 text-ground disabled:opacity-50">
          {busy ? "Saving…" : "Add nominee"}
        </button>
        {error && <span className="text-loss">{error}</span>}
      </div>
    </div>
  );
}

export function NomineeDelete({ id }: { id: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await fetch("/api/protection/nominees", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id }),
          });
          router.refresh();
        } finally {
          setBusy(false);
        }
      }}
      className="text-xs text-loss hover:underline disabled:opacity-50">
      remove
    </button>
  );
}
