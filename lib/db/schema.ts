import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { customType } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// Money is integer paise in the DB, rupees at runtime (AGENTS.md invariant 1).
// The conversion happens HERE and nowhere else.
export const moneyPaise = customType<{ data: number; driverData: number }>({
  dataType: () => "integer",
  toDriver: (rupees) => Math.round(rupees * 100),
  fromDriver: (paise) => paise / 100,
});

const now = sql`(datetime('now'))`;

export const ACCOUNT_KINDS = [
  "bank",
  "cash",
  "demat",
  "mutual_fund",
  "epf",
  "nps",
  "ppf",
  "fd",
  "gold",
  "property",
  "crypto",
  "trading",
  "receivable",
  "loan",
  "credit_card",
  "other_asset",
  "other_liability",
] as const;
export type AccountKind = (typeof ACCOUNT_KINDS)[number];

export const OWNERS = ["self", "spouse", "joint", "family"] as const;
export type Owner = (typeof OWNERS)[number];

// category is derivable from kind for the built-in kinds, but stored explicitly so
// user-defined semantics never depend on a lookup table (invariant 6: no fabrication).
export const accounts = sqliteTable(
  "accounts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    kind: text("kind").notNull(),
    category: text("category").notNull(), // asset | liability
    owner: text("owner").notNull().default("self"),
    note: text("note"),
    createdAt: text("created_at").notNull().default(now),
    archivedAt: text("archived_at"),
  },
  (t) => [index("accounts_category_idx").on(t.category)],
);

// Point-in-time value of an account. Balance-valued assets (EPF, property, gold)
// live entirely here; latest snapshot per account wins.
export const balanceSnapshots = sqliteTable(
  "balance_snapshots",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    accountId: integer("account_id")
      .notNull()
      .references(() => accounts.id),
    date: text("date").notNull(), // ISO yyyy-mm-dd
    balance: moneyPaise("balance_paise").notNull(),
    source: text("source").notNull().default("manual"), // manual | import | derived
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [index("snapshots_account_date_idx").on(t.accountId, t.date)],
);

export const loans = sqliteTable("loans", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  accountId: integer("account_id")
    .notNull()
    .references(() => accounts.id),
  principal: moneyPaise("principal_paise").notNull(),
  annualRatePct: real("annual_rate_pct").notNull(),
  tenureMonths: integer("tenure_months").notNull(),
  startDate: text("start_date").notNull(), // ISO yyyy-mm-dd, first EMI month
  createdAt: text("created_at").notNull().default(now),
});

// Trading facts imported one-way from VYUHA (AGENTS.md invariants 3-5).
// Replace-by-source: an import wipes prior rows for its source and re-inserts.
export const tradingPeriods = sqliteTable(
  "trading_periods",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    source: text("source").notNull(), // 'vyuha'
    period: text("period").notNull(), // yyyy-mm
    realizedPnl: moneyPaise("realized_pnl_paise").notNull(),
    grossPnl: moneyPaise("gross_pnl_paise").notNull().default(0),
    charges: moneyPaise("charges_paise").notNull(),
    tradeCount: integer("trade_count").notNull(),
    importBatchId: integer("import_batch_id")
      .notNull()
      .references(() => importBatches.id),
  },
  (t) => [uniqueIndex("trading_periods_source_period_idx").on(t.source, t.period)],
);

export const tradingSegments = sqliteTable("trading_segments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  source: text("source").notNull(),
  segment: text("segment").notNull(), // VYUHA segment key, e.g. eq_delivery
  realizedPnl: moneyPaise("realized_pnl_paise").notNull(),
  charges: moneyPaise("charges_paise").notNull(),
  tradeCount: integer("trade_count").notNull(),
  wins: integer("wins").notNull(),
  importBatchId: integer("import_batch_id")
    .notNull()
    .references(() => importBatches.id),
});

export const tradingCharges = sqliteTable("trading_charges", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  source: text("source").notNull(),
  chargeType: text("charge_type").notNull(), // brokerage | sttCtt | ... (VYUHA column names)
  amount: moneyPaise("amount_paise").notNull(),
  importBatchId: integer("import_batch_id")
    .notNull()
    .references(() => importBatches.id),
});

export const tradingOpenPositions = sqliteTable("trading_open_positions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  source: text("source").notNull(),
  symbol: text("symbol").notNull(),
  segment: text("segment").notNull(),
  invested: moneyPaise("invested_paise").notNull(), // buy value of the open position
  unrealizedPnl: moneyPaise("unrealized_pnl_paise"), // null when VYUHA has no MTM price
  importBatchId: integer("import_batch_id")
    .notNull()
    .references(() => importBatches.id),
});

export const tradingCapital = sqliteTable("trading_capital", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  source: text("source").notNull(),
  bucket: text("bucket").notNull(), // equity | active
  asOfDate: text("as_of_date").notNull(),
  openingCapital: moneyPaise("opening_capital_paise").notNull(),
  realisedPnlToDate: moneyPaise("realised_pnl_to_date_paise").notNull(),
  importBatchId: integer("import_batch_id")
    .notNull()
    .references(() => importBatches.id),
});

export const tradingCashflows = sqliteTable(
  "trading_cashflows",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    source: text("source").notNull(),
    date: text("date").notNull(),
    type: text("type").notNull(), // deposit | withdrawal | dividend | dividend_tds | other
    amount: moneyPaise("amount_paise").notNull(), // signed, VYUHA convention preserved
    importBatchId: integer("import_batch_id")
      .notNull()
      .references(() => importBatches.id),
  },
  (t) => [index("trading_cashflows_source_idx").on(t.source)],
);

export const importBatches = sqliteTable("import_batches", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  source: text("source").notNull(),
  fileName: text("file_name"),
  meta: text("meta"), // JSON: envelope version, counts, createdAt of the envelope
  createdAt: text("created_at").notNull().default(now),
});
