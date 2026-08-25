CREATE TABLE `insurance_policies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`insurer` text NOT NULL,
	`policy_no` text NOT NULL,
	`plan_name` text,
	`sum_assured_paise` integer NOT NULL,
	`premium_paise` integer NOT NULL,
	`premium_frequency` text DEFAULT 'yearly' NOT NULL,
	`renewal_date` text NOT NULL,
	`start_date` text,
	`owner` text DEFAULT 'self' NOT NULL,
	`note` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`archived_at` text
);
--> statement-breakpoint
CREATE TABLE `nominees` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`asset_type` text NOT NULL,
	`ref_id` integer NOT NULL,
	`name` text NOT NULL,
	`relationship` text,
	`share_pct` real,
	`source` text DEFAULT 'manual' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `nominees_asset_idx` ON `nominees` (`asset_type`,`ref_id`);--> statement-breakpoint
CREATE TABLE `protection_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`years_of_expenses` real DEFAULT 15 NOT NULL,
	`annual_income_paise` integer,
	`income_multiple` real DEFAULT 10 NOT NULL,
	`contacts_json` text,
	`instructions` text,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
