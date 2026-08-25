import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { goalMappings, goals, type GoalAssetType } from "@/lib/db/schema";
import { listAccountsWithBalances } from "@/lib/queries/accounts";
import { getInvestmentsView } from "@/lib/queries/investments";
import { getTradingFacts } from "@/lib/queries/trading";
import { recentSpending } from "@/lib/queries/expenses";
import { inflatedTarget, monthsBetween, requiredMonthlySip } from "@/lib/domain/goals";
import { simulateGoal, type MonteCarloResult } from "@/lib/analytics/montecarlo";
import { emergencyGauge, medianMonthlySpend, type EmergencyGauge } from "@/lib/analytics/emergency";
import { roundPaise } from "@/lib/domain/money";

export interface MappingView {
  id: number;
  assetType: GoalAssetType;
  refId: number;
  sharePct: number;
  label: string;
  value: number | null; // share applied; null = underlying value unknown
}

export interface GoalView {
  id: number;
  name: string;
  targetAmount: number;
  targetDate: string;
  inflationPct: number;
  expectedReturnPct: number;
  volatilityPct: number;
  months: number;
  inflatedTarget: number;
  mappedValue: number;
  unknownMappings: number;
  progressPct: number;
  requiredSip: number | null;
  monteCarlo: MonteCarloResult | null;
  mappings: MappingView[];
}

export interface AssetOption {
  assetType: GoalAssetType;
  refId: number;
  label: string;
  value: number | null;
}

export interface GoalsView {
  goals: GoalView[];
  options: AssetOption[];
  emergency: EmergencyGauge | null;
  emergencyBasis: { liquidAccounts: string[]; monthsUsed: number };
}

function assetCatalog(): AssetOption[] {
  const options: AssetOption[] = [];
  const inv = getInvestmentsView();
  if (inv.imported && inv.portfolio) {
    for (const h of inv.portfolio.holdings) {
      if (h.unitsHeld > 0.0005) {
        options.push({
          assetType: "mf_holding",
          refId: h.id,
          label: `${h.schemeName} (folio ${h.folio})`,
          value: h.currentValue,
        });
      }
    }
  }
  for (const a of listAccountsWithBalances()) {
    if (a.category === "asset") {
      options.push({ assetType: "account", refId: a.accountId, label: a.name, value: a.balance });
    }
  }
  const trading = getTradingFacts();
  if (trading.imported) {
    options.push({ assetType: "trading", refId: 0, label: "Trading book (VYUHA)", value: trading.equity.equity });
  }
  return options;
}

export function getGoalsView(todayIso: string): GoalsView {
  const db = getDb();
  const options = assetCatalog();
  const byKey = new Map(options.map((o) => [`${o.assetType}:${o.refId}`, o]));

  const goalRows = db.select().from(goals).all().filter((g) => !g.archivedAt);
  const mappingRows = db.select().from(goalMappings).all();

  const views: GoalView[] = goalRows.map((g) => {
    const maps = mappingRows
      .filter((m) => m.goalId === g.id)
      .map((m): MappingView => {
        const opt = byKey.get(`${m.assetType}:${m.refId}`);
        return {
          id: m.id,
          assetType: m.assetType as GoalAssetType,
          refId: m.refId,
          sharePct: m.sharePct,
          label: opt?.label ?? `${m.assetType} #${m.refId} (missing)`,
          value: opt?.value != null ? roundPaise(opt.value * (m.sharePct / 100)) : null,
        };
      });
    const mappedValue = roundPaise(maps.reduce((s, m) => s + (m.value ?? 0), 0));
    const unknownMappings = maps.filter((m) => m.value === null).length;
    const months = monthsBetween(todayIso, g.targetDate);
    const target = inflatedTarget(g.targetAmount, g.inflationPct, months / 12);
    const requiredSip = requiredMonthlySip(target, mappedValue, g.expectedReturnPct, months);
    const monteCarlo =
      months > 0
        ? simulateGoal({
            corpus: mappedValue,
            monthlySip: requiredSip ?? 0,
            months,
            annualReturnPct: g.expectedReturnPct,
            annualVolPct: g.volatilityPct,
            target,
            sims: 2000,
            // Deterministic per goal+horizon: same page render, same numbers.
            seed: (g.id * 7919 + months) >>> 0,
          })
        : null;
    return {
      id: g.id,
      name: g.name,
      targetAmount: g.targetAmount,
      targetDate: g.targetDate,
      inflationPct: g.inflationPct,
      expectedReturnPct: g.expectedReturnPct,
      volatilityPct: g.volatilityPct,
      months,
      inflatedTarget: roundPaise(target),
      mappedValue,
      unknownMappings,
      progressPct: target > 0 ? (mappedValue / target) * 100 : 0,
      requiredSip: requiredSip === null ? null : roundPaise(requiredSip),
      monteCarlo,
      mappings: maps,
    };
  });

  // Emergency gauge: liquid = bank/cash/fd asset accounts with a known balance;
  // burn = median of up to 6 completed months of real spending (current month excluded).
  const liquidKinds = new Set(["bank", "cash", "fd"]);
  const liquidAccounts = listAccountsWithBalances().filter(
    (a) => a.category === "asset" && liquidKinds.has(a.kind) && a.balance !== null,
  );
  const liquidValue = roundPaise(liquidAccounts.reduce((s, a) => s + (a.balance ?? 0), 0));
  const currentMonth = todayIso.slice(0, 7);
  const spentMonths = recentSpending(8)
    .filter((m) => m.month !== currentMonth)
    .slice(0, 6)
    .map((m) => m.spent);
  const emergency = emergencyGauge(liquidValue, medianMonthlySpend(spentMonths));

  return {
    goals: views,
    options,
    emergency,
    emergencyBasis: { liquidAccounts: liquidAccounts.map((a) => a.name), monthsUsed: spentMonths.length },
  };
}

export function createGoal(input: {
  name: string;
  targetAmount: number;
  targetDate: string;
  inflationPct: number;
  expectedReturnPct: number;
  volatilityPct: number;
}): number {
  const r = getDb().insert(goals).values(input).returning({ id: goals.id }).all();
  return r[0].id;
}

export function updateGoal(
  id: number,
  patch: Partial<{
    name: string;
    targetAmount: number;
    targetDate: string;
    inflationPct: number;
    expectedReturnPct: number;
    volatilityPct: number;
  }>,
): void {
  getDb().update(goals).set(patch).where(eq(goals.id, id)).run();
}

export function deleteGoal(id: number): void {
  const db = getDb();
  db.transaction((tx) => {
    tx.delete(goalMappings).where(eq(goalMappings.goalId, id)).run();
    tx.delete(goals).where(eq(goals.id, id)).run();
  });
}

export function addMapping(goalId: number, assetType: GoalAssetType, refId: number, sharePct: number): number {
  const r = getDb()
    .insert(goalMappings)
    .values({ goalId, assetType, refId, sharePct })
    .returning({ id: goalMappings.id })
    .all();
  return r[0].id;
}

export function deleteMapping(id: number): void {
  getDb().delete(goalMappings).where(eq(goalMappings.id, id)).run();
}
