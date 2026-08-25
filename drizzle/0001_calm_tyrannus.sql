CREATE TABLE `trading_capital` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source` text NOT NULL,
	`bucket` text NOT NULL,
	`as_of_date` text NOT NULL,
	`opening_capital_paise` integer NOT NULL,
	`realised_pnl_to_date_paise` integer NOT NULL,
	`import_batch_id` integer NOT NULL,
	FOREIGN KEY (`import_batch_id`) REFERENCES `import_batches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `trading_charges` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source` text NOT NULL,
	`charge_type` text NOT NULL,
	`amount_paise` integer NOT NULL,
	`import_batch_id` integer NOT NULL,
	FOREIGN KEY (`import_batch_id`) REFERENCES `import_batches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `trading_open_positions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source` text NOT NULL,
	`symbol` text NOT NULL,
	`segment` text NOT NULL,
	`invested_paise` integer NOT NULL,
	`unrealized_pnl_paise` integer,
	`import_batch_id` integer NOT NULL,
	FOREIGN KEY (`import_batch_id`) REFERENCES `import_batches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `trading_segments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source` text NOT NULL,
	`segment` text NOT NULL,
	`realized_pnl_paise` integer NOT NULL,
	`charges_paise` integer NOT NULL,
	`trade_count` integer NOT NULL,
	`wins` integer NOT NULL,
	`import_batch_id` integer NOT NULL,
	FOREIGN KEY (`import_batch_id`) REFERENCES `import_batches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `trading_periods` ADD `gross_pnl_paise` integer DEFAULT 0 NOT NULL;