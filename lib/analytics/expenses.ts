// Pure expense analytics: monthly rollups, budget status, recurring detection,
// self-transfer pairing. No DB, no React (invariant 2). Never fabricates: a
// transaction without a category rolls up under "uncategorized", transfers are
// excluded from spending, and recurring detection needs real repetition (≥3).

import { roundPaise } from "@/lib/domain/money";

export const TRANSFER_CATEGORY = "transfer";

export interface ExpenseTx {
  id: number;
  accountId: number;
  date: string; // ISO
  description: string;
  amount: number; // signed rupees, debit negative
  category: string | null;
  upiRef: string | null;
}

/**
 * Self-transfer pairing: the same UPI RRN appearing with opposite signs in two
 * DIFFERENT accounts is money moving between the user's own accounts, not
 * income or spending. Returns the ids to treat as transfers.
 */
export function findTransferPairs(txs: ExpenseTx[]): Set<number> {
  const byRef = new Map<string, ExpenseTx[]>();
  for (const t of txs) {
    if (!t.upiRef) continue;
    const list = byRef.get(t.upiRef) ?? [];
    list.push(t);
    byRef.set(t.upiRef, list);
  }
  const transfers = new Set<number>();
  for (const list of byRef.values()) {
    for (const a of list) {
      for (const b of list) {
        if (
          a.id < b.id &&
          a.accountId !== b.accountId &&
          Math.abs(a.amount + b.amount) < 0.005 &&
          a.amount !== 0
        ) {
          transfers.add(a.id);
          transfers.add(b.id);
        }
      }
    }
  }
  return transfers;
}

/** Effective category: explicit category wins; detected transfer pairs; else null. */
export function effectiveCategory(t: ExpenseTx, transferIds: Set<number>): string | null {
  if (t.category) return t.category;
  if (transferIds.has(t.id)) return TRANSFER_CATEGORY;
  return null;
}

export interface MonthSummary {
  month: string; // yyyy-mm
  spent: number; // positive rupees, transfers excluded
  income: number; // positive rupees, transfers excluded
  net: number; // income − spent
  transferVolume: number; // |amounts| tagged transfer, shown separately
  byCategory: { category: string; spent: number; count: number }[]; // debits only
  txCount: number;
}

export function monthKey(date: string): string {
  return date.slice(0, 7);
}

export function summarizeMonth(txs: ExpenseTx[], month: string): MonthSummary {
  const transferIds = findTransferPairs(txs);
  let spent = 0;
  let income = 0;
  let transferVolume = 0;
  let txCount = 0;
  const cats = new Map<string, { spent: number; count: number }>();
  for (const t of txs) {
    if (monthKey(t.date) !== month) continue;
    txCount++;
    const cat = effectiveCategory(t, transferIds);
    if (cat === TRANSFER_CATEGORY) {
      transferVolume = roundPaise(transferVolume + Math.abs(t.amount));
      continue;
    }
    if (t.amount < 0) {
      spent = roundPaise(spent - t.amount);
      const key = cat ?? "uncategorized";
      const c = cats.get(key) ?? { spent: 0, count: 0 };
      c.spent = roundPaise(c.spent - t.amount);
      c.count++;
      cats.set(key, c);
    } else {
      income = roundPaise(income + t.amount);
    }
  }
  return {
    month,
    spent,
    income,
    net: roundPaise(income - spent),
    transferVolume,
    byCategory: [...cats.entries()]
      .map(([category, v]) => ({ category, ...v }))
      .sort((a, b) => b.spent - a.spent),
    txCount,
  };
}

export interface BudgetRow {
  category: string;
  limit: number; // rupees / month
  spent: number;
  usagePct: number; // 0..∞
  over: boolean;
}

export function budgetStatus(
  summary: MonthSummary,
  budgets: { category: string; monthlyLimit: number }[],
): BudgetRow[] {
  const spentByCat = new Map(summary.byCategory.map((c) => [c.category, c.spent]));
  return budgets
    .map((b) => {
      const spent = spentByCat.get(b.category) ?? 0;
      return {
        category: b.category,
        limit: b.monthlyLimit,
        spent,
        usagePct: b.monthlyLimit > 0 ? (spent / b.monthlyLimit) * 100 : 0,
        over: spent > b.monthlyLimit,
      };
    })
    .sort((a, b) => b.usagePct - a.usagePct);
}

export interface RecurringItem {
  merchant: string;
  count: number;
  medianAmount: number; // positive rupees
  medianIntervalDays: number;
  lastDate: string;
  nextExpected: string;
}

/** Merchant key for grouping: UPI narrations keep their longest alpha segment,
 *  everything else drops digits/refs. Deterministic, no lookup tables. */
export function merchantKey(description: string): string {
  const parts = description.split(/[\/|]/).map((p) => p.trim());
  const alphaParts = parts
    .map((p) => p.replace(/[^A-Za-z &.-]/g, " ").replace(/\s+/g, " ").trim())
    .filter((p) => p.length >= 3 && !/^(upi|dr|cr|neft|imps|rtgs|ach|payment from ph)$/i.test(p));
  const best = alphaParts.sort((a, b) => b.length - a.length)[0] ?? "";
  return best.toUpperCase();
}

function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const MS_PER_DAY = 86_400_000;

/**
 * Monthly recurring debits: ≥3 occurrences of one merchant, consecutive-gap
 * median of 26–35 days, amounts within ±25% of their median. SIPs, rent,
 * subscriptions surface; ad-hoc shopping does not.
 */
export function detectRecurring(txs: ExpenseTx[]): RecurringItem[] {
  const transferIds = findTransferPairs(txs);
  const groups = new Map<string, ExpenseTx[]>();
  for (const t of txs) {
    if (t.amount >= 0) continue;
    if (effectiveCategory(t, transferIds) === TRANSFER_CATEGORY) continue;
    const key = merchantKey(t.description);
    if (!key) continue;
    const list = groups.get(key) ?? [];
    list.push(t);
    groups.set(key, list);
  }
  const out: RecurringItem[] = [];
  for (const [merchant, list] of groups) {
    if (list.length < 3) continue;
    const sorted = [...list].sort((a, b) => (a.date < b.date ? -1 : 1));
    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      gaps.push((Date.parse(sorted[i].date) - Date.parse(sorted[i - 1].date)) / MS_PER_DAY);
    }
    const gapMedian = median(gaps);
    if (gapMedian < 26 || gapMedian > 35) continue;
    const amounts = sorted.map((t) => -t.amount);
    const amtMedian = median(amounts);
    if (amtMedian <= 0 || amounts.some((a) => Math.abs(a - amtMedian) / amtMedian > 0.25)) continue;
    const lastDate = sorted[sorted.length - 1].date;
    const next = new Date(Date.parse(lastDate) + Math.round(gapMedian) * MS_PER_DAY);
    out.push({
      merchant,
      count: sorted.length,
      medianAmount: roundPaise(amtMedian),
      medianIntervalDays: Math.round(gapMedian),
      lastDate,
      nextExpected: next.toISOString().slice(0, 10),
    });
  }
  return out.sort((a, b) => b.medianAmount - a.medianAmount);
}
