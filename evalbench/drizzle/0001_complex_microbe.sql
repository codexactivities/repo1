CREATE TABLE `eval_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`version` integer NOT NULL,
	`content` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `eval_assets_family_version` ON `eval_assets` (`family_id`,`version`);--> statement-breakpoint
CREATE TABLE `eval_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`secret` text
);
--> statement-breakpoint
ALTER TABLE `eval_runs` ADD `control` text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE `eval_runs` ADD `stop_reason` text;--> statement-breakpoint
ALTER TABLE `eval_runs` ADD `concurrency` integer DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE `eval_runs` ADD `budget_usd` real;--> statement-breakpoint
ALTER TABLE `eval_runs` ADD `max_requests` integer DEFAULT 10000 NOT NULL;--> statement-breakpoint
ALTER TABLE `eval_tasks` ADD `kind` text DEFAULT 'generation' NOT NULL;--> statement-breakpoint
ALTER TABLE `eval_tasks` ADD `repeat_no` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `eval_tasks` ADD `attempt` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `eval_tasks` ADD `reserve_cost` real;--> statement-breakpoint
ALTER TABLE `eval_tasks` ADD `charged_cost` real;--> statement-breakpoint
ALTER TABLE `eval_tasks` ADD `prior_cost` real DEFAULT 0 NOT NULL;