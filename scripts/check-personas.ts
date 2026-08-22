/**
 * Persona check.
 *
 *   npm run check:personas          both languages
 *   npm run check:personas -- de    one of them
 *
 * The four characters are not costume: a doctrine in the system prompt and a
 * point in the sampling space are supposed to make Krotz, Aurelia, PENGU-01 and
 * Malakor answer the *same* crossroads differently. Nothing else in the repo
 * exercises the LLM path at all — `check:languages` only ever asks the offline
 * brain — so without this the personas are unfalsifiable prose.
 *
 * It needs a real provider and is skipped, loudly and successfully, when
 * `AI_PROVIDER=mock`. It calls the model roughly `4 x cases x SAMPLES` times.
 *
 * Two kinds of result, kept apart on purpose:
 *
 *   - **Hard checks.** Things that must hold or the feature is broken: every
 *     response parses, nothing falls back to the offline brain, an unambiguous
 *     note is obeyed by all four, and Aurelia repeats herself exactly.
 *   - **Tendencies.** Printed as counts, never failed on. "PENGU bites on
 *     shortcuts more than Malakor" is true of a temperament, not of a sample of
 *     five, and a check that fails on a coin flip gets ignored within a week.
 */

import { ApertusBrain } from '../src/lib/agent/apertus.ts';
import { readSettings, MockBrain } from '../src/lib/agent/index.ts';
import type { AgentDecision, DecisionContext } from '../src/lib/agent/brain.ts';
import { CHARACTERS, characterAt } from '../src/lib/engine/characters.ts';
import { personaFor } from '../src/lib/agent/personas.ts';
import { LOCALES, type Locale } from '../src/lib/i18n/index.ts';

/** How many times each character is asked each question. */
const SAMPLES = Number(process.env.PERSONA_SAMPLES ?? 3);

const settings = readSettings(process.env);
if (settings.provider === 'mock') {
	console.log('\n  skipped: no provider configured (AI_PROVIDER=mock).');
	console.log('  Set AI_PROVIDER/AI_BASE_URL/AI_API_KEY/AI_MODEL in .env to run this.\n');
	process.exit(0);
}
if (!settings.personas) {
	console.log('\n  skipped: AI_PERSONAS is off, so there are no personas to check.\n');
	process.exit(0);
}

// Deliberately NOT the ResilientBrain: a fallback to the offline brain is the
// thing being tested for, so it must surface as an error rather than be papered
// over with a decision that looks fine.
const brain = new ApertusBrain({
	baseUrl: settings.baseUrl,
	apiKey: process.env.AI_API_KEY!.trim(),
	model: settings.model,
	jsonMode: /^(1|true|yes|on)$/i.test(process.env.AI_JSON_MODE ?? 'true'),
	maxTokens: Number(process.env.AI_MAX_TOKENS ?? 160),
	temperature: Number(process.env.AI_TEMPERATURE ?? 0.8),
	personas: true,
	timeoutMs: Number(process.env.AI_TIMEOUT_MS ?? 8000)
});

let passed = 0;
let failed = 0;

function check(ok: boolean, what: string, detail = ''): void {
	if (ok) passed++;
	else failed++;
	console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${what}`);
	if (!ok && detail) console.log(`        ${detail}`);
}

/**
 * A crossroads, in both languages.
 *
 * Hand-built rather than loaded from a story: the point is to hold everything
 * fixed except the character, and a seeded story would drag its own place names
 * into the comparison.
 */
type Case = {
	name: string;
	/** What a well-behaved agent should pick, when there is such a thing. */
	want?: string;
	memory: Record<Locale, string[]>;
	pathSoFar: Record<Locale, string[]>;
};

const PLACE: Record<Locale, { title: string; description: string }> = {
	en: { title: 'The Ridge', description: 'Above the treeline at last. The wind is loud.' },
	de: { title: 'Der Grat', description: 'Endlich über der Baumgrenze. Der Wind ist laut.' }
};

const CHOICES: Record<Locale, { id: string; label: string }[]> = {
	en: [
		{ id: 'bridge', label: 'Bridge' },
		{ id: 'valley', label: 'Valley' },
		{ id: 'tunnel', label: 'Tunnel' }
	],
	de: [
		{ id: 'bridge', label: 'Brücke' },
		{ id: 'valley', label: 'Tal' },
		{ id: 'tunnel', label: 'Tunnel' }
	]
};

const CASES: Case[] = [
	{
		name: 'an unambiguous note is obeyed',
		want: 'valley',
		memory: {
			en: ['Bridge kills.', 'Tunnel kills.'],
			de: ['Brücke tötet.', 'Tunnel tötet.']
		},
		pathSoFar: { en: [], de: [] }
	},
	{
		name: 'a directive anchored elsewhere must not fire here',
		memory: {
			en: ['after millpond take bridge'],
			de: ['nach Mühlteich nimm Brücke']
		},
		pathSoFar: { en: ['Forest'], de: ['Wald'] }
	},
	{
		name: 'a note that only sounds like a shortcut',
		memory: {
			en: ['Tunnel is the fast way'],
			de: ['Tunnel ist der schnelle Weg']
		},
		pathSoFar: { en: ['Forest'], de: ['Wald'] }
	},
	{
		name: 'nothing written at all',
		memory: { en: [], de: [] },
		pathSoFar: { en: [], de: [] }
	}
];

function contextFor(character: number, locale: Locale, kase: Case): DecisionContext {
	return {
		agentName: characterAt(character).name,
		character,
		locale,
		nodeTitle: PLACE[locale].title,
		nodeDescription: PLACE[locale].description,
		choices: CHOICES[locale],
		memory: kase.memory[locale],
		pathSoFar: kase.pathSoFar[locale]
	};
}

async function ask(character: number, locale: Locale, kase: Case): Promise<AgentDecision | null> {
	try {
		return await brain.decide(contextFor(character, locale, kase));
	} catch (error) {
		console.log(`        ${error instanceof Error ? error.message : String(error)}`);
		return null;
	}
}

const locales = (process.argv.slice(2).filter((a) => (LOCALES as readonly string[]).includes(a)) ??
	[]) as Locale[];
const RUN: readonly Locale[] = locales.length ? locales : LOCALES;

console.log(`\n  ${settings.model}, ${SAMPLES} sample(s) per character per case\n`);

for (const locale of RUN) {
	console.log(`— ${locale} ${'—'.repeat(62)}`);

	for (const kase of CASES) {
		console.log(`\n  ${kase.name}`);
		const chosen: Record<string, string[]> = {};

		for (const [index, character] of CHARACTERS.entries()) {
			const picks: string[] = [];
			for (let i = 0; i < SAMPLES; i++) {
				const decision = await ask(index, locale, kase);
				if (!decision) {
					check(false, `${character.name} answered`, 'the provider call failed');
					continue;
				}
				picks.push(decision.choice);
				// One line per character per case is what makes the voices comparable
				// at a glance; the rest is counting.
				if (i === 0) console.log(`    ${character.name.padEnd(9)} "${decision.reasoning}"`);
			}
			chosen[character.id] = picks;
		}

		// Hard: everybody answered, with a real path id.
		const ids = new Set(CHOICES[locale].map((c) => c.id));
		for (const character of CHARACTERS) {
			const picks = chosen[character.id] ?? [];
			check(
				picks.length === SAMPLES && picks.every((p) => ids.has(p)),
				`${locale}  ${character.name} answered ${SAMPLES}x with a real path`,
				`got ${JSON.stringify(picks)}`
			);
		}

		// Hard: a note nobody could misread is followed by all four. A persona may
		// colour a guess; it may not stop an agent reading its operator's notes.
		if (kase.want) {
			for (const character of CHARACTERS) {
				const picks = chosen[character.id] ?? [];
				check(
					picks.every((p) => p === kase.want),
					`${locale}  ${character.name} obeys an unambiguous note`,
					`wanted ${kase.want}, got ${JSON.stringify(picks)}`
				);
			}
		}

		// Soft: the tendencies. Counted and printed, never failed on.
		const tally = CHARACTERS.map((c) => {
			const picks = chosen[c.id] ?? [];
			const top = [...ids]
				.map((id) => [id, picks.filter((p) => p === id).length] as const)
				.sort((a, b) => b[1] - a[1]);
			return `${c.name}:${top.map(([id, n]) => `${id}=${n}`).join(' ')}`;
		});
		console.log(`    · ${tally.join('   ')}`);
	}

	// Hard: Aurelia's seed. The same figure, place and notes must come back with
	// the same road — that is what "mathematical perfection" was made to mean.
	const aurelia = CHARACTERS.findIndex((c) => c.id === 'aurelia');
	const repeats: string[] = [];
	for (let i = 0; i < 3; i++) {
		const decision = await ask(aurelia, locale, CASES[2]);
		if (decision) repeats.push(decision.choice);
	}
	check(
		repeats.length === 3 && new Set(repeats).size === 1,
		`${locale}  AURELIA is reproducible`,
		`got ${JSON.stringify(repeats)} — the provider may be ignoring "seed"`
	);
	console.log('');
}

// A sanity line rather than a check: it costs nothing and catches a persona
// table that has drifted away from the roster.
for (const [index, character] of CHARACTERS.entries()) {
	check(personaFor(index).id === character.id, `persona ${character.name} matches its character`);
}
void MockBrain;

console.log(`\n  ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
