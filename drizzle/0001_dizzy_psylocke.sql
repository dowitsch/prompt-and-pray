-- Identity: a chosen portrait and a chosen colour per player.
--
-- Hand-corrected after generation. drizzle-kit rebuilds the table for the new
-- CHECK constraints, but emitted `"character", "colour"` in the SELECT half as
-- well, i.e. read them from the table that does not have them yet. They are
-- literal defaults below; Game.restore then reassigns duplicates, so every
-- existing match comes back with distinct colours rather than four of colour 0.
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_match_players` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`match_id` integer NOT NULL,
	`player_id` text NOT NULL,
	`seat` integer NOT NULL,
	`name` text NOT NULL,
	`character` integer DEFAULT 0 NOT NULL,
	`colour` integer DEFAULT 0 NOT NULL,
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
	CONSTRAINT "match_players_status" CHECK("__new_match_players"."status" in ('idle', 'running', 'dead', 'home')),
	CONSTRAINT "match_players_character" CHECK("__new_match_players"."character" between 0 and 4),
	CONSTRAINT "match_players_colour" CHECK("__new_match_players"."colour" between 0 and 4)
);
--> statement-breakpoint
INSERT INTO `__new_match_players`("id", "match_id", "player_id", "seat", "name", "character", "colour", "is_bot", "bot_skill", "bot_sabotages", "connected", "ready", "sabotage_used", "was_sabotaged", "sabotaged_this_round", "current_node_id", "status", "depth", "best_depth", "pending_grants", "run_count") SELECT "id", "match_id", "player_id", "seat", "name", 0, 0, "is_bot", "bot_skill", "bot_sabotages", "connected", "ready", "sabotage_used", "was_sabotaged", "sabotaged_this_round", "current_node_id", "status", "depth", "best_depth", "pending_grants", "run_count" FROM `match_players`;--> statement-breakpoint
DROP TABLE `match_players`;--> statement-breakpoint
ALTER TABLE `__new_match_players` RENAME TO `match_players`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `match_players_seat` ON `match_players` (`match_id`,`seat`);--> statement-breakpoint
CREATE UNIQUE INDEX `match_players_player` ON `match_players` (`match_id`,`player_id`);