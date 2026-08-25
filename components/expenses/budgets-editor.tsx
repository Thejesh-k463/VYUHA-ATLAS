"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function BudgetsEditor({
  budgets,
  categories,
}: {
  budgets: { id: number; category: string; monthlyLimit: number }[];
  categories: string[];
}) {
  const router = useRouter();
  const [category, setCategory] = useState("");
  const [limit, setLimit] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onSave() {
    const monthlyLimit = Number(limit);
    if (!category.trim() || !Number.isFinite(monthlyLimit) || monthlyLimit <= 0) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/expenses/budgets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: category.trim().toLowerCase(), monthlyLimit }),
      });
      if (!res.ok) {
        setMsg(((await res.json()) as { error?: string }).error ?? "Failed.");
      } else {
        setCategory("");
        setLimit("");
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id: number) {
    setBusy(true);
    try {
      await fetch(`/api/expenses/budgets?id=${id}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 text-sm">
      {budgets.length > 0 && (
        <ul className="space-y-1 text-xs">
          {budgets.map((b) => (
            <li key={b.id} className="flex items-center justify-between gap-2">
              <span>
                {b.category} · ₹{b.monthlyLimit.toLocaleString("en-IN")}/mo
              </span>
              <button
                onClick={() => void onDelete(b.id)}
                disabled={busy}
                className="text-loss hover:underline disabled:opacity-50"
              >
                remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <label className="block">
          <span className="mb-1 block text-xs text-ink-soft">Category</span>
          <input
            value={category}
            disabled={busy}
            onChange={(e) => setCategory(e.target.value)}
            list="budget-categories"
            placeholder="food"
            className="block w-36 rounded border border-panel-edge bg-ground p-1.5"
          />
          <datalist id="budget-categories">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-ink-soft">Monthly limit ₹</span>
          <input
            type="number"
            min={1}
            value={limit}
            disabled={busy}
            onChange={(e) => setLimit(e.target.value)}
            className="num block w-32 rounded border border-panel-edge bg-ground p-1.5"
          />
        </label>
        <button
          onClick={() => void onSave()}
          disabled={busy || !category.trim() || !limit}
          className="rounded bg-teal-deep px-3 py-1.5 text-ground disabled:opacity-50"
        >
          Set budget
        </button>
      </div>
      {msg && <p className="text-xs text-loss">{msg}</p>}
    </div>
  );
}
