CREATE TABLE `rule_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`class_id` text NOT NULL,
	`member_id` text NOT NULL,
	`benchmark_id` text NOT NULL,
	`benchmark_digest` text NOT NULL,
	`rules` text NOT NULL,
	`mapping` text NOT NULL,
	`metrics` text NOT NULL,
	`correct` integer NOT NULL,
	`total` integer NOT NULL,
	`accuracy` real NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`class_id`) REFERENCES `classrooms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `rules_class_created` ON `rule_entries` (`class_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `rules_member_created` ON `rule_entries` (`member_id`,`created_at`);