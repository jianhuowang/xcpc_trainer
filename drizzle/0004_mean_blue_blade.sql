ALTER TABLE `problems` ADD `training_role` text DEFAULT 'core' NOT NULL;--> statement-breakpoint
ALTER TABLE `problems` ADD `validates_problem_id` integer;--> statement-breakpoint
ALTER TABLE `problems` ADD `transfer_integrity` text DEFAULT 'not_applicable' NOT NULL;--> statement-breakpoint
CREATE INDEX `problems_validates_idx` ON `problems` (`validates_problem_id`);