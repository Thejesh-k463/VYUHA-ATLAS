"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const CLASSES = ["equity", "debt", "hybrid", "gold", "other"] as const;

export function HoldingClassSelect({ id, value }: { id: number; value: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onChange(assetClass: string) {
    setBusy(true);
    try {
      await fetch("/api/investments/holding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, assetClass }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <select
      value={value}
      disabled={busy}
      onChange={(e) => void onChange(e.target.value)}
      className="rounded border border-panel-edge bg-ground p-1 text-xs capitalize"
    >
      {CLASSES.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </select>
  );
}
