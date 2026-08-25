CREATE TABLE `loss_carry_forward` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`fy` text NOT NULL,
	`loss_type` text NOT NULL,
	`amount_paise` integer NOT NULL,
	`note` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tax_rates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text NOT NULL,
	`effective_from` text NOT NULL,
	`value` text NOT NULL,
	`note` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tax_rates_key_from_idx` ON `tax_rates` (`key`,`effective_from`);--> statement-breakpoint
CREATE TABLE `trading_trades` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source` text NOT NULL,
	`symbol` text NOT NULL,
	`segment` text NOT NULL,
	`buy_date` text,
	`sell_date` text,
	`buy_value_paise` integer,
	`sell_value_paise` integer,
	`gross_pnl_paise` integer,
	`net_pnl_paise` integer NOT NULL,
	`charges_total_paise` integer DEFAULT 0 NOT NULL,
	`import_batch_id` integer NOT NULL,
	FOREIGN KEY (`import_batch_id`) REFERENCES `import_batches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `trading_trades_source_idx` ON `trading_trades` (`source`);