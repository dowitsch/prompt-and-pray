import { asc, eq } from 'drizzle-orm';
import type { StoryChoice, StoryGraph, StoryNode } from '../engine/types.ts';
import { isLocale, type Locale } from '../i18n/index.ts';
import type { Db } from './db.ts';
import * as t from './schema.ts';

/**
 * Loading a story out of the database and into the shape the engine plays.
 *
 * This module is the **only** place integer primary keys become engine ids. From
 * here on everything — the engine, the wire protocol, the client — deals in
 * strings, so there is nowhere for a `"4" !== 4` to hide. Going the other way,
 * `Number(id)` recovers the row id, because that is where every id came from.
 *
 * The browser must never import this file: it reads the answers.
 */

/**
 * A word-shaped handle for a choice, derived from its label.
 *
 * The brain needs something better than a row number to pick with — the prompt
 * shows this to the model, and the offline brain treats it as a keyword. Letters
 * are kept as they are, umlauts included, because a German story's labels are
 * German and stripping them would leave handles the model would not write back.
 */
function slugify(label: string): string {
	return (
		label
			.toLowerCase()
			.replace(/['’]/g, '')
			// Anything that is not a letter or digit becomes a separator. \p{L}
			// keeps ä, ö, ü and ß intact.
			.replace(/[^\p{L}\p{N}]+/gu, '-')
			.replace(/^-+|-+$/g, '') || 'way'
	);
}

/**
 * Steps from every node to the nearest SUCCESS ending, by breadth-first search
 * over reversed edges. A node absent from the result cannot reach home at all.
 *
 * One function now answers both questions the game used to hardcode: par for the
 * course is this measured at the start node, and an agent's progress is this
 * measured where it stands.
 */
export function distancesToHome(
	nodes: { id: string; endingType: string | null }[],
	edges: { from: string; to: string }[]
): Record<string, number> {
	const incoming = new Map<string, string[]>();
	for (const edge of edges) {
		const list = incoming.get(edge.to);
		if (list) list.push(edge.from);
		else incoming.set(edge.to, [edge.from]);
	}

	const distance: Record<string, number> = {};
	let frontier: string[] = [];
	for (const node of nodes) {
		if (node.endingType === 'SUCCESS') {
			distance[node.id] = 0;
			frontier.push(node.id);
		}
	}

	let step = 0;
	while (frontier.length) {
		step += 1;
		const next: string[] = [];
		for (const id of frontier) {
			for (const from of incoming.get(id) ?? []) {
				if (distance[from] !== undefined) continue;
				distance[from] = step;
				next.push(from);
			}
		}
		frontier = next;
	}

	return distance;
}

/**
 * How many steps one run gets before the daylight goes.
 *
 * Three times par gives an agent room to take a wrong turn, double back and
 * still get home, while guaranteeing a cycle terminates. The floor of 20 keeps
 * very short stories from ending a run before it has had a chance to go wrong.
 */
export function stepBudgetFor(parSteps: number): number {
	return Math.max(20, parSteps * 3);
}

export type StorySummary = {
	id: number;
	slug: string;
	name: string;
	description: string;
	locale: Locale;
	status: 'draft' | 'published';
	builtIn: boolean;
	parSteps: number;
	nodeCount: number;
};

export function listStories(db: Db, onlyPublished = false): StorySummary[] {
	const rows = db.select().from(t.stories).orderBy(asc(t.stories.name)).all();
	const counts = new Map<number, number>();
	for (const node of db.select({ storyId: t.nodes.storyId }).from(t.nodes).all()) {
		counts.set(node.storyId, (counts.get(node.storyId) ?? 0) + 1);
	}

	return rows
		.filter((row) => !onlyPublished || row.status === 'published')
		.map((row) => ({
			id: row.id,
			slug: row.slug,
			name: row.name,
			description: row.description,
			locale: isLocale(row.locale) ? row.locale : 'en',
			status: row.status as 'draft' | 'published',
			builtIn: row.builtIn,
			parSteps: row.parSteps,
			nodeCount: counts.get(row.id) ?? 0
		}));
}

export class StoryNotFound extends Error {}

/**
 * Load one story as a playable graph.
 *
 * Everything derived — the choice handles, the distances home, par, the step
 * budget — is computed here rather than trusted from the row, so a story edited
 * by hand in the designer cannot go stale against its own cached numbers.
 */
export function loadStory(db: Db, slug: string): StoryGraph {
	const story = db.select().from(t.stories).where(eq(t.stories.slug, slug)).get();
	if (!story) throw new StoryNotFound(`No story "${slug}".`);
	if (story.startNodeId === null) throw new StoryNotFound(`Story "${slug}" has no start node.`);

	const nodeRows = db
		.select()
		.from(t.nodes)
		.where(eq(t.nodes.storyId, story.id))
		.orderBy(asc(t.nodes.id))
		.all();

	const choiceRows = db
		.select()
		.from(t.choices)
		.where(eq(t.choices.storyId, story.id))
		.orderBy(asc(t.choices.fromNodeId), asc(t.choices.sortOrder), asc(t.choices.id))
		.all();

	const nodes: Record<string, StoryNode> = {};
	for (const row of nodeRows) {
		nodes[String(row.id)] = {
			id: String(row.id),
			kind: row.kind as StoryNode['kind'],
			title: row.title,
			description: row.body,
			endingType: row.endingType as StoryNode['endingType'],
			x: row.x,
			y: row.y,
			choices: []
		};
	}

	// Handles are unique per node, which the unique(from_node_id, label) index
	// very nearly guarantees already — two labels only collide here if they
	// differ solely in punctuation.
	const usedSlugs = new Map<string, Set<string>>();
	const edges: { from: string; to: string }[] = [];

	for (const row of choiceRows) {
		const from = nodes[String(row.fromNodeId)];
		const to = nodes[String(row.toNodeId)];
		// The composite foreign keys make a dangling or cross-story edge
		// impossible, so this is a belt-and-braces guard, not a real branch.
		if (!from || !to) continue;

		const taken = usedSlugs.get(from.id) ?? new Set<string>();
		let slug = slugify(row.label);
		for (let n = 2; taken.has(slug); n++) slug = `${slugify(row.label)}-${n}`;
		taken.add(slug);
		usedSlugs.set(from.id, taken);

		const choice: StoryChoice = {
			id: String(row.id),
			label: row.label,
			slug,
			nextNode: to.id,
			result: row.result as StoryChoice['result'],
			consequence: row.consequence
		};
		from.choices.push(choice);
		edges.push({ from: from.id, to: to.id });
	}

	const distanceHome = distancesToHome(Object.values(nodes), edges);
	const startNode = String(story.startNodeId);
	const parSteps = distanceHome[startNode] ?? 0;

	return {
		id: story.slug,
		name: story.name,
		tagline: story.description,
		startNode,
		homeNodes: Object.values(nodes)
			.filter((n) => n.endingType === 'SUCCESS')
			.map((n) => n.id),
		parSteps,
		stepBudget: stepBudgetFor(parSteps),
		distanceHome,
		nodes
	};
}
