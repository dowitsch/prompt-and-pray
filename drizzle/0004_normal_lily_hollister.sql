-- What a place says about the land around it: a biome, a glyph, and the stretch
-- of story it belongs to.
--
-- Hand-corrected after generation, the same way 0001 was. drizzle-kit rebuilds
-- the table for the new CHECK constraints and emitted `"biome", "sigil",
-- "region"` in the SELECT half as well, i.e. read them from the table that does
-- not have them yet. All three are NULL below, which is exactly what every
-- existing place meant before the columns existed: whatever the noise says, a
-- plain disc, and no region.
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_nodes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`story_id` integer NOT NULL,
	`template_id` integer,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`ending_type` text,
	`x` real DEFAULT 0 NOT NULL,
	`y` real DEFAULT 0 NOT NULL,
	`biome` text,
	`sigil` text,
	`region` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`story_id`) REFERENCES `stories`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`template_id`) REFERENCES `node_templates`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "nodes_kind" CHECK("__new_nodes"."kind" in ('LOCATION', 'CREATURE', 'OBJECT', 'EVENT')),
	CONSTRAINT "nodes_ending_type" CHECK("__new_nodes"."ending_type" is null or "__new_nodes"."ending_type" in ('SUCCESS', 'FAILURE', 'NEUTRAL')),
	CONSTRAINT "nodes_biome" CHECK("__new_nodes"."biome" is null or "__new_nodes"."biome" in ('wiese', 'wald', 'wueste', 'seenland', 'schnee', 'berge')),
	CONSTRAINT "nodes_sigil" CHECK("__new_nodes"."sigil" is null or length("__new_nodes"."sigil") <= 8)
);
--> statement-breakpoint
INSERT INTO `__new_nodes`("id", "story_id", "template_id", "kind", "title", "body", "ending_type", "x", "y", "biome", "sigil", "region", "created_at", "updated_at") SELECT "id", "story_id", "template_id", "kind", "title", "body", "ending_type", "x", "y", NULL, NULL, NULL, "created_at", "updated_at" FROM `nodes`;--> statement-breakpoint
DROP TABLE `nodes`;--> statement-breakpoint
ALTER TABLE `__new_nodes` RENAME TO `nodes`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `nodes_story_idx` ON `nodes` (`story_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `nodes_story_id_unique` ON `nodes` (`story_id`,`id`);