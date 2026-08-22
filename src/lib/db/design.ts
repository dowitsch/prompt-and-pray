import { and, asc, eq, inArray, max, sql } from 'drizzle-orm';
import { distancesToHome } from './story.ts';
import type { Db } from './db.ts';
import * as t from './schema.ts';
import type { ChoiceResult, EndingType, NodeKind } from '../engine/types.ts';
import { isLocale, type Locale } from '../i18n/index.ts';

/**
 * Authoring: everything the designer does to a story.
 *
 * Every write goes through here rather than through the endpoints, so the rules
 * that are not the database's job — par is measured not typed, an ending has no
 * roads out of it, a published story that stops being valid drops back to draft —
 * hold whichever control the author reached for.
 */

const now = () => Date.now();

/* ------------------------------------------------------------------ reading */

export type DesignChoice = {
	id: number;
	fromNodeId: number;
	toNodeId: number;
	label: string;
	consequence: string;
	result: ChoiceResult;
	sortOrder: number;
};

export type DesignNode = {
	id: number;
	templateId: number | null;
	kind: NodeKind;
	title: string;
	body: string;
	endingType: EndingType | null;
	x: number;
	y: number;
	attributeIds: number[];
};

export type DesignStory = {
	id: number;
	slug: string;
	name: string;
	description: string;
	locale: Locale;
	status: 'draft' | 'published';
	builtIn: boolean;
	startNodeId: number | null;
	parSteps: number;
	nodes: DesignNode[];
	choices: DesignChoice[];
};

export class NotFound extends Error {}

export function loadDesignStory(db: Db, slug: string): DesignStory {
	const story = db.select().from(t.stories).where(eq(t.stories.slug, slug)).get();
	if (!story) throw new NotFound(`No story "${slug}".`);

	const nodeRows = db
		.select()
		.from(t.nodes)
		.where(eq(t.nodes.storyId, story.id))
		.orderBy(asc(t.nodes.id))
		.all();

	const tags = nodeRows.length
		? db
				.select()
				.from(t.nodeAttributes)
				.where(
					inArray(
						t.nodeAttributes.nodeId,
						nodeRows.map((n) => n.id)
					)
				)
				.all()
		: [];

	return {
		id: story.id,
		slug: story.slug,
		name: story.name,
		description: story.description,
		locale: isLocale(story.locale) ? story.locale : 'en',
		status: story.status as 'draft' | 'published',
		builtIn: story.builtIn,
		startNodeId: story.startNodeId,
		parSteps: story.parSteps,
		nodes: nodeRows.map((n) => ({
			id: n.id,
			templateId: n.templateId,
			kind: n.kind as NodeKind,
			title: n.title,
			body: n.body,
			endingType: n.endingType as EndingType | null,
			x: n.x,
			y: n.y,
			attributeIds: tags.filter((tag) => tag.nodeId === n.id).map((tag) => tag.attributeId)
		})),
		choices: db
			.select()
			.from(t.choices)
			.where(eq(t.choices.storyId, story.id))
			.orderBy(asc(t.choices.fromNodeId), asc(t.choices.sortOrder), asc(t.choices.id))
			.all()
			.map((c) => ({
				id: c.id,
				fromNodeId: c.fromNodeId,
				toNodeId: c.toNodeId,
				label: c.label,
				consequence: c.consequence,
				result: c.result as ChoiceResult,
				sortOrder: c.sortOrder
			}))
	};
}

/** The palette, in one story's language. */
export function loadPalette(db: Db, locale: Locale) {
	return {
		templates: db
			.select()
			.from(t.nodeTemplates)
			.where(eq(t.nodeTemplates.locale, locale))
			.orderBy(asc(t.nodeTemplates.kind), asc(t.nodeTemplates.name))
			.all(),
		attributes: db
			.select()
			.from(t.attributes)
			.where(eq(t.attributes.locale, locale))
			.orderBy(asc(t.attributes.name))
			.all()
	};
}

/* ------------------------------------------------------------------ stories */

function uniqueSlug(db: Db, wanted: string): string {
	const base =
		wanted
			.toLowerCase()
			.replace(/[^\p{L}\p{N}]+/gu, '-')
			.replace(/^-+|-+$/g, '')
			.slice(0, 48) || 'story';

	let slug = base;
	for (let n = 2; db.select().from(t.stories).where(eq(t.stories.slug, slug)).get(); n++) {
		slug = `${base}-${n}`;
	}
	return slug;
}

export function createStory(db: Db, name: string, locale: Locale): string {
	const slug = uniqueSlug(db, name);

	const story = db
		.insert(t.stories)
		.values({
			slug,
			name: name.trim() || 'A new tale',
			description: '',
			locale,
			status: 'draft',
			createdAt: now(),
			updatedAt: now()
		})
		.returning({ id: t.stories.id })
		.get();

	// A story with nowhere to stand is not something an author can begin with, so
	// it opens with the two places every story needs and one road between them.
	const start = db
		.insert(t.nodes)
		.values({
			storyId: story.id,
			kind: 'LOCATION',
			title: locale === 'de' ? 'Der Anfang' : 'The beginning',
			body: '',
			x: 0,
			y: 0,
			createdAt: now(),
			updatedAt: now()
		})
		.returning({ id: t.nodes.id })
		.get();

	db.update(t.stories).set({ startNodeId: start.id }).where(eq(t.stories.id, story.id)).run();
	return slug;
}

/** Copy a story whole — the way an author starts from a built-in one. */
export function duplicateStory(db: Db, slug: string): string {
	const source = loadDesignStory(db, slug);
	const copy = uniqueSlug(db, `${source.name} copy`);

	return db.transaction((tx) => {
		const story = tx
			.insert(t.stories)
			.values({
				slug: copy,
				name: `${source.name} (copy)`,
				description: source.description,
				locale: source.locale,
				status: 'draft',
				createdAt: now(),
				updatedAt: now()
			})
			.returning({ id: t.stories.id })
			.get();

		const idMap = new Map<number, number>();
		for (const node of source.nodes) {
			const row = tx
				.insert(t.nodes)
				.values({
					storyId: story.id,
					templateId: node.templateId,
					kind: node.kind,
					title: node.title,
					body: node.body,
					endingType: node.endingType,
					x: node.x,
					y: node.y,
					createdAt: now(),
					updatedAt: now()
				})
				.returning({ id: t.nodes.id })
				.get();
			idMap.set(node.id, row.id);

			for (const attributeId of node.attributeIds) {
				tx.insert(t.nodeAttributes)
					.values({ nodeId: row.id, attributeId })
					.onConflictDoNothing()
					.run();
			}
		}

		for (const choice of source.choices) {
			tx.insert(t.choices)
				.values({
					storyId: story.id,
					fromNodeId: idMap.get(choice.fromNodeId)!,
					toNodeId: idMap.get(choice.toNodeId)!,
					label: choice.label,
					consequence: choice.consequence,
					result: choice.result,
					sortOrder: choice.sortOrder,
					createdAt: now()
				})
				.run();
		}

		tx.update(t.stories)
			.set({
				startNodeId: source.startNodeId ? (idMap.get(source.startNodeId) ?? null) : null,
				parSteps: source.parSteps
			})
			.where(eq(t.stories.id, story.id))
			.run();

		return copy;
	});
}

export function deleteStory(db: Db, slug: string): void {
	const story = db.select().from(t.stories).where(eq(t.stories.slug, slug)).get();
	if (!story) throw new NotFound(`No story "${slug}".`);
	if (story.builtIn) throw new Error('The built-in stories cannot be deleted. Copy one instead.');
	db.delete(t.stories).where(eq(t.stories.id, story.id)).run();
}

export function setStatus(db: Db, slug: string, status: 'draft' | 'published'): void {
	db.update(t.stories).set({ status, updatedAt: now() }).where(eq(t.stories.slug, slug)).run();
}

export function renameStory(db: Db, slug: string, name: string, description: string): void {
	db.update(t.stories)
		.set({ name: name.trim() || 'A tale', description: description.trim(), updatedAt: now() })
		.where(eq(t.stories.slug, slug))
		.run();
}

/**
 * Recompute what is derived from the graph's shape.
 *
 * Par is measured, never typed, so it cannot go stale against the roads it
 * describes — and a story that has lost its way home stops being published
 * rather than being served to players broken.
 */
export function refreshDerived(db: Db, storyId: number): void {
	const nodes = db
		.select({ id: t.nodes.id, endingType: t.nodes.endingType })
		.from(t.nodes)
		.where(eq(t.nodes.storyId, storyId))
		.all();
	const edges = db
		.select({ from: t.choices.fromNodeId, to: t.choices.toNodeId })
		.from(t.choices)
		.where(eq(t.choices.storyId, storyId))
		.all();

	const distances = distancesToHome(
		nodes.map((n) => ({ id: String(n.id), endingType: n.endingType })),
		edges.map((e) => ({ from: String(e.from), to: String(e.to) }))
	);

	const story = db.select().from(t.stories).where(eq(t.stories.id, storyId)).get();
	if (!story) return;

	const par = story.startNodeId === null ? 0 : (distances[String(story.startNodeId)] ?? 0);

	db.update(t.stories)
		.set({
			parSteps: par,
			// Home has become unreachable: it cannot stay published while broken.
			status: par === 0 && story.status === 'published' ? 'draft' : story.status,
			updatedAt: now()
		})
		.where(eq(t.stories.id, storyId))
		.run();
}

/* -------------------------------------------------------------------- nodes */

export function addNode(
	db: Db,
	storyId: number,
	fields: { kind: NodeKind; title: string; templateId?: number | null; x: number; y: number }
): number {
	const row = db
		.insert(t.nodes)
		.values({
			storyId,
			templateId: fields.templateId ?? null,
			kind: fields.kind,
			title: fields.title,
			body: '',
			x: fields.x,
			y: fields.y,
			createdAt: now(),
			updatedAt: now()
		})
		.returning({ id: t.nodes.id })
		.get();

	// The first node in an empty story is where the agents set out from.
	const story = db.select().from(t.stories).where(eq(t.stories.id, storyId)).get();
	if (story && story.startNodeId === null) {
		db.update(t.stories).set({ startNodeId: row.id }).where(eq(t.stories.id, storyId)).run();
	}

	refreshDerived(db, storyId);
	return row.id;
}

export type NodePatch = {
	title?: string;
	body?: string;
	kind?: NodeKind;
	templateId?: number | null;
	endingType?: EndingType | null;
	x?: number;
	y?: number;
	attributeIds?: number[];
};

export function updateNode(db: Db, storyId: number, nodeId: number, patch: NodePatch): void {
	db.transaction((tx) => {
		const { attributeIds, ...columns } = patch;

		if (Object.keys(columns).length) {
			tx.update(t.nodes)
				.set({ ...columns, updatedAt: now() })
				.where(and(eq(t.nodes.id, nodeId), eq(t.nodes.storyId, storyId)))
				.run();
		}

		// An ending is where a run stops, so it can have no roads out of it. Doing
		// this here rather than refusing the edit means the author's intent is
		// carried out — marking a place an ending removes its exits.
		if (patch.endingType) {
			tx.delete(t.choices)
				.where(and(eq(t.choices.storyId, storyId), eq(t.choices.fromNodeId, nodeId)))
				.run();
		}

		if (attributeIds) {
			tx.delete(t.nodeAttributes).where(eq(t.nodeAttributes.nodeId, nodeId)).run();
			for (const attributeId of attributeIds) {
				tx.insert(t.nodeAttributes).values({ nodeId, attributeId }).onConflictDoNothing().run();
			}
		}
	});

	if (patch.endingType !== undefined) refreshDerived(db, storyId);
}

/** Moving is its own call: it happens on every drag and touches nothing else. */
export function moveNodes(
	db: Db,
	storyId: number,
	moves: { id: number; x: number; y: number }[]
): void {
	db.transaction((tx) => {
		for (const move of moves) {
			tx.update(t.nodes)
				.set({ x: move.x, y: move.y })
				.where(and(eq(t.nodes.id, move.id), eq(t.nodes.storyId, storyId)))
				.run();
		}
	});
}

export function deleteNode(db: Db, storyId: number, nodeId: number): void {
	const story = db.select().from(t.stories).where(eq(t.stories.id, storyId)).get();
	if (story?.startNodeId === nodeId) {
		throw new Error(
			'That is where the agents set out from. Make somewhere else the opening first.'
		);
	}
	// Roads into and out of it go with it: the composite foreign keys cascade.
	db.delete(t.nodes)
		.where(and(eq(t.nodes.id, nodeId), eq(t.nodes.storyId, storyId)))
		.run();
	refreshDerived(db, storyId);
}

export function setStartNode(db: Db, storyId: number, nodeId: number): void {
	db.update(t.stories)
		.set({ startNodeId: nodeId, updatedAt: now() })
		.where(eq(t.stories.id, storyId))
		.run();
	refreshDerived(db, storyId);
}

/* ------------------------------------------------------------------ choices */

export function addChoice(
	db: Db,
	storyId: number,
	fromNodeId: number,
	toNodeId: number,
	label: string
): number {
	if (fromNodeId === toNodeId) {
		throw new Error('A road cannot lead straight back to where it starts.');
	}

	const from = db
		.select({ endingType: t.nodes.endingType })
		.from(t.nodes)
		.where(and(eq(t.nodes.id, fromNodeId), eq(t.nodes.storyId, storyId)))
		.get();
	if (!from) throw new NotFound('That place is not in this story.');
	if (from.endingType) throw new Error('A run stops at an ending — no road leads out of it.');

	// A new road is named for where it goes. That is both the most useful thing
	// to call it and the only default that does not immediately break the
	// keyword-collision rule: "A way" and "A way 2" out of one place would share
	// the word "way", so every first road an author laid would raise an error.
	const to = db
		.select({ title: t.nodes.title })
		.from(t.nodes)
		.where(and(eq(t.nodes.id, toNodeId), eq(t.nodes.storyId, storyId)))
		.get();
	if (!to) throw new NotFound('That place is not in this story.');

	const next = db
		.select({ highest: max(t.choices.sortOrder) })
		.from(t.choices)
		.where(eq(t.choices.fromNodeId, fromNodeId))
		.get();

	// unique(from_node_id, label) is the real guard; this just picks a name the
	// author is unlikely to have used, so the first drag never fails.
	const taken = db
		.select({ label: t.choices.label })
		.from(t.choices)
		.where(eq(t.choices.fromNodeId, fromNodeId))
		.all()
		.map((c) => c.label);

	const wanted = label.trim() || to.title.trim() || 'A way';
	let name = wanted;
	for (let n = 2; taken.includes(name); n++) name = `${wanted} ${n}`;

	const row = db
		.insert(t.choices)
		.values({
			storyId,
			fromNodeId,
			toNodeId,
			label: name,
			consequence: '',
			result: 'ADVANCE',
			sortOrder: (next?.highest ?? -1) + 1,
			createdAt: now()
		})
		.returning({ id: t.choices.id })
		.get();

	refreshDerived(db, storyId);
	return row.id;
}

export type ChoicePatch = {
	label?: string;
	consequence?: string;
	result?: ChoiceResult;
	toNodeId?: number;
};

export function updateChoice(db: Db, storyId: number, choiceId: number, patch: ChoicePatch): void {
	db.update(t.choices)
		.set(patch)
		.where(and(eq(t.choices.id, choiceId), eq(t.choices.storyId, storyId)))
		.run();
	if (patch.toNodeId !== undefined) refreshDerived(db, storyId);
}

export function deleteChoice(db: Db, storyId: number, choiceId: number): void {
	db.delete(t.choices)
		.where(and(eq(t.choices.id, choiceId), eq(t.choices.storyId, storyId)))
		.run();
	refreshDerived(db, storyId);
}

/* -------------------------------------------------------------- arrangement */

const Y_STEP = 150;
const X_STEP = 200;

/**
 * Lay the story out in layers by distance from the opening.
 *
 * A convenience, not a requirement — positions are the author's, and this only
 * runs when they ask for it. Places at the same distance from the start are
 * spread across a row, which is the arrangement a story of choices reads best
 * in, and the one the built-in stories already use.
 */
export function autoArrange(db: Db, slug: string): void {
	const story = loadDesignStory(db, slug);
	if (story.startNodeId === null) return;

	const out = new Map<number, number[]>();
	for (const choice of story.choices) {
		out.set(choice.fromNodeId, [...(out.get(choice.fromNodeId) ?? []), choice.toNodeId]);
	}

	const depth = new Map<number, number>([[story.startNodeId, 0]]);
	let frontier = [story.startNodeId];
	while (frontier.length) {
		const next: number[] = [];
		for (const id of frontier) {
			for (const to of out.get(id) ?? []) {
				if (depth.has(to)) continue;
				depth.set(to, depth.get(id)! + 1);
				next.push(to);
			}
		}
		frontier = next;
	}

	// Anything the opening cannot reach goes in a row of its own underneath, so it
	// is visible rather than stacked on the origin.
	const deepest = Math.max(0, ...depth.values());
	for (const node of story.nodes) if (!depth.has(node.id)) depth.set(node.id, deepest + 2);

	const rows = new Map<number, number[]>();
	for (const node of story.nodes) {
		const level = depth.get(node.id)!;
		rows.set(level, [...(rows.get(level) ?? []), node.id]);
	}

	const moves: { id: number; x: number; y: number }[] = [];
	for (const [level, ids] of rows) {
		// Endings last within a row: the fatal ways fan out to the edges, the road
		// that carries on sits in the middle.
		const ordered = [...ids].sort((a, b) => {
			const endingOf = (id: number) => (story.nodes.find((n) => n.id === id)?.endingType ? 1 : 0);
			return endingOf(a) - endingOf(b) || a - b;
		});
		ordered.forEach((id, index) => {
			// 0, +1, -1, +2, -2 … so the through-road stays on the centre line.
			const offset = index === 0 ? 0 : Math.ceil(index / 2) * (index % 2 === 1 ? -1 : 1);
			moves.push({ id, x: offset * X_STEP, y: level * Y_STEP });
		});
	}

	moveNodes(db, story.id, moves);
}

/** Whether any match is currently playing this story. */
export function storyInPlay(db: Db, storyId: number): number {
	const row = db
		.select({ count: sql<number>`count(*)` })
		.from(t.matches)
		.where(eq(t.matches.storyId, storyId))
		.get();
	return row?.count ?? 0;
}
