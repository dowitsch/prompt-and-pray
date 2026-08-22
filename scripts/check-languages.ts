/**
 * Language check.
 *
 *   npm run check:languages
 *
 * The one part of translation that can break the *game* rather than the text:
 * the offline brain decides by matching a player's handwritten notes against
 * the names of the paths in front of it. If a language's vocabulary, word
 * boundaries or directive pattern are wrong, agents quietly stop learning and
 * nothing else looks broken.
 *
 * The stories come from the database, so this now also checks that what was
 * seeded is playable — a node whose ways cannot be told apart by keyword is a
 * node where notes stop working.
 *
 * Add cases here whenever you add a language.
 */

import { MockBrain } from '../src/lib/agent/mock.ts';
import { vocabulary } from '../src/lib/agent/vocabulary.ts';
import { openDb } from '../src/lib/db/db.ts';
import { listStories, loadStory } from '../src/lib/db/story.ts';
import type { StoryGraph, StoryNode } from '../src/lib/engine/types.ts';
import { validateStory } from '../src/lib/engine/validate.ts';
import type { Locale } from '../src/lib/i18n/index.ts';
import { en } from '../src/lib/i18n/en.ts';
import { de } from '../src/lib/i18n/de.ts';

const brain = new MockBrain(11);
let passed = 0;
let failed = 0;

const { db, close } = openDb(process.env.DATABASE_PATH ?? './data/homeward.db');

const stories: Record<Locale, StoryGraph> = {
	en: loadStory(db, 'homeward-en'),
	de: loadStory(db, 'homeward-de')
};

/**
 * Find a place by the ways that lead out of it.
 *
 * Node ids are database rows and differ between the two seeded stories, so the
 * test cannot name one directly. Naming a place by what it offers — "the place
 * where River, Forest and Volcano are on offer" — is stable, and states the
 * thing the test actually depends on.
 */
function placeOffering(locale: Locale, slugs: string[]): StoryNode {
	const node = Object.values(stories[locale].nodes).find((n) =>
		slugs.every((slug) => n.choices.some((c) => c.slug === slug))
	);
	if (!node) throw new Error(`No ${locale} place offers ${slugs.join(', ')}.`);
	return node;
}

function ask(locale: Locale, here: StoryNode, memory: string[], pathSoFar: string[]) {
	return brain.decide({
		agentName: 'TEST',
		// The offline brain is deliberately character-blind; any index will do.
		character: 0,
		locale,
		nodeTitle: here.title,
		nodeDescription: here.description,
		choices: here.choices.map((c) => ({ id: c.slug, label: c.label })),
		memory,
		pathSoFar
	});
}

async function expect(
	locale: Locale,
	offers: string[],
	memory: string[],
	want: string,
	why: string,
	pathSoFar: string[] = []
): Promise<void> {
	const decision = await ask(locale, placeOffering(locale, offers), memory, pathSoFar);

	const ok = decision.choice === want;
	if (ok) passed++;
	else failed++;
	console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${locale}  ${why}`);
	if (!ok) console.log(`        chose ${decision.choice}, wanted ${want}`);
	console.log(`        "${decision.reasoning}"`);
}

/**
 * A directive anchored somewhere else must not fire here.
 *
 * This asserts the *matching*, not the decision: the tie-break is seeded by the
 * memory contents on purpose, so adding any note reshuffles a blind guess. That
 * is wanted — otherwise writing a useless note would replay an identical round.
 */
async function expectNoDirective(
	locale: Locale,
	offers: string[],
	memory: string[],
	why: string,
	pathSoFar: string[] = []
): Promise<void> {
	const here = placeOffering(locale, offers);
	const decision = await ask(locale, here, memory, pathSoFar);

	const claimed = here.choices.some((c) =>
		decision.reasoning.includes(vocabulary(locale).phrases.directed(c.label.toLowerCase()))
	);
	if (claimed) failed++;
	else passed++;
	console.log(`  ${claimed ? 'FAIL' : 'ok  '}  ${locale}  ${why}`);
	console.log(`        "${decision.reasoning}"`);
}

// --- English -------------------------------------------------------------
const EN_START = ['river', 'forest', 'volcano'];
const EN_FOREST = ['mountain', 'black-water', 'cave'];

await expect(
	'en',
	EN_START,
	['Volcano kills', 'River kills'],
	'forest',
	'warnings leave one way open'
);
await expect('en', EN_START, ['Forest is safe'], 'forest', 'a positive note points somewhere');
await expect(
	'en',
	EN_FOREST,
	['after forest go mountain'],
	'mountain',
	'directive fires in place',
	['Forest']
);
await expectNoDirective(
	'en',
	EN_FOREST,
	['after ferry go cave'],
	'a directive about elsewhere changes nothing here',
	['Forest']
);

// --- German --------------------------------------------------------------
const DE_START = ['fluss', 'wald', 'vulkan'];
const DE_FOREST = ['berg', 'wasser', 'höhle'];
const DE_MOUNTAIN = ['tal', 'brücke', 'tunnel'];
const DE_VALLEY = ['obstgarten', 'grube', 'mühle'];

await expect(
	'de',
	DE_START,
	['Vulkan tötet', 'Fluss tötet'],
	'wald',
	'warnings leave one way open'
);
await expect('de', DE_START, ['Wald ist sicher'], 'wald', 'a positive note points somewhere');
await expect('de', DE_MOUNTAIN, ['Brücke tötet', 'Tunnel tötet'], 'tal', 'umlauts match');
await expect('de', DE_FOREST, ['nach Wald geh Berg'], 'berg', 'directive fires in place', ['Wald']);
await expect(
	'de',
	DE_VALLEY,
	['nicht Grube', 'nicht Mühle'],
	'obstgarten',
	'"nicht" reads as a warning'
);
await expectNoDirective(
	'de',
	DE_FOREST,
	['nach Fähre geh Höhle'],
	'a directive about elsewhere changes nothing here',
	['Wald']
);

// --- Every seeded story --------------------------------------------------
// The publish validator owns the keyword-collision rule — two roads out of one
// place sharing a word would make a single note fire for both — so running it
// here means the rule has exactly one definition. Every *published* story is
// checked, not a named pair, so a tale added to the seed later cannot slip
// through with a collision in it.
for (const summary of listStories(db, true)) {
	const { errors, warnings } = validateStory(loadStory(db, summary.slug), summary.locale);
	if (errors.length) {
		failed++;
		console.log(`  FAIL  ${summary.locale}  "${summary.slug}" is not publishable`);
		for (const problem of errors) console.log(`        ${problem.code}: ${problem.message}`);
	} else {
		passed++;
		console.log(`  ok    ${summary.locale}  "${summary.slug}" passes the publish validator`);
	}
	for (const problem of warnings) {
		console.log(`        note (${problem.code}): ${problem.message}`);
	}
}

/*
 * Every {placeholder} in one dictionary exists in the other.
 *
 * The `Strings` type already makes a *missing key* a compile error, but it
 * cannot see inside the strings — so dropping the braces off `{name}` in one
 * language type-checks perfectly and then renders the word "name" to a player.
 * That is the whole class of bug this catches, and it is invisible until
 * somebody reads the wrong language.
 */
{
	const holes = (value: unknown): string =>
		[...String(value).matchAll(/\{(\w+)\}/g)]
			.map((m) => m[1])
			.sort()
			.join(',');

	const compare = (a: unknown, b: unknown, path: string): void => {
		if (Array.isArray(a)) {
			const same = Array.isArray(b) && a.length === b.length;
			if (!same) {
				failed++;
				console.log(`  FAIL  ${path} has a different number of entries in de`);
				return;
			}
			a.forEach((entry, i) => compare(entry, (b as unknown[])[i], `${path}[${i}]`));
			return;
		}
		if (a && typeof a === 'object') {
			for (const key of Object.keys(a as Record<string, unknown>)) {
				compare(
					(a as Record<string, unknown>)[key],
					(b as Record<string, unknown> | undefined)?.[key],
					path ? `${path}.${key}` : key
				);
			}
			return;
		}
		if (holes(a) !== holes(b)) {
			failed++;
			console.log(`  FAIL  ${path} placeholders differ — en [${holes(a)}] vs de [${holes(b)}]`);
		}
	};

	const before = failed;
	compare(en, de, '');
	if (failed === before) {
		passed++;
		console.log('  ok    en/de  every placeholder survives translation');
	}
}

close();
console.log(`\n  ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
