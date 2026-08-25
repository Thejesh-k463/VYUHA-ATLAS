"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function RulesEditor({
  rules,
}: {
  rules: { id: number; pattern: string; category: string; priority: number }[];
}) {
  const router = useRouter();
  const [pattern, setPattern] = useState("");
  const [category, setCategory] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onAdd() {
    if (!pattern.trim() || !category.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/expenses/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pattern: pattern.trim(), category: category.trim().toLowerCase(), priority: 100 }),
      });
      const body = (await res.json()) as { recategorized?: number; error?: string };
      if (!res.ok) {
        setMsg(body.error ?? "Failed.");
      } else {
        setMsg(`Saved — ${body.recategorized ?? 0} transaction(s) recategorized.`);
        setPattern("");
        setCategory("");
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id: number) {
    setBusy(true);
    try {
      await fetch(`/api/expenses/rules?id=${id}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 text-sm">
      {rules.length > 0 && (
        <ul className="space-y-1">
          {rules.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2 text-xs">
              <span className="truncate">
                <code className="text-teal">{r.pattern}</code> → {r.category}
              </span>
              <button
                onClick={() => void onDelete(r.id)}
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
        <label className="block grow">
          <span className="mb-1 block text-xs text-ink-soft">Pattern (text or /regex/)</span>
          <input
            value={pattern}
            disabled={busy}
            onChange={(e) => setPattern(e.target.value)}
            placeholder="zomato"
            className="block w-full rounded border border-panel-edge bg-ground p-1.5"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-ink-soft">Category</span>
          <input
            value={category}
            disabled={busy}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="food"
            className="block w-32 rounded border border-panel-edge bg-ground p-1.5"
          />
        </label>
        <button
          onClick={() => void onAdd()}
          disabled={busy || !pattern.trim() || !category.trim()}
          className="rounded bg-teal-deep px-3 py-1.5 text-ground disabled:opacity-50"
        >
          Add rule
        </button>
      </div>
      {msg && <p className="text-xs text-ink-soft">{msg}</p>}
      <p className="text-xs text-ink-soft">
        Rules apply to new imports and re-run over everything not manually categorized. Manual
        choices always win.
      </p>
    </div>
  );
}
