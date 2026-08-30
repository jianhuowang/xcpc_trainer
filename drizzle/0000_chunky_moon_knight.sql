CREATE TABLE `attempts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`problem_id` integer NOT NULL,
	`context` text DEFAULT 'initial' NOT NULL,
	`evidence` text NOT NULL,
	`previous_stage` integer DEFAULT 0 NOT NULL,
	`next_stage` integer DEFAULT 0 NOT NULL,
	`scheduled_at` text,
	`schedule_reason` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`attempted_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`problem_id`) REFERENCES `problems`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `attempts_problem_idx` ON `attempts` (`problem_id`);--> statement-breakpoint
CREATE TABLE `problems` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`url` text DEFAULT '' NOT NULL,
	`platform` text DEFAULT 'other' NOT NULL,
	`origin` text DEFAULT 'practice' NOT NULL,
	`status` text DEFAULT 'review' NOT NULL,
	`review_stage` integer DEFAULT 0 NOT NULL,
	`next_review_at` text,
	`last_evidence` text DEFAULT 'failed' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `problems_next_review_idx` ON `problems` (`next_review_at`);--> statement-breakpoint
CREATE INDEX `problems_status_idx` ON `problems` (`status`);