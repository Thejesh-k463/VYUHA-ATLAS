import "server-only";
import { eq, isNull, ne, or } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  balanceSnapshots,
  bankTransactions,
  budgets,
  expenseRules,
  importBatches,
} from "@/lib/db/schema";
import type { ParsedBankRow } from "@/lib/import/bank-csv";
import { computeRowHashes, extractUpiRef } from "@/lib/domain/dedup";
import { categorize, type RuleDef } from "@/lib/domain/rules";
import {
  budgetStatus,
  detectRecurring,
  effectiveCategory,
  findTransferPairs,
  monthKey,
  summarizeMonth,
  type BudgetRow,
  type ExpenseTx,
  type MonthSummary,
  type RecurringItem,
} from "@/lib/analytics/expenses";

const SOURCE = "bank_csv";

export interface BankImportOutcome {
  inserted: number;
  duplicatesSkipped: number;
  categorized: number;
  balanceSnapshotDate: string | null;
}

/** Row-level dedup insert (unique hash + ON CONFLICT DO NOTHING — the DB is the
 *  enforcement). Rules categorize at insert; a balance-bearing statement also
 *  drops a balance snapshot at its latest dated row so net worth follows. */
export function insertBankTransactions(
  accountId: number,
  rows: ParsedBankRow[],
  fileName: string | null,
  meta: Record<string, unknown>,
): BankImportOutcome {
  const db = getDb();
  const rules = db.select().from(expenseRules).all();
  return db.transaction((tx) => {
    const batch = tx
      .insert(importBatches)
      .values({ source: SOURCE, fileName, meta: JSON.stringify(meta) })
      .returning({ id: importBatches.id })
      .all();
    const importBatchId = batch[0].id;
    const hashes = computeRowHashes(rows.map((r) => ({ ...r, accountId })));
    let inserted = 0;
    let categorized = 0;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const match = categorize(rules as RuleDef[], r.description);
      if (match) categorized++;
      const res = tx
        .insert(bankTransactions)
        .values({
          accountId,
          date: r.date,
          description: r.description,
          amount: r.amount,
          balance: r.balance,
          category: match?.category ?? null,
          categorySource: match ? "rule" : null,
          upiRef: extractUpiRef(r.description),
          hash: hashes[i],
          importBatchId,
        })
        .onConflictDoNothing({ target: bankTransactions.hash })
        .run();
      inserted += res.changes;
    }
    // Latest dated row with a known balance → snapshot (source 'import').
    let balanceSnapshotDate: string | null = null;
    const withBalance = rows.filter((r) => r.balance !== null);
    if (withBalance.length > 0) {
      const latest = withBalance.reduce((a, b) => (a.date >= b.date ? a : b));
      tx.insert(balanceSnapshots)
        .values({ accountId, date: latest.date, balance: latest.balance!, source: "import" })
        .run();
      balanceSnapshotDate = latest.date;
    }
    return { inserted, duplicatesSkipped: rows.length - inserted, categorized, balanceSnapshotDate };
  });
}

function loadAllTx(): ExpenseTx[] {
  const db = getDb();
  return db
    .select({
      id: bankTransactions.id,
      accountId: bankTransactions.accountId,
      date: bankTransactions.date,
      description: bankTransactions.description,
      amount: bankTransactions.amount,
      category: bankTransactions.category,
      upiRef: bankTransactions.upiRef,
    })
    .from(bankTransactions)
    .all();
}

export interface ExpensesView {
  imported: boolean;
  month: string;
  months: string[]; // every month with data, desc
  summary: MonthSummary | null;
  budgets: BudgetRow[];
  budgetRows: { id: number; category: string; monthlyLimit: number }[];
  recurring: RecurringItem[];
  transactions: {
    id: number;
    date: string;
    description: string;
    amount: number;
    category: string | null; // effective (incl. auto-transfer)
    categorySource: string | null;
    accountId: number;
  }[];
  categories: string[]; // known categories for the select
}

export function getExpensesView(month?: string): ExpensesView {
  const db = getDb();
  const all = loadAllTx();
  if (all.length === 0) {
    return {
      imported: false,
      month: month ?? "",
      months: [],
      summary: null,
      budgets: [],
      budgetRows: [],
      recurring: [],
      transactions: [],
      categories: [],
    };
  }
  const months = [...new Set(all.map((t) => monthKey(t.date)))].sort().reverse();
  const m = month && months.includes(month) ? month : months[0];
  const summary = summarizeMonth(all, m);
  const budgetDefs = db.select().from(budgets).all();
  const transferIds = findTransferPairs(all);
  const sourceById = new Map(
    db
      .select({ id: bankTransactions.id, categorySource: bankTransactions.categorySource })
      .from(bankTransactions)
      .all()
      .map((r) => [r.id, r.categorySource]),
  );
  const monthTx = all
    .filter((t) => monthKey(t.date) === m)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id))
    .map((t) => ({
      id: t.id,
      date: t.date,
      description: t.description,
      amount: t.amount,
      category: effectiveCategory(t, transferIds),
      categorySource: sourceById.get(t.id) ?? null,
      accountId: t.accountId,
    }));
  const categories = [
    ...new Set([
      ...all.map((t) => t.category).filter((c): c is string => c !== null),
      ...budgetDefs.map((b) => b.category),
      ...db.select().from(expenseRules).all().map((r) => r.category),
      "transfer",
    ]),
  ].sort();
  return {
    imported: true,
    month: m,
    months,
    summary,
    budgets: budgetStatus(summary, budgetDefs),
    budgetRows: budgetDefs.map((b) => ({ id: b.id, category: b.category, monthlyLimit: b.monthlyLimit })),
    recurring: detectRecurring(all),
    transactions: monthTx,
    categories,
  };
}

export function setTransactionCategory(id: number, category: string | null): void {
  getDb()
    .update(bankTransactions)
    .set({ category, categorySource: category === null ? null : "manual" })
    .where(eq(bankTransactions.id, id))
    .run();
}

export function listRules(): { id: number; pattern: string; category: string; priority: number }[] {
  return getDb()
    .select({
      id: expenseRules.id,
      pattern: expenseRules.pattern,
      category: expenseRules.category,
      priority: expenseRules.priority,
    })
    .from(expenseRules)
    .orderBy(expenseRules.priority, expenseRules.id)
    .all();
}

export function addRule(pattern: string, category: string, priority: number): number {
  const r = getDb()
    .insert(expenseRules)
    .values({ pattern, category, priority })
    .returning({ id: expenseRules.id })
    .all();
  return r[0].id;
}

export function deleteRule(id: number): void {
  getDb().delete(expenseRules).where(eq(expenseRules.id, id)).run();
}

/** Re-run rules over every transaction not manually categorized. Manual wins, always. */
export function applyRulesToExisting(): number {
  const db = getDb();
  const rules = listRules();
  const txs = db
    .select({ id: bankTransactions.id, description: bankTransactions.description, category: bankTransactions.category })
    .from(bankTransactions)
    .where(or(isNull(bankTransactions.categorySource), ne(bankTransactions.categorySource, "manual")))
    .all();
  let changed = 0;
  db.transaction((t) => {
    for (const row of txs) {
      const match = categorize(rules, row.description);
      const next = match?.category ?? null;
      if (next !== row.category) {
        t.update(bankTransactions)
          .set({ category: next, categorySource: match ? "rule" : null })
          .where(eq(bankTransactions.id, row.id))
          .run();
        changed++;
      }
    }
  });
  return changed;
}

export function setBudget(category: string, monthlyLimit: number): void {
  getDb()
    .insert(budgets)
    .values({ category, monthlyLimit })
    .onConflictDoUpdate({ target: budgets.category, set: { monthlyLimit } })
    .run();
}

export function deleteBudget(id: number): void {
  getDb().delete(budgets).where(eq(budgets.id, id)).run();
}

/** Monthly spend total (transfers excluded) for the last n months — Map sparkline fodder. */
export function recentSpending(nMonths: number): { month: string; spent: number; income: number }[] {
  const all = loadAllTx();
  const months = [...new Set(all.map((t) => monthKey(t.date)))].sort().reverse().slice(0, nMonths);
  return months.map((m) => {
    const s = summarizeMonth(all, m);
    return { month: m, spent: s.spent, income: s.income };
  });
}
