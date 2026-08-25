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

// ---- Phase 2: Investments (mutual funds) ----
// NAV and units are REAL, not integer paise: NAV carries 4 decimal places and units
// carry 3 — the paise invariant applies to money AMOUNTS, not per-unit rates
// (docs/DECISIONS.md 2026-08-25, NAV/units precision).

export const ASSET_CLASSES = ["equity", "debt", "hybrid", "gold", "other"] as const;
export type AssetClass = (typeof ASSET_CLASSES)[number];

// One row per folio+scheme pair found in a CAS. Replace-by-source ('cas'): a CAS
// import wipes prior cas holdings+transactions and re-inserts (snapshot source).
export const mfHoldings = sqliteTable(
  "mf_holdings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    source: text("source").notNull(), // 'cas'
    folio: text("folio").notNull(),
    amc: text("amc").notNull(),
    schemeName: text("scheme_name").notNull(),
    isin: text("isin").notNull(),
    amfiCode: text("amfi_code"), // resolved from AMFI NAVAll by ISIN; null until first NAV refresh
    rta: text("rta"), // CAMS | KFINTECH (as printed in the CAS)
    assetClass: text("asset_class").notNull().default("equity"),
    owner: text("owner").notNull().default("self"),
    openingUnits: real("opening_units").notNull().default(0),
    closingUnits: real("closing_units").notNull().default(0), // CAS-stated closing balance (cross-check for lot math)
    importBatchId: integer("import_batch_id")
      .notNull()
      .references(() => importBatches.id),
  },
  (t) => [uniqueIndex("mf_holdings_source_folio_isin_idx").on(t.source, t.folio, t.isin)],
);

export const mfTransactions = sqliteTable(
  "mf_transactions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    holdingId: integer("holding_id")
      .notNull()
      .references(() => mfHoldings.id),
    date: text("date").notNull(), // ISO yyyy-mm-dd
    description: text("description").notNull(),
    txType: text("tx_type").notNull(), // purchase | purchase_sip | redemption | switch_in | switch_out | dividend_reinvest | dividend_payout | segregation | tax_or_charge | misc
    amount: moneyPaise("amount_paise"), // signed; null when the CAS row carries no amount
    units: real("units"), // signed; null for non-unit rows (stamp duty, STT)
    nav: real("nav"), // price per unit on the row, 4dp
    unitBalance: real("unit_balance"),
    importBatchId: integer("import_batch_id")
      .notNull()
      .references(() => importBatches.id),
  },
  (t) => [index("mf_transactions_holding_date_idx").on(t.holdingId, t.date)],
);

// NAV refresh is idempotent by construction: unique (isin, date) upsert.
export const navHistory = sqliteTable(
  "nav_history",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    isin: text("isin").notNull(),
    date: text("date").notNull(), // ISO yyyy-mm-dd
    nav: real("nav").notNull(),
    source: text("source").notNull(), // mfapi | amfi
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [uniqueIndex("nav_history_isin_date_idx").on(t.isin, t.date)],
);

export const allocationTargets = sqliteTable(
  "allocation_targets",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    assetClass: text("asset_class").notNull(),
    targetPct: real("target_pct").notNull(), // 0..100
    driftBandPct: real("drift_band_pct").notNull().default(5), // alert when |actual − target| exceeds this
  },
  (t) => [uniqueIndex("allocation_targets_class_idx").on(t.assetClass)],
);

// ---- Phase 3: Expenses ----

// Bank/credit-card statement rows. Signed rupees at runtime (debits negative).
// Dedup is row-level (VYUHA's SHA-1 approach — DECISIONS.md: incremental sources
// dedup by row, snapshot sources replace): `hash` covers account+date+amount+
// normalized description+same-tuple occurrence index, so re-importing an
// overlapping statement skips exactly, while two genuinely identical same-day
// payments inside one statement both survive.
export const bankTransactions = sqliteTable(
  "bank_transactions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    accountId: integer("account_id")
      .notNull()
      .references(() => accounts.id),
    date: text("date").notNull(), // ISO yyyy-mm-dd
    description: text("description").notNull(),
    amount: moneyPaise("amount_paise").notNull(), // signed; debit negative
    balance: moneyPaise("balance_paise"), // running balance when the CSV has one
    category: text("category"),
    categorySource: text("category_source"), // rule | manual
    upiRef: text("upi_ref"), // 12-digit UPI RRN when the description carries one
    hash: text("hash").notNull(),
    importBatchId: integer("import_batch_id")
      .notNull()
      .references(() => importBatches.id),
  },
  (t) => [
    uniqueIndex("bank_tx_hash_idx").on(t.hash),
    index("bank_tx_account_date_idx").on(t.accountId, t.date),
  ],
);

// First matching rule (lowest priority number, then id) categorizes a transaction.
export const expenseRules = sqliteTable("expense_rules", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  pattern: text("pattern").notNull(), // case-insensitive substring, or /regex/
  category: text("category").notNull(),
  priority: integer("priority").notNull().default(100),
  createdAt: text("created_at").notNull().default(now),
});

export const budgets = sqliteTable(
  "budgets",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    category: text("category").notNull(),
    monthlyLimit: moneyPaise("monthly_limit_paise").notNull(),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [uniqueIndex("budgets_category_idx").on(t.category)],
);

// ---- Phase 4: Goals & planning ----

export const goals = sqliteTable("goals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  targetAmount: moneyPaise("target_amount_paise").notNull(), // in TODAY's rupees
  targetDate: text("target_date").notNull(), // ISO yyyy-mm-dd
  inflationPct: real("inflation_pct").notNull().default(6), // % p.a., inflates target to targetDate
  expectedReturnPct: real("expected_return_pct").notNull().default(11), // % p.a. on mapped corpus + SIP
  volatilityPct: real("volatility_pct").notNull().default(14), // % p.a., Monte Carlo sigma
  createdAt: text("created_at").notNull().default(now),
  archivedAt: text("archived_at"),
});

export const GOAL_ASSET_TYPES = ["mf_holding", "account", "trading"] as const;
export type GoalAssetType = (typeof GOAL_ASSET_TYPES)[number];

// Earmark a share of an asset to a goal. refId: mf_holdings.id | accounts.id | 0 (trading book).
export const goalMappings = sqliteTable(
  "goal_mappings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    goalId: integer("goal_id")
      .notNull()
      .references(() => goals.id),
    assetType: text("asset_type").notNull(),
    refId: integer("ref_id").notNull(),
    sharePct: real("share_pct").notNull().default(100), // 0..100 of the asset's current value
  },
  (t) => [index("goal_mappings_goal_idx").on(t.goalId)],
);

// ---- Phase 5: Unified tax pack ----

// Per-trade facts from the VYUHA envelope (replace-by-source like the aggregates).
// Needed because ICAI F&O turnover is per-trade |gross P&L| — aggregates can't give it.
export const tradingTrades = sqliteTable(
  "trading_trades",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    source: text("source").notNull(), // 'vyuha'
    symbol: text("symbol").notNull(),
    segment: text("segment").notNull(),
    buyDate: text("buy_date"), // null = unknown (broker P&L imports) — never guessed
    sellDate: text("sell_date"),
    buyValue: moneyPaise("buy_value_paise"),
    sellValue: moneyPaise("sell_value_paise"),
    grossPnl: moneyPaise("gross_pnl_paise"),
    netPnl: moneyPaise("net_pnl_paise").notNull(),
    chargesTotal: moneyPaise("charges_total_paise").notNull().default(0),
    importBatchId: integer("import_batch_id")
      .notNull()
      .references(() => importBatches.id),
  },
  (t) => [index("trading_trades_source_idx").on(t.source)],
);

// Versioned tax rates/thresholds — computations read ONLY from here, never constants
// in code (ROADMAP phase 5). Picker: latest effectiveFrom <= the relevant date.
export const taxRates = sqliteTable(
  "tax_rates",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    key: text("key").notNull(), // e.g. equity_ltcg, equity_stcg, cess, fno_audit, advance_tax
    effectiveFrom: text("effective_from").notNull(), // ISO yyyy-mm-dd
    value: text("value").notNull(), // JSON
    note: text("note"),
  },
  (t) => [uniqueIndex("tax_rates_key_from_idx").on(t.key, t.effectiveFrom)],
);

// Manual carry-forward ledger: losses from past FYs (from filed returns), plus
// notes. Atlas shows current-FY losses eligible to carry, the user records them.
export const lossCarryForward = sqliteTable("loss_carry_forward", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  fy: text("fy").notNull(), // e.g. "2024-25" (FY the loss arose)
  lossType: text("loss_type").notNull(), // stcl | ltcl | fno | speculative
  amount: moneyPaise("amount_paise").notNull(), // positive rupees
  note: text("note"),
  createdAt: text("created_at").notNull().default(now),
});

// ---- Phase 6: Protection & estate ----

export const INSURANCE_KINDS = ["life", "health", "motor", "other"] as const;
export type InsuranceKind = (typeof INSURANCE_KINDS)[number];

export const PREMIUM_FREQUENCIES = ["yearly", "half_yearly", "quarterly", "monthly", "single"] as const;
export type PremiumFrequency = (typeof PREMIUM_FREQUENCIES)[number];

export const insurancePolicies = sqliteTable("insurance_policies", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  kind: text("kind").notNull(), // life | health | motor | other
  insurer: text("insurer").notNull(),
  policyNo: text("policy_no").notNull(),
  planName: text("plan_name"),
  sumAssured: moneyPaise("sum_assured_paise").notNull(),
  premium: moneyPaise("premium_paise").notNull(), // per premiumFrequency period
  premiumFrequency: text("premium_frequency").notNull().default("yearly"),
  renewalDate: text("renewal_date").notNull(), // next premium due / renewal, ISO yyyy-mm-dd
  startDate: text("start_date"),
  owner: text("owner").notNull().default("self"),
  note: text("note"),
  createdAt: text("created_at").notNull().default(now),
  archivedAt: text("archived_at"),
});

export const NOMINEE_ASSET_TYPES = ["insurance", "mf_holding", "account", "trading"] as const;
export type NomineeAssetType = (typeof NOMINEE_ASSET_TYPES)[number];

// Nominee registry across ALL asset types. refId: insurance_policies.id |
// mf_holdings.id | accounts.id | 0 (trading book). CAS-sourced rows are
// replace-by-source with the CAS import; manual rows survive it (re-mapped by
// folio+ISIN like the holding overrides).
export const nominees = sqliteTable(
  "nominees",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    assetType: text("asset_type").notNull(),
    refId: integer("ref_id").notNull(),
    name: text("name").notNull(),
    relationship: text("relationship"),
    sharePct: real("share_pct"), // 0..100; null = share not stated (a CAS prints names only — never fabricated)
    source: text("source").notNull().default("manual"), // manual | cas
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [index("nominees_asset_idx").on(t.assetType, t.refId)],
);

// Single row (id = 1): adequacy assumptions the user edits (every one surfaces
// on screen as an ASSUMPTION — invariant 6) plus estate contacts/instructions
// bundled into the death pack.
export const protectionSettings = sqliteTable("protection_settings", {
  id: integer("id").primaryKey(), // fixed 1
  yearsOfExpenses: real("years_of_expenses").notNull().default(15),
  annualIncome: moneyPaise("annual_income_paise"), // null until the user states it
  incomeMultiple: real("income_multiple").notNull().default(10),
  contactsJson: text("contacts_json"), // JSON [{name, relation, phone, note}]
  instructions: text("instructions"),
  updatedAt: text("updated_at").notNull().default(now),
});

export const importBatches = sqliteTable("import_batches", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  source: text("source").notNull(),
  fileName: text("file_name"),
  meta: text("meta"), // JSON: envelope version, counts, createdAt of the envelope
  createdAt: text("created_at").notNull().default(now),
});
