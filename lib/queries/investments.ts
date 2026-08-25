import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  allocationTargets,
  importBatches,
  mfHoldings,
  mfTransactions,
  navHistory,
  nominees,
  type AssetClass,
} from "@/lib/db/schema";
import type { CasParseOk } from "@/lib/import/cas-parse";
import { guessAssetClass, computeAllocation, type AllocationRow, type AllocationTarget } from "@/lib/analytics/allocation";
import { computePortfolio, type PortfolioView } from "@/lib/analytics/portfolio";
import type { LotTx } from "@/lib/domain/lots";

const SOURCE = "cas";

/** Replace-by-source (docs/DECISIONS.md): a CAS is a complete history snapshot, so
 *  prior cas rows are wiped and re-inserted in one transaction. User overrides on
 *  holdings (assetClass, owner) survive re-import, keyed by folio+ISIN. */
export function replaceCasFacts(parse: CasParseOk, fileName: string | null): { holdings: number; transactions: number } {
  const db = getDb();
  return db.transaction((tx) => {
    // Preserve user overrides across the wipe.
    const prior = tx
      .select({
        id: mfHoldings.id,
        folio: mfHoldings.folio,
        isin: mfHoldings.isin,
        assetClass: mfHoldings.assetClass,
        owner: mfHoldings.owner,
      })
      .from(mfHoldings)
      .where(eq(mfHoldings.source, SOURCE))
      .all();
    const overrides = new Map(prior.map((p) => [`${p.folio}::${p.isin}`, p]));

    // Manual nominee rows survive the wipe re-keyed by folio+ISIN (same rule as
    // the holding overrides); CAS-sourced nominee rows are replace-by-source.
    const keyByOldId = new Map(prior.map((p) => [p.id, `${p.folio}::${p.isin}`]));
    const manualNoms = tx
      .select()
      .from(nominees)
      .where(and(eq(nominees.assetType, "mf_holding"), eq(nominees.source, "manual")))
      .all()
      .map((n) => ({ ...n, key: keyByOldId.get(n.refId) ?? null }))
      .filter((n) => n.key !== null);

    const priorIds = prior.map((r) => r.id);
    if (priorIds.length > 0) {
      tx.delete(mfTransactions).where(inArray(mfTransactions.holdingId, priorIds)).run();
    }
    tx.delete(nominees).where(eq(nominees.assetType, "mf_holding")).run();
    tx.delete(mfHoldings).where(eq(mfHoldings.source, SOURCE)).run();

    const batch = tx
      .insert(importBatches)
      .values({
        source: SOURCE,
        fileName,
        meta: JSON.stringify({
          periodFrom: parse.statement.periodFrom,
          periodTo: parse.statement.periodTo,
          summaryTotal: parse.statement.summaryTotal,
          holdingCount: parse.holdings.length,
          warningCount: parse.warnings.length,
        }),
      })
      .returning({ id: importBatches.id })
      .all();
    const importBatchId = batch[0].id;

    let txCount = 0;
    const newIdByKey = new Map<string, number>();
    for (const h of parse.holdings) {
      const override = overrides.get(`${h.folio}::${h.isin}`);
      const inserted = tx
        .insert(mfHoldings)
        .values({
          source: SOURCE,
          folio: h.folio,
          amc: h.amc,
          schemeName: h.schemeName,
          isin: h.isin,
          rta: h.rta,
          assetClass: override?.assetClass ?? guessAssetClass(h.schemeName),
          owner: override?.owner ?? "self",
          openingUnits: h.openingUnits,
          closingUnits: h.closingUnits,
          importBatchId,
        })
        .returning({ id: mfHoldings.id })
        .all();
      const holdingId = inserted[0].id;
      newIdByKey.set(`${h.folio}::${h.isin}`, holdingId);
      // CAS prints nominee NAMES only — sharePct stays null, never fabricated.
      for (const name of h.nominees) {
        tx.insert(nominees)
          .values({ assetType: "mf_holding", refId: holdingId, name, sharePct: null, source: SOURCE })
          .run();
      }
      for (const t of h.transactions) {
        tx.insert(mfTransactions)
          .values({
            holdingId,
            date: t.date,
            description: t.description,
            txType: t.txType,
            amount: t.amount,
            units: t.units,
            nav: t.nav,
            unitBalance: t.unitBalance,
            importBatchId,
          })
          .run();
        txCount++;
      }
      // Seed nav_history from the CAS's own closing NAV — a real observed value.
      if (h.casNav !== null && h.casNavDate) {
        tx.insert(navHistory)
          .values({ isin: h.isin, date: h.casNavDate, nav: h.casNav, source: "cas" })
          .onConflictDoUpdate({
            target: [navHistory.isin, navHistory.date],
            set: { nav: h.casNav, source: "cas" },
          })
          .run();
      }
    }
    // Re-attach surviving manual nominee rows to the fresh holding ids.
    for (const n of manualNoms) {
      const newId = newIdByKey.get(n.key!);
      if (newId !== undefined) {
        tx.insert(nominees)
          .values({
            assetType: "mf_holding",
            refId: newId,
            name: n.name,
            relationship: n.relationship,
            sharePct: n.sharePct,
            source: "manual",
          })
          .run();
      }
    }
    return { holdings: parse.holdings.length, transactions: txCount };
  });
}

export interface InvestmentsView {
  imported: boolean;
  portfolio: PortfolioView | null;
  allocation: { rows: AllocationRow[]; totalValue: number } | null;
  targets: AllocationTarget[];
  batch: { fileName: string | null; createdAt: string; meta: Record<string, unknown> } | null;
  navAsOf: string | null; // newest NAV date across held schemes
  staleIsinCount: number; // held schemes whose NAV is older than the newest date
}

export function getInvestmentsView(): InvestmentsView {
  const db = getDb();
  const holdings = db.select().from(mfHoldings).where(eq(mfHoldings.source, SOURCE)).all();
  const targets = db.select().from(allocationTargets).all();
  if (holdings.length === 0) {
    return {
      imported: false,
      portfolio: null,
      allocation: null,
      targets,
      batch: null,
      navAsOf: null,
      staleIsinCount: 0,
    };
  }
  const txRows = db
    .select()
    .from(mfTransactions)
    .where(inArray(mfTransactions.holdingId, holdings.map((h) => h.id)))
    .all();
  const txByHolding = new Map<number, LotTx[]>();
  for (const t of txRows) {
    const list = txByHolding.get(t.holdingId) ?? [];
    list.push({ date: t.date, txType: t.txType as LotTx["txType"], amount: t.amount, units: t.units, nav: t.nav });
    txByHolding.set(t.holdingId, list);
  }
  // Latest NAV per ISIN.
  const navRows = db
    .select({
      isin: navHistory.isin,
      date: sql<string>`max(${navHistory.date})`,
      nav: navHistory.nav,
    })
    .from(navHistory)
    .where(inArray(navHistory.isin, [...new Set(holdings.map((h) => h.isin))]))
    .groupBy(navHistory.isin)
    .all();
  const navByIsin = new Map(navRows.map((n) => [n.isin, { nav: n.nav, date: n.date }]));

  const portfolio = computePortfolio(
    holdings.map((h) => ({
      id: h.id,
      schemeName: h.schemeName,
      folio: h.folio,
      amc: h.amc,
      isin: h.isin,
      assetClass: h.assetClass,
      owner: h.owner,
      closingUnits: h.closingUnits,
      transactions: txByHolding.get(h.id) ?? [],
      latestNav: navByIsin.get(h.isin)?.nav ?? null,
      latestNavDate: navByIsin.get(h.isin)?.date ?? null,
    })),
  );
  const allocation = computeAllocation(
    portfolio.holdings.filter((h) => h.unitsHeld > 0.0005),
    targets,
  );

  const heldIsins = new Set(portfolio.holdings.filter((h) => h.unitsHeld > 0.0005).map((h) => h.isin));
  let navAsOf: string | null = null;
  for (const isin of heldIsins) {
    const d = navByIsin.get(isin)?.date ?? null;
    if (d && (navAsOf === null || d > navAsOf)) navAsOf = d;
  }
  const staleIsinCount = [...heldIsins].filter((i) => (navByIsin.get(i)?.date ?? "") < (navAsOf ?? "")).length;

  const batchRow = db
    .select()
    .from(importBatches)
    .where(eq(importBatches.source, SOURCE))
    .orderBy(desc(importBatches.id))
    .limit(1)
    .all()[0];

  return {
    imported: true,
    portfolio,
    allocation,
    targets,
    batch: batchRow
      ? { fileName: batchRow.fileName, createdAt: batchRow.createdAt, meta: JSON.parse(batchRow.meta ?? "{}") }
      : null,
    navAsOf,
    staleIsinCount,
  };
}

/** Current MF book value for the net-worth Map: null when nothing is imported. */
export function getMfBookValue(): { value: number; navAsOf: string | null } | null {
  const view = getInvestmentsView();
  if (!view.imported || !view.portfolio) return null;
  return { value: view.portfolio.totalValue, navAsOf: view.navAsOf };
}

export function listHoldingsForNavRefresh(): { id: number; isin: string; amfiCode: string | null }[] {
  const db = getDb();
  return db
    .select({ id: mfHoldings.id, isin: mfHoldings.isin, amfiCode: mfHoldings.amfiCode })
    .from(mfHoldings)
    .where(eq(mfHoldings.source, SOURCE))
    .all();
}

export function setHoldingAmfiCode(id: number, amfiCode: string): void {
  getDb().update(mfHoldings).set({ amfiCode }).where(eq(mfHoldings.id, id)).run();
}

/** Idempotent by construction: unique (isin, date) upsert. */
export function upsertNavs(rows: { isin: string; date: string; nav: number; source: string }[]): number {
  const db = getDb();
  let n = 0;
  db.transaction((tx) => {
    for (const r of rows) {
      tx.insert(navHistory)
        .values(r)
        .onConflictDoUpdate({ target: [navHistory.isin, navHistory.date], set: { nav: r.nav, source: r.source } })
        .run();
      n++;
    }
  });
  return n;
}

export function updateHolding(id: number, patch: { assetClass?: AssetClass; owner?: string }): void {
  getDb().update(mfHoldings).set(patch).where(eq(mfHoldings.id, id)).run();
}

/** Replace all allocation targets (the editor submits the full set). */
export function setAllocationTargets(rows: { assetClass: string; targetPct: number; driftBandPct: number }[]): void {
  const db = getDb();
  db.transaction((tx) => {
    tx.delete(allocationTargets).run();
    for (const r of rows) {
      tx.insert(allocationTargets).values(r).run();
    }
  });
}
