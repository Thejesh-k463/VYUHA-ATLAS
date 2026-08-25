// Pure money helpers. Runtime values are RUPEES (invariant 1); paise exists only
// at the DB column boundary and inside VYUHA's ledger_entries envelope rows.

/** Format rupees in Indian digit grouping: 1234567.5 -> "₹12,34,567.50" */
export function formatInr(rupees: number, opts?: { decimals?: number }): string {
  const decimals = opts?.decimals ?? 2;
  const sign = rupees < 0 ? "−" : "";
  return (
    sign +
    "₹" +
    Math.abs(rupees).toLocaleString("en-IN", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })
  );
}

/** Compact Indian notation for dashboards: 12,34,567 -> "₹12.35L", 5,60,00,000 -> "₹5.60Cr" */
export function formatInrCompact(rupees: number): string {
  const sign = rupees < 0 ? "−" : "";
  const abs = Math.abs(rupees);
  if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(2)}Cr`;
  if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(2)}L`;
  return formatInr(rupees, { decimals: abs >= 1000 ? 0 : 2 });
}

/** Envelope boundary only: VYUHA ledger_entries.amountPaise arrives in paise. */
export function paiseToRupees(paise: number): number {
  return paise / 100;
}

/** Round to whole paise to kill float drift before comparisons/aggregation. */
export function roundPaise(rupees: number): number {
  return Math.round(rupees * 100) / 100;
}
