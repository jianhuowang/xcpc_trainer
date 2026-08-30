CREATE TABLE `contests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`platform` text DEFAULT 'other' NOT NULL,
	`contest_url` text DEFAULT '' NOT NULL,
	`started_at` text NOT NULL,
	`duration_minutes` integer,
	`status` text DEFAULT 'reviewed' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `contests_started_at_idx` ON `contests` (`started_at`);--> statement-breakpoint
CREATE TABLE `reminder_jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`dedupe_key` text NOT NULL,
	`channel` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`payload` text NOT NULL,
	`scheduled_for` text NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`last_error` text DEFAULT '' NOT NULL,
	`delivered_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reminder_jobs_dedupe_idx` ON `reminder_jobs` (`dedupe_key`);--> statement-breakpoint
CREATE INDEX `reminder_jobs_status_idx` ON `reminder_jobs` (`status`);--> statement-breakpoint
ALTER TABLE `problems` ADD `contest_id` integer REFERENCES contests(id);--> statement-breakpoint
CREATE INDEX `problems_contest_idx` ON `problems` (`contest_id`);