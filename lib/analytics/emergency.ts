// Pure emergency-fund gauge. No DB, no React (invariant 2). Refuses to gauge
// without real spending history (invariant 6) — a made-up burn rate is worse
// than none.

export interface EmergencyGauge {
  liquidValue: number;
  monthlySpend: number;
  monthsCovered: number;
  targetMonths: number;
  status: "ok" | "watch" | "low";
}

export function medianMonthlySpend(spentByMonth: number[]): number | null {
  const real = spentByMonth.filter((s) => s > 0);
  if (real.length === 0) return null;
  const sorted = [...real].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function emergencyGauge(
  liquidValue: number,
  monthlySpend: number | null,
  targetMonths = 6,
): EmergencyGauge | null {
  if (monthlySpend === null || monthlySpend <= 0) return null;
  const monthsCovered = liquidValue / monthlySpend;
  return {
    liquidValue,
    monthlySpend,
    monthsCovered,
    targetMonths,
    status: monthsCovered >= targetMonths ? "ok" : monthsCovered >= targetMonths / 2 ? "watch" : "low",
  };
}
