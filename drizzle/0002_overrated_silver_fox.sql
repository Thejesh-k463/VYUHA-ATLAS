CREATE TABLE `allocation_targets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`asset_class` text NOT NULL,
	`target_pct` real NOT NULL,
	`drift_band_pct` real DEFAULT 5 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `allocation_targets_class_idx` ON `allocation_targets` (`asset_class`);--> statement-breakpoint
CREATE TABLE `mf_holdings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source` text NOT NULL,
	`folio` text NOT NULL,
	`amc` text NOT NULL,
	`scheme_name` text NOT NULL,
	`isin` text NOT NULL,
	`amfi_code` text,
	`rta` text,
	`asset_class` text DEFAULT 'equity' NOT NULL,
	`owner` text DEFAULT 'self' NOT NULL,
	`opening_units` real DEFAULT 0 NOT NULL,
	`closing_units` real DEFAULT 0 NOT NULL,
	`import_batch_id` integer NOT NULL,
	FOREIGN KEY (`import_batch_id`) REFERENCES `import_batches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mf_holdings_source_folio_isin_idx` ON `mf_holdings` (`source`,`folio`,`isin`);--> statement-breakpoint
CREATE TABLE `mf_transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`holding_id` integer NOT NULL,
	`date` text NOT NULL,
	`description` text NOT NULL,
	`tx_type` text NOT NULL,
	`amount_paise` integer,
	`units` real,
	`nav` real,
	`unit_balance` real,
	`import_batch_id` integer NOT NULL,
	FOREIGN KEY (`holding_id`) REFERENCES `mf_holdings`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`import_batch_id`) REFERENCES `import_batches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `mf_transactions_holding_date_idx` ON `mf_transactions` (`holding_id`,`date`);--> statement-breakpoint
CREATE TABLE `nav_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`isin` text NOT NULL,
	`date` text NOT NULL,
	`nav` real NOT NULL,
	`source` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `nav_history_isin_date_idx` ON `nav_history` (`isin`,`date`);