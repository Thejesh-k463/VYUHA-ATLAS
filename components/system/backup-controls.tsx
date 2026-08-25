"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function BackupControls() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/backup", { method: "POST" });
    const body = (await res.json()) as { fileName?: string; verify?: { ok: boolean; integrity: string } };
    setBusy(false);
    setMsg(
      res.ok && body.verify?.ok
        ? `Backed up and verified: ${body.fileName}`
        : `Backup FAILED verification (${body.verify?.integrity ?? res.status}) — do not trust it.`,
    );
    router.refresh();
  }

  return (
    <span className="flex items-center gap-3">
      {msg && <span className={msg.includes("FAILED") ? "text-loss" : "text-profit"}>{msg}</span>}
      <button
        onClick={run}
        disabled={busy}
        className="rounded bg-teal-deep px-3 py-1.5 font-medium text-ground hover:bg-teal disabled:opacity-50"
      >
        {busy ? "Backing up…" : "Back up now"}
      </button>
    </span>
  );
}
