CREATE TABLE `accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`category` text NOT NULL,
	`owner` text DEFAULT 'self' NOT NULL,
	`note` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`archived_at` text
);
--> statement-breakpoint
CREATE INDEX `accounts_category_idx` ON `accounts` (`category`);--> statement-breakpoint
CREATE TABLE `balance_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer NOT NULL,
	`date` text NOT NULL,
	`balance_paise` integer NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `snapshots_account_date_idx` ON `balance_snapshots` (`account_id`,`date`);--> statement-breakpoint
CREATE TABLE `import_batches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source` text NOT NULL,
	`file_name` text,
	`meta` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `loans` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer NOT NULL,
	`principal_paise` integer NOT NULL,
	`annual_rate_pct` real NOT NULL,
	`tenure_months` integer NOT NULL,
	`start_date` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `trading_cashflows` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source` text NOT NULL,
	`date` text NOT NULL,
	`type` text NOT NULL,
	`amount_paise` integer NOT NULL,
	`import_batch_id` integer NOT NULL,
	FOREIGN KEY (`import_batch_id`) REFERENCES `import_batches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `trading_cashflows_source_idx` ON `trading_cashflows` (`source`);--> statement-breakpoint
CREATE TABLE `trading_periods` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source` text NOT NULL,
	`period` text NOT NULL,
	`realized_pnl_paise` integer NOT NULL,
	`charges_paise` integer NOT NULL,
	`trade_count` integer NOT NULL,
	`import_batch_id` integer NOT NULL,
	FOREIGN KEY (`import_batch_id`) REFERENCES `import_batches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `trading_periods_source_period_idx` ON `trading_periods` (`source`,`period`);