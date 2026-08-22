import { relations, sql } from 'drizzle-orm';
import {
	check,
	foreignKey,
	index,
	integer,
	primaryKey,
	real,
	sqliteTable,
	text,
	unique
} from 'drizzle-orm/sqlite-core';

/**
 * HOMEWARD — database schema.
 *
 * Two halves that barely touch:
 *
 *   **Authoring** — stories, nodes, choices. A story is a directed graph: several
 *   routes may reach the end, routes may rejoin, and a wrong turn is not always
 *   fatal. Authored once, read many times.
 *
 *   **Runtime** — matches, players, memory, runs, decisions. Written constantly
 *   while a match is live. This half is why the database exists at all: match
 *   state used to live in a `Map` inside the Vite plugin and died with every
 *   dev-server restart.
 *
 * Design notes worth knowing before changing anything here are in
 * `docs/story-schema.md`. The three that bite hardest:
 *
 *   1. A node's `endingType` decides whether a run is over. Edges carry flavour
 *      only. One source of truth, so the two can never contradict.
 *   2. `choices` carries a redundant `storyId` on purpose: it lets the composite
 *      foreign keys below make a cross-story edge *structurally* impossible.
 *   3. A story is written in one language. Translating means copying the story.
 */

/* ─────────────────────────────────────────────────────────────── authoring */

export const NODE_KINDS = ['LOCATION', 'CREATURE', 'OBJECT', 'EVENT'] as const;
export const ENDING_TYPES = ['SUCCESS', 'FAILURE', 'NEUTRAL'] as const;
/**
 * What a choice does to the walker's journey. Deliberately *not* including a
 * fatal option: whether the run ends is decided by the node it leads to.
 */
export const CHOICE_RESULTS = ['ADVANCE', 'DETOUR', 'SETBACK'] as const;
export const STORY_STATUS = ['draft', 'published'] as const;

const list = (values: readonly string[]) => values.map((v) => `'${v}'`).join(', ');

/** Reusable building blocks for the designer's palette: Forest, Ork, Sword. */
export const nodeTemplates = sqliteTable(
	'node_templates',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		locale: text('locale').notNull(),
		kind: text('kind').notNull(),
		name: text('name').notNull()
	},
	(t) => [
		unique('node_templates_unique').on(t.locale, t.kind, t.name),
		check('node_templates_kind', sql`${t.kind} in (${sql.raw(list(NODE_KINDS))})`)
	]
);

export const stories = sqliteTable(
	'stories',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		slug: text('slug').notNull().unique(),
		name: text('name').notNull(),
		description: text('description').notNull().default(''),
		/** A story is authored in one language. */
		locale: text('locale').notNull(),
		/**
		 * Nullable by necessity, not by choice: nodes reference their story and the
		 * story references its start node, so one of the two has to be set second.
		 * SQLite has no deferrable constraints. The publish validator requires it.
		 */
		startNodeId: integer('start_node_id'),
		/**
		 * Shortest route from the start to a SUCCESS ending, computed on publish.
		 * Replaces the old fixed "depth": with several routes of different lengths
		 * there is no single total, so this is the par a player is measured against.
		 */
		parSteps: integer('par_steps').notNull().default(0),
		status: text('status').notNull().default('draft'),
		builtIn: integer('built_in', { mode: 'boolean' }).notNull().default(false),
		createdAt: integer('created_at').notNull(),
		updatedAt: integer('updated_at').notNull()
	},
	(t) => [check('stories_status', sql`${t.status} in (${sql.raw(list(STORY_STATUS))})`)]
);

export const nodes = sqliteTable(
	'nodes',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		storyId: integer('story_id')
			.notNull()
			.references(() => stories.id, { onDelete: 'cascade' }),
		/** Optional: a node may be a one-off rather than an instance of a template. */
		templateId: integer('template_id').references(() => nodeTemplates.id, {
			onDelete: 'set null'
		}),
		/**
		 * Copied from the template rather than joined for. Keeps a node
		 * self-describing, lets attribute filtering work without a join, and allows
		 * template-less nodes to still have a kind.
		 */
		kind: text('kind').notNull(),
		title: text('title').notNull(),
		body: text('body').notNull().default(''),
		/**
		 * NULL means "not an ending". There is deliberately no `is_ending` boolean
		 * beside it — two columns for one fact can disagree.
		 */
		endingType: text('ending_type'),
		/** Canvas position, authored by dragging. The game renders these directly. */
		x: real('x').notNull().default(0),
		y: real('y').notNull().default(0),
		createdAt: integer('created_at').notNull(),
		updatedAt: integer('updated_at').notNull()
	},
	(t) => [
		// Lets `choices` point at (story_id, node_id) as a pair — see below.
		unique('nodes_story_id_unique').on(t.storyId, t.id),
		index('nodes_story_idx').on(t.storyId),
		check('nodes_kind', sql`${t.kind} in (${sql.raw(list(NODE_KINDS))})`),
		check(
			'nodes_ending_type',
			sql`${t.endingType} is null or ${t.endingType} in (${sql.raw(list(ENDING_TYPES))})`
		)
	]
);

/**
 * A directed edge. Several choices may lead to the same node, so the structure
 * is a graph rather than a tree.
 */
export const choices = sqliteTable(
	'choices',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		/** Redundant with the nodes' own story, and that is the point — see the FKs. */
		storyId: integer('story_id')
			.notNull()
			.references(() => stories.id, { onDelete: 'cascade' }),
		fromNodeId: integer('from_node_id').notNull(),
		toNodeId: integer('to_node_id').notNull(),
		/** What the player reads and the agent picks by name. */
		label: text('label').notNull(),
		/** Optional line shown after the choice is taken. */
		consequence: text('consequence').notNull().default(''),
		sortOrder: integer('sort_order').notNull().default(0),
		result: text('result').notNull().default('ADVANCE'),
		createdAt: integer('created_at').notNull()
	},
	(t) => [
		// A choice cannot reach into another story: the pair (story, node) must
		// exist, and both ends carry the same story id. No trigger needed.
		foreignKey({
			columns: [t.storyId, t.fromNodeId],
			foreignColumns: [nodes.storyId, nodes.id],
			name: 'choices_from_fk'
		}).onDelete('cascade'),
		foreignKey({
			columns: [t.storyId, t.toNodeId],
			foreignColumns: [nodes.storyId, nodes.id],
			name: 'choices_to_fk'
		}).onDelete('cascade'),
		// The agent picks by label, so two identical labels at one node would be
		// ambiguous to both the model and the offline brain.
		unique('choices_label_unique').on(t.fromNodeId, t.label),
		index('choices_from_idx').on(t.fromNodeId),
		// A node pointing at itself is an authoring slip. Longer cycles
		// (A → B → A) are allowed on purpose — walking in circles is a story.
		check('choices_no_self_loop', sql`${t.fromNodeId} <> ${t.toNodeId}`),
		check('choices_result', sql`${t.result} in (${sql.raw(list(CHOICE_RESULTS))})`)
	]
);

/**
 * Tags for the designer: "dark", "large", "cursed". They vary the palette and
 * help tell two Forest nodes apart while authoring.
 *
 * The game engine does not read them. Titles are hand-written, so nothing
 * downstream depends on an attribute — they are metadata, and this file should
 * say so rather than implying they are load-bearing.
 */
export const attributes = sqliteTable(
	'attributes',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		locale: text('locale').notNull(),
		name: text('name').notNull(),
		/**
		 * JSON array of node kinds this attribute makes sense for, e.g.
		 * `["LOCATION","CREATURE"]`. A join table for this would be three tables
		 * where one column does, against a fixed four-value enum.
		 */
		appliesTo: text('applies_to', { mode: 'json' }).notNull().$type<(typeof NODE_KINDS)[number][]>()
	},
	(t) => [unique('attributes_unique').on(t.locale, t.name)]
);

export const nodeAttributes = sqliteTable(
	'node_attributes',
	{
		nodeId: integer('node_id')
			.notNull()
			.references(() => nodes.id, { onDelete: 'cascade' }),
		attributeId: integer('attribute_id')
			.notNull()
			.references(() => attributes.id, { onDelete: 'cascade' })
	},
	(t) => [primaryKey({ columns: [t.nodeId, t.attributeId] })]
);

/* ─────────────────────────────────────────────────────────────── runtime */

export const MATCH_PHASES = ['lobby', 'teaching', 'running', 'over'] as const;
export const AGENT_STATUS = ['idle', 'running', 'dead', 'home'] as const;
/**
 * How a run stopped. `survived` is derivable from this ('home' and nothing
 * else) and kept only because so much of the UI reads it directly.
 *
 * 'wandered' is not a death: the run spent its step budget, and the last road it
 * took was survivable. See `RunEnding` in `src/lib/engine/types.ts`.
 */
export const RUN_ENDINGS = ['home', 'died', 'ended', 'wandered'] as const;
/** What taking a choice turned out to cost. See `ChoiceOutcome`. */
export const CHOICE_OUTCOMES = ['continue', 'death', 'win', 'end'] as const;

export const matches = sqliteTable(
	'matches',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		code: text('code').notNull().unique(),
		storyId: integer('story_id')
			.notNull()
			.references(() => stories.id),
		locale: text('locale').notNull(),
		phase: text('phase').notNull().default('lobby'),
		round: integer('round').notNull().default(0),
		/** Epoch ms when the teaching phase closes; 0 outside teaching. */
		teachingEndsAt: integer('teaching_ends_at').notNull().default(0),
		hostPlayerId: text('host_player_id'),
		paceScale: real('pace_scale').notNull().default(1),
		winnerIds: text('winner_ids', { mode: 'json' }).notNull().$type<string[]>(),
		/** The last round's story, kept so a reconnect can still show it. */
		lastSummary: text('last_summary', { mode: 'json' }),
		/**
		 * Node each player ended at last round, keyed by player id. Drives the
		 * "again" in "died at the Volcano. Again." — which is only visible by
		 * comparing two rounds, so it cannot be derived from this one.
		 */
		previousDeaths: text('previous_deaths', { mode: 'json' })
			.notNull()
			.$type<Record<string, string>>()
			.default({}),
		startedAt: integer('started_at').notNull().default(0),
		createdAt: integer('created_at').notNull(),
		updatedAt: integer('updated_at').notNull()
	},
	(t) => [check('matches_phase', sql`${t.phase} in (${sql.raw(list(MATCH_PHASES))})`)]
);

export const matchPlayers = sqliteTable(
	'match_players',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		matchId: integer('match_id')
			.notNull()
			.references(() => matches.id, { onDelete: 'cascade' }),
		/** The public id the client knows itself by (`p_ab12cd34`, `bot_…`). */
		playerId: text('player_id').notNull(),
		seat: integer('seat').notNull(),
		name: text('name').notNull(),
		/**
		 * Chosen portrait and identity colour, as palette indices.
		 *
		 * The bounds are written as literals rather than imported from the engine
		 * because this file deliberately re-declares its enums (see MATCH_PHASES)
		 * rather than depending on it. They are `PALETTE_SIZE` and
		 * `CHARACTER_COUNT` in `src/lib/engine/types.ts`; keep them in step.
		 *
		 * There is intentionally no `unique(matchId, colour)` index. The engine is
		 * the authority and `Game.restore` repairs duplicates on the way in — a
		 * constraint here could make `saveMatch` throw forever over one legacy
		 * row, and a database rule that can take a live match's persistence down is
		 * worse than the invariant it protects.
		 */
		character: integer('character').notNull().default(0),
		colour: integer('colour').notNull().default(0),
		isBot: integer('is_bot', { mode: 'boolean' }).notNull().default(false),
		botSkill: text('bot_skill'),
		botSabotages: integer('bot_sabotages', { mode: 'boolean' }).notNull().default(false),
		connected: integer('connected', { mode: 'boolean' }).notNull().default(true),
		ready: integer('ready', { mode: 'boolean' }).notNull().default(false),
		sabotageUsed: integer('sabotage_used', { mode: 'boolean' }).notNull().default(false),
		wasSabotaged: integer('was_sabotaged', { mode: 'boolean' }).notNull().default(false),
		sabotagedThisRound: integer('sabotaged_this_round', { mode: 'boolean' })
			.notNull()
			.default(false),
		currentNodeId: integer('current_node_id').references(() => nodes.id),
		status: text('status').notNull().default('idle'),
		depth: integer('depth').notNull().default(0),
		bestDepth: integer('best_depth').notNull().default(0),
		pendingGrants: integer('pending_grants').notNull().default(0),
		runCount: integer('run_count').notNull().default(0)
	},
	(t) => [
		unique('match_players_seat').on(t.matchId, t.seat),
		unique('match_players_player').on(t.matchId, t.playerId),
		check('match_players_status', sql`${t.status} in (${sql.raw(list(AGENT_STATUS))})`),
		check('match_players_character', sql`${t.character} between 0 and 4`),
		check('match_players_colour', sql`${t.colour} between 0 and 4`)
	]
);

/**
 * The twenty-character grants, in the order they were written.
 *
 * The length limit is enforced here as well as in `Game.addMemory` and on the
 * input. Three places for one rule is deliberate — it is the rule the whole
 * game rests on, and the database is the only one of the three that cannot be
 * bypassed.
 */
export const memoryLines = sqliteTable(
	'memory_lines',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		matchPlayerId: integer('match_player_id')
			.notNull()
			.references(() => matchPlayers.id, { onDelete: 'cascade' }),
		position: integer('position').notNull(),
		/** The engine's own handle for the line, so a restore is indistinguishable. */
		lineId: text('line_id').notNull(),
		text: text('text').notNull(),
		writtenOnRound: integer('written_on_round').notNull(),
		/** Name of the rival who overwrote this line, if any. */
		sabotagedBy: text('sabotaged_by')
	},
	(t) => [
		unique('memory_lines_position').on(t.matchPlayerId, t.position),
		check('memory_lines_length', sql`length(${t.text}) <= 20`)
	]
);

export const runs = sqliteTable(
	'runs',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		matchPlayerId: integer('match_player_id')
			.notNull()
			.references(() => matchPlayers.id, { onDelete: 'cascade' }),
		round: integer('round').notNull(),
		endedAtNodeId: integer('ended_at_node_id').references(() => nodes.id),
		// The default exists so this column could be added to a table that already
		// had rows; every write sets it explicitly.
		ending: text('ending').notNull().default('died'),
		survived: integer('survived', { mode: 'boolean' }).notNull().default(false),
		depthReached: integer('depth_reached').notNull().default(0)
	},
	(t) => [
		unique('runs_round').on(t.matchPlayerId, t.round),
		check('runs_ending', sql`${t.ending} in (${sql.raw(list(RUN_ENDINGS))})`),
		// The two must agree. Kept as a constraint rather than a convention
		// because every recap in the UI reads one or the other.
		check('runs_survived_agrees', sql`(${t.ending} = 'home') = ${t.survived}`)
	]
);

export const decisions = sqliteTable(
	'decisions',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		runId: integer('run_id')
			.notNull()
			.references(() => runs.id, { onDelete: 'cascade' }),
		step: integer('step').notNull(),
		fromNodeId: integer('from_node_id')
			.notNull()
			.references(() => nodes.id),
		choiceId: integer('choice_id')
			.notNull()
			.references(() => choices.id),
		/** What the agent said it was thinking. Display only. */
		reasoning: text('reasoning').notNull(),
		/**
		 * Recorded rather than recomputed from the graph: this is history, and
		 * editing a story afterwards must not rewrite what already happened.
		 */
		outcome: text('outcome').notNull(),
		improvised: integer('improvised', { mode: 'boolean' }).notNull().default(false),
		atMs: integer('at_ms').notNull().default(0)
	},
	(t) => [
		unique('decisions_step').on(t.runId, t.step),
		check('decisions_outcome', sql`${t.outcome} in (${sql.raw(list(CHOICE_OUTCOMES))})`)
	]
);

/** Fog of war is per match, not per player: discovery is public. */
export const matchVisited = sqliteTable(
	'match_visited',
	{
		matchId: integer('match_id')
			.notNull()
			.references(() => matches.id, { onDelete: 'cascade' }),
		nodeId: integer('node_id')
			.notNull()
			.references(() => nodes.id, { onDelete: 'cascade' })
	},
	(t) => [primaryKey({ columns: [t.matchId, t.nodeId] })]
);

export const matchReveals = sqliteTable(
	'match_reveals',
	{
		matchId: integer('match_id')
			.notNull()
			.references(() => matches.id, { onDelete: 'cascade' }),
		choiceId: integer('choice_id')
			.notNull()
			.references(() => choices.id, { onDelete: 'cascade' }),
		/** What taking it turned out to cost, in full: the fog is drawn from this. */
		outcome: text('outcome').notNull()
	},
	(t) => [
		primaryKey({ columns: [t.matchId, t.choiceId] }),
		check('match_reveals_outcome', sql`${t.outcome} in (${sql.raw(list(CHOICE_OUTCOMES))})`)
	]
);

/* ─────────────────────────────────────────────────────────── relations */

export const storyRelations = relations(stories, ({ many }) => ({
	nodes: many(nodes),
	choices: many(choices)
}));

export const nodeRelations = relations(nodes, ({ one, many }) => ({
	story: one(stories, { fields: [nodes.storyId], references: [stories.id] }),
	template: one(nodeTemplates, { fields: [nodes.templateId], references: [nodeTemplates.id] }),
	attributes: many(nodeAttributes)
}));

export const choiceRelations = relations(choices, ({ one }) => ({
	story: one(stories, { fields: [choices.storyId], references: [stories.id] })
}));

export const matchRelations = relations(matches, ({ one, many }) => ({
	story: one(stories, { fields: [matches.storyId], references: [stories.id] }),
	players: many(matchPlayers)
}));

export const matchPlayerRelations = relations(matchPlayers, ({ one, many }) => ({
	match: one(matches, { fields: [matchPlayers.matchId], references: [matches.id] }),
	memory: many(memoryLines),
	runs: many(runs)
}));

export const runRelations = relations(runs, ({ one, many }) => ({
	player: one(matchPlayers, {
		fields: [runs.matchPlayerId],
		references: [matchPlayers.id]
	}),
	decisions: many(decisions)
}));
