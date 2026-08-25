CREATE TABLE `bank_transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer NOT NULL,
	`date` text NOT NULL,
	`description` text NOT NULL,
	`amount_paise` integer NOT NULL,
	`balance_paise` integer,
	`category` text,
	`category_source` text,
	`upi_ref` text,
	`hash` text NOT NULL,
	`import_batch_id` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`import_batch_id`) REFERENCES `import_batches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bank_tx_hash_idx` ON `bank_transactions` (`hash`);--> statement-breakpoint
CREATE INDEX `bank_tx_account_date_idx` ON `bank_transactions` (`account_id`,`date`);--> statement-breakpoint
CREATE TABLE `budgets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`category` text NOT NULL,
	`monthly_limit_paise` integer NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `budgets_category_idx` ON `budgets` (`category`);--> statement-breakpoint
CREATE TABLE `expense_rules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`pattern` text NOT NULL,
	`category` text NOT NULL,
	`priority` integer DEFAULT 100 NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
