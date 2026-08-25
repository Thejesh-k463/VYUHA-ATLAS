"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ACCOUNT_KINDS } from "@/lib/db/schema";

const LIABILITY_KINDS = new Set(["loan", "credit_card", "other_liability"]);
const OWNERS = ["self", "spouse", "joint", "family"] as const;

// Route handler + fetch + router.refresh(), never a server action (AGENTS.md invariant 9).
export function AccountForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<string>("bank");
  const [owner, setOwner] = useState<string>("self");
  const [balance, setBalance] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        kind,
        owner,
        category: LIABILITY_KINDS.has(kind) ? "liability" : "asset",
        openingBalance: balance === "" ? undefined : Number(balance),
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? `Save failed (${res.status})`);
      return;
    }
    setName("");
    setBalance("");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="panel flex flex-wrap items-end gap-3 p-5 text-sm">
      <label className="flex flex-col gap-1">
        <span className="text-xs text-ink-soft">Name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="rounded border border-panel-edge bg-ground px-2 py-1.5"
          placeholder="HDFC Savings"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-ink-soft">Kind</span>
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          className="rounded border border-panel-edge bg-ground px-2 py-1.5 capitalize"
        >
          {ACCOUNT_KINDS.map((k) => (
            <option key={k} value={k}>
              {k.replace("_", " ")}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-ink-soft">Owner</span>
        <select
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
          className="rounded border border-panel-edge bg-ground px-2 py-1.5 capitalize"
        >
          {OWNERS.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-ink-soft">Balance (₹, optional)</span>
        <input
          value={balance}
          onChange={(e) => setBalance(e.target.value)}
          type="number"
          step="0.01"
          className="num rounded border border-panel-edge bg-ground px-2 py-1.5"
          placeholder="—"
        />
      </label>
      <button
        type="submit"
        disabled={busy}
        className="rounded bg-teal-deep px-4 py-1.5 font-medium text-ground hover:bg-teal disabled:opacity-50"
      >
        {busy ? "Adding…" : "Add account"}
      </button>
      {error && <p className="w-full text-loss">{error}</p>}
    </form>
  );
}
