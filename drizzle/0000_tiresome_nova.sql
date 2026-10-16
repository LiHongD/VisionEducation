CREATE TABLE `classrooms` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`join_code` text NOT NULL,
	`is_open` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `classrooms_code_unique` ON `classrooms` (`join_code`);--> statement-breakpoint
CREATE INDEX `classrooms_owner` ON `classrooms` (`owner_id`);--> statement-breakpoint
CREATE TABLE `members` (
	`id` text PRIMARY KEY NOT NULL,
	`class_id` text NOT NULL,
	`display_name` text NOT NULL,
	`student_number` text DEFAULT '' NOT NULL,
	`token_hash` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`class_id`) REFERENCES `classrooms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `members_token_unique` ON `members` (`token_hash`);--> statement-breakpoint
CREATE INDEX `members_class` ON `members` (`class_id`);--> statement-breakpoint
CREATE TABLE `submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`class_id` text NOT NULL,
	`member_id` text NOT NULL,
	`lesson` integer NOT NULL,
	`answer` text NOT NULL,
	`evidence` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`reviewed_revision` integer DEFAULT 0 NOT NULL,
	`feedback` text DEFAULT '' NOT NULL,
	`featured` integer DEFAULT 0 NOT NULL,
	`submitted_at` text NOT NULL,
	FOREIGN KEY (`class_id`) REFERENCES `classrooms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `submissions_member_lesson` ON `submissions` (`member_id`,`lesson`);--> statement-breakpoint
CREATE INDEX `submissions_class_lesson` ON `submissions` (`class_id`,`lesson`);