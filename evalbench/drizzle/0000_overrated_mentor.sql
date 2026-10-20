CREATE TABLE `eval_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`snapshot` text NOT NULL,
	`reviews` text DEFAULT '{}' NOT NULL,
	`provider` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`archived` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `eval_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	`case_id` text NOT NULL,
	`side` text NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`result` text,
	FOREIGN KEY (`run_id`) REFERENCES `eval_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `eval_tasks_run_state` ON `eval_tasks` (`run_id`,`state`);