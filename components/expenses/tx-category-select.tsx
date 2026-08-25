"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function TxCategorySelect({
  id,
  value,
  categories,
}: {
  id: number;
  value: string | null;
  categories: string[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onChange(raw: string) {
    let category: string | null = raw === "" ? null : raw;
    if (raw === "__new__") {
      const entered = window.prompt("New category name:")?.trim();
      if (!entered) return;
      category = entered.toLowerCase();
    }
    setBusy(true);
    try {
      await fetch("/api/expenses/category", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, category }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <select
      value={value ?? ""}
      disabled={busy}
      onChange={(e) => void onChange(e.target.value)}
      className="max-w-32 rounded border border-panel-edge bg-ground p-1 text-xs"
    >
      <option value="">—</option>
      {categories.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
      {value && !categories.includes(value) && <option value={value}>{value}</option>}
      <option value="__new__">+ new…</option>
    </select>
  );
}
