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
 * Add cases here whenever you add a language.
 */

import { MockBrain } from '../src/lib/agent/mock.ts';
import { homewardMap } from '../src/lib/engine/map-homeward.ts';
import type { Locale } from '../src/lib/i18n/index.ts';
import { vocabulary } from '../src/lib/agent/vocabulary.ts';

const brain = new MockBrain(11);
let passed = 0;
let failed = 0;

async function expect(
	locale: Locale,
	node: string,
	memory: string[],
	want: string,
	why: string,
	pathSoFar: string[] = []
): Promise<void> {
	const map = homewardMap(locale);
	const here = map.nodes[node];
	const decision = await brain.decide({
		agentName: 'TEST',
		locale,
		nodeTitle: here.title,
		nodeDescription: here.description,
		choices: here.choices.map((c) => ({ id: c.id, label: c.label })),
		memory,
		pathSoFar
	});

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
	node: string,
	memory: string[],
	why: string,
	pathSoFar: string[] = []
): Promise<void> {
	const map = homewardMap(locale);
	const here = map.nodes[node];
	const decision = await brain.decide({
		agentName: 'TEST',
		locale,
		nodeTitle: here.title,
		nodeDescription: here.description,
		choices: here.choices.map((c) => ({ id: c.id, label: c.label })),
		memory,
		pathSoFar
	});

	const claimed = here.choices.some((c) =>
		decision.reasoning.includes(vocabulary(locale).phrases.directed(c.label.toLowerCase()))
	);
	if (claimed) failed++;
	else passed++;
	console.log(`  ${claimed ? 'FAIL' : 'ok  '}  ${locale}  ${why}`);
	console.log(`        "${decision.reasoning}"`);
}

// --- English -------------------------------------------------------------
await expect(
	'en',
	'start',
	['Volcano kills', 'River kills'],
	'forest',
	'warnings leave one way open'
);
await expect('en', 'start', ['Forest is safe'], 'forest', 'a positive note points somewhere');
await expect('en', 'forest', ['after forest go mountain'], 'mountain', 'directive fires in place', [
	'Forest'
]);
await expectNoDirective(
	'en',
	'forest',
	['after ferry go cave'],
	'a directive about elsewhere changes nothing here',
	['Forest']
);

// --- German --------------------------------------------------------------
await expect(
	'de',
	'start',
	['Vulkan tötet', 'Fluss tötet'],
	'forest',
	'warnings leave one way open'
);
await expect('de', 'start', ['Wald ist sicher'], 'forest', 'a positive note points somewhere');
await expect('de', 'mountain', ['Brücke tötet', 'Tunnel tötet'], 'valley', 'umlauts match');
await expect('de', 'forest', ['nach Wald geh Berg'], 'mountain', 'directive fires in place', [
	'Wald'
]);
await expect(
	'de',
	'valley',
	['nicht Grube', 'nicht Mühle'],
	'orchard',
	'"nicht" reads as a warning'
);
await expectNoDirective(
	'de',
	'forest',
	['nach Fähre geh Höhle'],
	'a directive about elsewhere changes nothing here',
	['Wald']
);

// --- Labels --------------------------------------------------------------
// Two labels at one level sharing a word would make one note fire twice.
for (const locale of ['en', 'de'] as Locale[]) {
	const map = homewardMap(locale);
	for (const node of Object.values(map.nodes)) {
		const words = node.choices.flatMap((c) =>
			c.label
				.toLowerCase()
				.split(/\s+/)
				.filter((w) => w.length >= 3)
		);
		const clash = words.find((w, i) => words.indexOf(w) !== i);
		if (clash) {
			failed++;
			console.log(`  FAIL  ${locale}  "${clash}" appears in two labels at ${node.id}`);
		}
	}
}

console.log(`\n  ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
