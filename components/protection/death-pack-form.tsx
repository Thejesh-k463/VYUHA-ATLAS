"use client";

import { useState } from "react";

export function DeathPackForm() {
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onGenerate() {
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      const res = await fetch("/api/protection/death-pack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passphrase, confirm }),
      });
      if (!res.ok) {
        setError(((await res.json()) as { error?: string }).error ?? "Failed.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download =
        res.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ?? "atlas-estate-pack.html";
      a.click();
      URL.revokeObjectURL(url);
      setPassphrase("");
      setConfirm("");
      setDone(true);
    } finally {
      setBusy(false);
    }
  }

  const valid = passphrase.length >= 8 && passphrase === confirm;

  return (
    <div className="space-y-2 text-sm">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs text-ink-soft">Passphrase (min 8 chars — share it with family, NOT in the file)</span>
          <input type="password" value={passphrase} disabled={busy} autoComplete="off"
            onChange={(e) => setPassphrase(e.target.value)}
            className="block w-full rounded border border-panel-edge bg-ground p-1.5" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-ink-soft">Confirm passphrase</span>
          <input type="password" value={confirm} disabled={busy} autoComplete="off"
            onChange={(e) => setConfirm(e.target.value)}
            className="block w-full rounded border border-panel-edge bg-ground p-1.5" />
        </label>
      </div>
      {passphrase && confirm && passphrase !== confirm && <p className="text-xs text-loss">Passphrases differ.</p>}
      <div className="flex items-center gap-3">
        <button onClick={() => void onGenerate()} disabled={busy || !valid}
          className="rounded bg-teal-deep px-4 py-1.5 text-ground disabled:opacity-50">
          {busy ? "Encrypting…" : "Generate encrypted pack"}
        </button>
        {done && <span className="text-profit">Downloaded. Open the file in a browser to test the passphrase.</span>}
        {error && <span className="text-loss">{error}</span>}
      </div>
    </div>
  );
}
