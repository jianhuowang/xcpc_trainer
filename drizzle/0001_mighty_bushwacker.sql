CREATE TABLE `training_settings` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`mode` text DEFAULT 'normal' NOT NULL,
	`timezone` text DEFAULT 'Asia/Shanghai' NOT NULL,
	`reminder_time` text DEFAULT '20:30' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
