"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface Contact {
  name: string;
  relation: string;
  phone: string;
  note: string;
}

export function ProtectionSettingsForm(props: {
  yearsOfExpenses: number;
  annualIncome: number | null;
  incomeMultiple: number;
  contacts: Contact[];
  instructions: string;
}) {
  const router = useRouter();
  const [years, setYears] = useState(String(props.yearsOfExpenses));
  const [income, setIncome] = useState(props.annualIncome === null ? "" : String(props.annualIncome));
  const [multiple, setMultiple] = useState(String(props.incomeMultiple));
  const [contacts, setContacts] = useState<Contact[]>(props.contacts);
  const [instructions, setInstructions] = useState(props.instructions);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function setContact(i: number, field: keyof Contact, value: string) {
    setContacts((cs) => cs.map((c, j) => (j === i ? { ...c, [field]: value } : c)));
  }

  async function onSave() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/protection/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          yearsOfExpenses: Number(years),
          annualIncome: income.trim() === "" ? null : Number(income),
          incomeMultiple: Number(multiple),
          contacts: contacts.filter((c) => c.name.trim()),
          instructions,
        }),
      });
      if (!res.ok) {
        setError(((await res.json()) as { error?: string }).error ?? "Failed.");
      } else {
        setSaved(true);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  const inputCls = "block w-full rounded border border-panel-edge bg-ground p-1.5";

  return (
    <div className="space-y-3 text-sm">
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="block">
          <span className="mb-1 block text-xs text-ink-soft">Years of expenses to cover (assumption)</span>
          <input type="number" min={0} max={60} value={years} disabled={busy} onChange={(e) => setYears(e.target.value)} className={`num ${inputCls}`} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-ink-soft">Annual income ₹ (blank = not stated)</span>
          <input type="number" min={0} value={income} disabled={busy} onChange={(e) => setIncome(e.target.value)} className={`num ${inputCls}`} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-ink-soft">Income multiple (rule of thumb)</span>
          <input type="number" min={1} max={50} value={multiple} disabled={busy} onChange={(e) => setMultiple(e.target.value)} className={`num ${inputCls}`} />
        </label>
      </div>

      <div>
        <p className="mb-1 text-xs text-ink-soft">Emergency contacts (go into the estate pack)</p>
        <div className="space-y-1.5">
          {contacts.map((c, i) => (
            <div key={i} className="grid gap-1.5 sm:grid-cols-5">
              <input value={c.name} placeholder="Name" disabled={busy} onChange={(e) => setContact(i, "name", e.target.value)} className={inputCls} />
              <input value={c.relation} placeholder="Relation / role" disabled={busy} onChange={(e) => setContact(i, "relation", e.target.value)} className={inputCls} />
              <input value={c.phone} placeholder="Phone" disabled={busy} onChange={(e) => setContact(i, "phone", e.target.value)} className={`num ${inputCls}`} />
              <input value={c.note} placeholder="Note" disabled={busy} onChange={(e) => setContact(i, "note", e.target.value)} className={inputCls} />
              <button disabled={busy} onClick={() => setContacts((cs) => cs.filter((_, j) => j !== i))}
                className="text-left text-xs text-loss hover:underline">remove</button>
            </div>
          ))}
        </div>
        <button disabled={busy || contacts.length >= 20}
          onClick={() => setContacts((cs) => [...cs, { name: "", relation: "", phone: "", note: "" }])}
          className="mt-1.5 text-xs text-teal hover:underline">
          + add contact
        </button>
      </div>

      <label className="block">
        <span className="mb-1 block text-xs text-ink-soft">Instructions for the family (opens the estate pack)</span>
        <textarea value={instructions} disabled={busy} rows={3} onChange={(e) => setInstructions(e.target.value)}
          placeholder="Where the documents are, who the CA is, what to do first…" className={inputCls} />
      </label>

      <div className="flex items-center gap-3">
        <button onClick={() => void onSave()} disabled={busy || !(Number(years) >= 0) || !(Number(multiple) >= 1)}
          className="rounded bg-teal-deep px-4 py-1.5 text-ground disabled:opacity-50">
          {busy ? "Saving…" : "Save settings"}
        </button>
        {saved && <span className="text-profit">Saved.</span>}
        {error && <span className="text-loss">{error}</span>}
      </div>
    </div>
  );
}
