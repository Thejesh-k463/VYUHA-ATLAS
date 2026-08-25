CREATE TABLE `goal_mappings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`goal_id` integer NOT NULL,
	`asset_type` text NOT NULL,
	`ref_id` integer NOT NULL,
	`share_pct` real DEFAULT 100 NOT NULL,
	FOREIGN KEY (`goal_id`) REFERENCES `goals`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `goal_mappings_goal_idx` ON `goal_mappings` (`goal_id`);--> statement-breakpoint
CREATE TABLE `goals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`target_amount_paise` integer NOT NULL,
	`target_date` text NOT NULL,
	`inflation_pct` real DEFAULT 6 NOT NULL,
	`expected_return_pct` real DEFAULT 11 NOT NULL,
	`volatility_pct` real DEFAULT 14 NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`archived_at` text
);
