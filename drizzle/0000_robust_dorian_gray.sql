CREATE TABLE `attributes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`locale` text NOT NULL,
	`name` text NOT NULL,
	`applies_to` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `attributes_unique` ON `attributes` (`locale`,`name`);--> statement-breakpoint
CREATE TABLE `choices` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`story_id` integer NOT NULL,
	`from_node_id` integer NOT NULL,
	`to_node_id` integer NOT NULL,
	`label` text NOT NULL,
	`consequence` text DEFAULT '' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`result` text DEFAULT 'ADVANCE' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`story_id`) REFERENCES `stories`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`story_id`,`from_node_id`) REFERENCES `nodes`(`story_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`story_id`,`to_node_id`) REFERENCES `nodes`(`story_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "choices_no_self_loop" CHECK("choices"."from_node_id" <> "choices"."to_node_id"),
	CONSTRAINT "choices_result" CHECK("choices"."result" in ('ADVANCE', 'DETOUR', 'SETBACK'))
);
--> statement-breakpoint
CREATE INDEX `choices_from_idx` ON `choices` (`from_node_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `choices_label_unique` ON `choices` (`from_node_id`,`label`);--> statement-breakpoint
CREATE TABLE `decisions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` integer NOT NULL,
	`step` integer NOT NULL,
	`from_node_id` integer NOT NULL,
	`choice_id` integer NOT NULL,
	`reasoning` text NOT NULL,
	`outcome` text NOT NULL,
	`improvised` integer DEFAULT false NOT NULL,
	`at_ms` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`from_node_id`) REFERENCES `nodes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`choice_id`) REFERENCES `choices`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "decisions_outcome" CHECK("decisions"."outcome" in ('continue', 'death', 'win', 'end'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `decisions_step` ON `decisions` (`run_id`,`step`);--> statement-breakpoint
CREATE TABLE `match_players` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`match_id` integer NOT NULL,
	`player_id` text NOT NULL,
	`seat` integer NOT NULL,
	`name` text NOT NULL,
	`is_bot` integer DEFAULT false NOT NULL,
	`bot_skill` text,
	`bot_sabotages` integer DEFAULT false NOT NULL,
	`connected` integer DEFAULT true NOT NULL,
	`ready` integer DEFAULT false NOT NULL,
	`sabotage_used` integer DEFAULT false NOT NULL,
	`was_sabotaged` integer DEFAULT false NOT NULL,
	`sabotaged_this_round` integer DEFAULT false NOT NULL,
	`current_node_id` integer,
	`status` text DEFAULT 'idle' NOT NULL,
	`depth` integer DEFAULT 0 NOT NULL,
	`best_depth` integer DEFAULT 0 NOT NULL,
	`pending_grants` integer DEFAULT 0 NOT NULL,
	`run_count` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`current_node_id`) REFERENCES `nodes`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "match_players_status" CHECK("match_players"."status" in ('idle', 'running', 'dead', 'home'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `match_players_seat` ON `match_players` (`match_id`,`seat`);--> statement-breakpoint
CREATE UNIQUE INDEX `match_players_player` ON `match_players` (`match_id`,`player_id`);--> statement-breakpoint
CREATE TABLE `match_reveals` (
	`match_id` integer NOT NULL,
	`choice_id` integer NOT NULL,
	`outcome` text NOT NULL,
	PRIMARY KEY(`match_id`, `choice_id`),
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`choice_id`) REFERENCES `choices`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "match_reveals_outcome" CHECK("match_reveals"."outcome" in ('continue', 'death', 'win', 'end'))
);
--> statement-breakpoint
CREATE TABLE `match_visited` (
	`match_id` integer NOT NULL,
	`node_id` integer NOT NULL,
	PRIMARY KEY(`match_id`, `node_id`),
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`node_id`) REFERENCES `nodes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `matches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`story_id` integer NOT NULL,
	`locale` text NOT NULL,
	`phase` text DEFAULT 'lobby' NOT NULL,
	`round` integer DEFAULT 0 NOT NULL,
	`teaching_ends_at` integer DEFAULT 0 NOT NULL,
	`host_player_id` text,
	`pace_scale` real DEFAULT 1 NOT NULL,
	`winner_ids` text NOT NULL,
	`last_summary` text,
	`previous_deaths` text DEFAULT '{}' NOT NULL,
	`started_at` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`story_id`) REFERENCES `stories`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "matches_phase" CHECK("matches"."phase" in ('lobby', 'teaching', 'running', 'over'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `matches_code_unique` ON `matches` (`code`);--> statement-breakpoint
CREATE TABLE `memory_lines` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`match_player_id` integer NOT NULL,
	`position` integer NOT NULL,
	`line_id` text NOT NULL,
	`text` text NOT NULL,
	`written_on_round` integer NOT NULL,
	`sabotaged_by` text,
	FOREIGN KEY (`match_player_id`) REFERENCES `match_players`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "memory_lines_length" CHECK(length("memory_lines"."text") <= 20)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `memory_lines_position` ON `memory_lines` (`match_player_id`,`position`);--> statement-breakpoint
CREATE TABLE `node_attributes` (
	`node_id` integer NOT NULL,
	`attribute_id` integer NOT NULL,
	PRIMARY KEY(`node_id`, `attribute_id`),
	FOREIGN KEY (`node_id`) REFERENCES `nodes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`attribute_id`) REFERENCES `attributes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `node_templates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`locale` text NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	CONSTRAINT "node_templates_kind" CHECK("node_templates"."kind" in ('LOCATION', 'CREATURE', 'OBJECT', 'EVENT'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `node_templates_unique` ON `node_templates` (`locale`,`kind`,`name`);--> statement-breakpoint
CREATE TABLE `nodes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`story_id` integer NOT NULL,
	`template_id` integer,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`ending_type` text,
	`x` real DEFAULT 0 NOT NULL,
	`y` real DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`story_id`) REFERENCES `stories`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`template_id`) REFERENCES `node_templates`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "nodes_kind" CHECK("nodes"."kind" in ('LOCATION', 'CREATURE', 'OBJECT', 'EVENT')),
	CONSTRAINT "nodes_ending_type" CHECK("nodes"."ending_type" is null or "nodes"."ending_type" in ('SUCCESS', 'FAILURE', 'NEUTRAL'))
);
--> statement-breakpoint
CREATE INDEX `nodes_story_idx` ON `nodes` (`story_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `nodes_story_id_unique` ON `nodes` (`story_id`,`id`);--> statement-breakpoint
CREATE TABLE `runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`match_player_id` integer NOT NULL,
	`round` integer NOT NULL,
	`ended_at_node_id` integer,
	`ending` text DEFAULT 'died' NOT NULL,
	`survived` integer DEFAULT false NOT NULL,
	`depth_reached` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`match_player_id`) REFERENCES `match_players`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ended_at_node_id`) REFERENCES `nodes`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "runs_ending" CHECK("runs"."ending" in ('home', 'died', 'ended', 'wandered')),
	CONSTRAINT "runs_survived_agrees" CHECK(("runs"."ending" = 'home') = "runs"."survived")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `runs_round` ON `runs` (`match_player_id`,`round`);--> statement-breakpoint
CREATE TABLE `stories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`locale` text NOT NULL,
	`start_node_id` integer,
	`par_steps` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`built_in` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "stories_status" CHECK("stories"."status" in ('draft', 'published'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stories_slug_unique` ON `stories` (`slug`);