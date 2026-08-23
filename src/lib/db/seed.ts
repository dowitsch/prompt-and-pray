import { eq } from 'drizzle-orm';
import { distancesToHome } from './story.ts';
import { storyInPlay } from './design.ts';
import { LOCALES, type Locale } from '../i18n/index.ts';
import type { Db } from './db.ts';
import { ABKUERZUNG } from './abkuerzung-story.ts';
import { DAS_PAKET } from './das-paket-story.ts';
import { HOMEWARD, type StorySeed } from './homeward-story.ts';
import { MITTERNACHT } from './mitternacht-story.ts';
import { ATTRIBUTES, TEMPLATES } from './palette.ts';
import * as t from './schema.ts';

/**
 * Seed the palettes and the two built-in HOMEWARD stories.
 *
 * Idempotent: re-running replaces the built-in stories and leaves anything an
 * author created alone. The story content lives in `homeward-story.ts`, which
 * was generated from the prototype's hand-written map so that what gets seeded
 * is provably the story the game already shipped.
 */

const now = () => Date.now();

function seedPalette(db: Db): void {
	for (const locale of LOCALES) {
		for (const template of TEMPLATES) {
			db.insert(t.nodeTemplates)
				.values({ locale, kind: template.kind, name: template[locale] })
				.onConflictDoNothing()
				.run();
		}
		for (const attribute of ATTRIBUTES) {
			db.insert(t.attributes)
				.values({ locale, name: attribute[locale], appliesTo: attribute.appliesTo })
				.onConflictDoNothing()
				.run();
		}
	}
}

/**
 * The palette is stored in each story's own language, but the seed data names
 * templates and attributes in English. Bridge the two through the palette
 * definitions, which hold both.
 */
function englishNameIndex(
	rows: { id: number; name: string }[],
	specs: { en: string; de: string }[],
	locale: Locale
): Map<string, number> {
	const index = new Map<string, number>();
	for (const spec of specs) {
		const row = rows.find((r) => r.name === spec[locale]);
		if (row) index.set(spec.en, row.id);
	}
	return index;
}

function seedStory(db: Db, locale: Locale, seed: StorySeed): void {
	const existing = db
		.select({ id: t.stories.id })
		.from(t.stories)
		.where(eq(t.stories.slug, seed.slug))
		.get();

	// A story that a match is being played on must never be swapped out from
	// under it. The match's saved state holds this story's node and choice ids —
	// where each agent stands, which roads the fog has uncovered — so replacing
	// the rows would either break the foreign keys or, worse, silently repoint a
	// match at different places. Seeding waits until nobody is playing it.
	if (existing && storyInPlay(db, existing.id) > 0) {
		console.log(`[homeward] "${seed.slug}" is being played — leaving it as it is.`);
		return;
	}

	// Replace any previous copy. Its nodes and choices cascade away with it.
	db.delete(t.stories).where(eq(t.stories.slug, seed.slug)).run();

	const story = db
		.insert(t.stories)
		.values({
			slug: seed.slug,
			name: seed.name,
			description: seed.description,
			locale,
			builtIn: true,
			status: 'published',
			// Stated rather than left to the column default: the built-in tales ship
			// with hurrying off, so every step of every round is decided out loud,
			// and a re-seed puts them back that way.
			rememberPath: false,
			createdAt: now(),
			updatedAt: now()
		})
		.returning({ id: t.stories.id })
		.get();

	const templateId = englishNameIndex(
		db
			.select({ id: t.nodeTemplates.id, name: t.nodeTemplates.name })
			.from(t.nodeTemplates)
			.where(eq(t.nodeTemplates.locale, locale))
			.all(),
		TEMPLATES,
		locale
	);

	const attributeId = englishNameIndex(
		db
			.select({ id: t.attributes.id, name: t.attributes.name })
			.from(t.attributes)
			.where(eq(t.attributes.locale, locale))
			.all(),
		ATTRIBUTES,
		locale
	);

	// Nodes first, so every choice has both ends to point at.
	const idByKey = new Map<string, number>();
	for (const node of seed.nodes) {
		const row = db
			.insert(t.nodes)
			.values({
				storyId: story.id,
				templateId: node.template ? (templateId.get(node.template) ?? null) : null,
				kind: node.kind,
				title: node.title,
				body: node.body,
				endingType: node.endingType,
				x: node.x,
				y: node.y,
				biome: node.biome ?? null,
				sigil: node.sigil ?? null,
				region: node.region ?? null,
				createdAt: now(),
				updatedAt: now()
			})
			.returning({ id: t.nodes.id })
			.get();

		idByKey.set(node.key, row.id);

		for (const tag of node.attributes) {
			const id = attributeId.get(tag);
			if (id) {
				db.insert(t.nodeAttributes)
					.values({ nodeId: row.id, attributeId: id })
					.onConflictDoNothing()
					.run();
			}
		}
	}

	const edges: { from: string; to: string }[] = [];
	for (const node of seed.nodes) {
		for (const [index, choice] of node.choices.entries()) {
			const from = idByKey.get(node.key);
			const to = idByKey.get(choice.to);
			if (from === undefined || to === undefined) {
				throw new Error(`${seed.slug}: "${node.key}" leads to unknown node "${choice.to}".`);
			}

			db.insert(t.choices)
				.values({
					storyId: story.id,
					fromNodeId: from,
					toNodeId: to,
					label: choice.label,
					consequence: choice.consequence,
					sortOrder: index,
					result: choice.result,
					createdAt: now()
				})
				.run();
			edges.push({ from: String(from), to: String(to) });
		}
	}

	// Par is measured, never authored: the same reverse breadth-first search the
	// engine uses to score progress, taken at the start node.
	const startNodeId = idByKey.get(seed.startKey);
	if (startNodeId === undefined) throw new Error(`${seed.slug}: no start node "${seed.startKey}".`);

	const distances = distancesToHome(
		seed.nodes.map((n) => ({ id: String(idByKey.get(n.key)), endingType: n.endingType })),
		edges
	);

	db.update(t.stories)
		.set({
			startNodeId,
			parSteps: distances[String(startNodeId)] ?? 0,
			updatedAt: now()
		})
		.where(eq(t.stories.id, story.id))
		.run();
}

/**
 * The tales that ship with the game, in the language each is written in.
 *
 * Seeding runs on every boot — `prepareDatabase()` — so a deploy carries any
 * change to these into the running database without a separate step, and a
 * fresh volume comes up with them already there.
 */
const BUILT_IN: { locale: Locale; story: StorySeed }[] = [
	...LOCALES.map((locale) => ({ locale, story: HOMEWARD[locale] })),
	...LOCALES.map((locale) => ({ locale, story: ABKUERZUNG[locale] })),
	{ locale: 'de', story: MITTERNACHT },
	{ locale: 'de', story: DAS_PAKET }
];

export function seed(db: Db): void {
	seedPalette(db);
	for (const { locale, story } of BUILT_IN) seedStory(db, locale, story);
}
