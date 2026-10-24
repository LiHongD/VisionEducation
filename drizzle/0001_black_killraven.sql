CREATE TABLE `model_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`class_id` text NOT NULL,
	`member_id` text NOT NULL,
	`benchmark_id` text NOT NULL,
	`model_name` text NOT NULL,
	`model_key` text NOT NULL,
	`model_digest` text NOT NULL,
	`correct` integer NOT NULL,
	`total` integer NOT NULL,
	`accuracy` real NOT NULL,
	`metrics` text NOT NULL,
	`hyperparameters` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`class_id`) REFERENCES `classrooms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `models_member_digest` ON `model_entries` (`member_id`,`benchmark_id`,`model_digest`);--> statement-breakpoint
CREATE INDEX `models_class_benchmark` ON `model_entries` (`class_id`,`benchmark_id`);