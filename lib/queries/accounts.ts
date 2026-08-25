import "server-only";
import { desc, eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { accounts, balanceSnapshots, loans, type AccountKind, type Owner } from "@/lib/db/schema";
import type { AccountBalance } from "@/lib/analytics/networth";
import { outstandingAt, type LoanTerms } from "@/lib/domain/emi";

export interface AccountRow extends AccountBalance {
  balanceDate: string | null;
  balanceSource: "manual" | "import" | "loan-schedule" | null;
}

/** Latest known balance per active account. Loan terms beat snapshots for loan accounts;
 *  an account with neither renders as unknown ("—"), never 0. */
export function listAccountsWithBalances(asOf?: string): AccountRow[] {
  const db = getDb();
  const today = asOf ?? new Date().toISOString().slice(0, 10);
  const accountRows = db.select().from(accounts).where(isNull(accounts.archivedAt)).all();
  const loanRows = db.select().from(loans).all();
  const loansByAccount = new Map(loanRows.map((l) => [l.accountId, l]));

  return accountRows.map((a) => {
    const loan = loansByAccount.get(a.id);
    if (loan) {
      const terms: LoanTerms = {
        principal: loan.principal,
        annualRatePct: loan.annualRatePct,
        tenureMonths: loan.tenureMonths,
        startDate: loan.startDate,
      };
      return {
        accountId: a.id,
        name: a.name,
        kind: a.kind,
        category: a.category as "asset" | "liability",
        owner: a.owner,
        balance: outstandingAt(terms, today),
        balanceDate: today,
        balanceSource: "loan-schedule",
      };
    }
    const snap = db
      .select()
      .from(balanceSnapshots)
      .where(eq(balanceSnapshots.accountId, a.id))
      .orderBy(desc(balanceSnapshots.date), desc(balanceSnapshots.id))
      .limit(1)
      .all()[0];
    return {
      accountId: a.id,
      name: a.name,
      kind: a.kind,
      category: a.category as "asset" | "liability",
      owner: a.owner,
      balance: snap ? snap.balance : null,
      balanceDate: snap?.date ?? null,
      balanceSource: snap ? (snap.source as "manual" | "import") : null,
    };
  });
}

export function createAccount(input: {
  name: string;
  kind: AccountKind;
  category: "asset" | "liability";
  owner: Owner;
  openingBalance?: number; // rupees
  asOf?: string;
}): number {
  const db = getDb();
  const inserted = db
    .insert(accounts)
    .values({ name: input.name, kind: input.kind, category: input.category, owner: input.owner })
    .returning({ id: accounts.id })
    .all();
  const id = inserted[0].id;
  if (input.openingBalance !== undefined) {
    db.insert(balanceSnapshots)
      .values({
        accountId: id,
        date: input.asOf ?? new Date().toISOString().slice(0, 10),
        balance: input.openingBalance,
        source: "manual",
      })
      .run();
  }
  return id;
}

export function addSnapshot(input: { accountId: number; date: string; balance: number }): void {
  getDb()
    .insert(balanceSnapshots)
    .values({ accountId: input.accountId, date: input.date, balance: input.balance, source: "manual" })
    .run();
}

export function createLoan(input: {
  accountId: number;
  principal: number;
  annualRatePct: number;
  tenureMonths: number;
  startDate: string;
}): void {
  getDb().insert(loans).values(input).run();
}
