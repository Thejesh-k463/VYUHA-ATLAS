// Pure allocation math: actual mix by asset class vs user targets, drift alerts.
// No DB, no React (invariant 2).

import type { AssetClass } from "@/lib/db/schema";

export interface AllocationTarget {
  assetClass: string;
  targetPct: number; // 0..100
  driftBandPct: number; // alert when |actual − target| exceeds this
}

export interface AllocationRow {
  assetClass: string;
  value: number; // rupees
  actualPct: number; // 0..100 of total portfolio value
  targetPct: number | null; // null = no target set for this class
  driftPct: number | null; // actual − target
  alert: boolean;
}

export function computeAllocation(
  holdings: { assetClass: string; currentValue: number | null }[],
  targets: AllocationTarget[],
): { rows: AllocationRow[]; totalValue: number } {
  const byClass = new Map<string, number>();
  let totalValue = 0;
  for (const h of holdings) {
    if (h.currentValue === null || h.currentValue <= 0) continue;
    byClass.set(h.assetClass, (byClass.get(h.assetClass) ?? 0) + h.currentValue);
    totalValue += h.currentValue;
  }
  const targetByClass = new Map(targets.map((t) => [t.assetClass, t]));
  const classes = new Set([...byClass.keys(), ...targetByClass.keys()]);
  const rows: AllocationRow[] = [];
  for (const assetClass of classes) {
    const value = byClass.get(assetClass) ?? 0;
    const actualPct = totalValue > 0 ? (value / totalValue) * 100 : 0;
    const target = targetByClass.get(assetClass) ?? null;
    const driftPct = target ? actualPct - target.targetPct : null;
    rows.push({
      assetClass,
      value,
      actualPct,
      targetPct: target?.targetPct ?? null,
      driftPct,
      alert: target !== null && driftPct !== null && Math.abs(driftPct) > target.driftBandPct,
    });
  }
  rows.sort((a, b) => b.value - a.value);
  return { rows, totalValue };
}

// Keyword heuristic for a holding's default asset class from its scheme name.
// A default, never truth: the holding row stores assetClass and the user can override it.
const DEBT_RE =
  /liquid|overnight|money market|ultra short|low duration|short duration|medium duration|long duration|corporate bond|banking\s*(&|and)\s*psu|gilt|dynamic bond|credit risk|floater|floating rate|treasury|debt|income fund|bond fund/i;
const HYBRID_RE =
  /hybrid|balanced|multi[\s-]?asset|arbitrage|equity savings|asset allocat/i;
const GOLD_RE = /gold|silver/i;

export function guessAssetClass(schemeName: string): AssetClass {
  if (GOLD_RE.test(schemeName)) return "gold";
  if (HYBRID_RE.test(schemeName)) return "hybrid";
  if (DEBT_RE.test(schemeName)) return "debt";
  return "equity";
}
