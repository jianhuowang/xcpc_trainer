ALTER TABLE `attempts` ADD `help_level` text DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE `attempts` ADD `idempotency_key` text;--> statement-breakpoint
CREATE UNIQUE INDEX `attempts_idempotency_key_unique` ON `attempts` (`idempotency_key`);