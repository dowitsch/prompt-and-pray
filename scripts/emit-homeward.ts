/**
 * One-off generator, kept for the record.
 *
 *   node --experimental-strip-types scripts/emit-homeward.ts
 *
 * Freezes the hand-written HOMEWARD map and its computed tree layout into a
 * plain data module, `src/lib/db/homeward-story.ts`. That is what let
 * `map-homeward.ts` and `tree.ts` be deleted without anyone having to take on
 * trust that the seeded story is the same story the prototype shipped: the
 * content and the positions came out of those two files, mechanically.
 *
 * Re-running it needs those two files back from git history. It is here as
 * provenance, not as part of the build.
 */

import { writeFileSync } from 'node:fs';
import { homewardMap } from '../src/lib/engine/map-homeward.ts';
import { layoutTree } from '../src/lib/engine/tree.ts';
import { LOCALES } from '../src/lib/i18n/index.ts';

/** Which palette template each map node is an instance of. */
const TEMPLATE_FOR_NODE: Record<string, string> = {
	start: 'Crossroads',
	forest: 'Forest',
	mountain: 'Mountain',
	valley: 'Valley',
	orchard: 'Orchard',
	ferry: 'River',
	lantern: 'Road',
	ash: 'Road',
	home: 'Gate',
	dead_river: 'River',
	dead_volcano: 'Volcano',
	dead_water: 'Lake',
	dead_cave: 'Cave',
	dead_bridge: 'Bridge',
	dead_tunnel: 'Tunnel',
	dead_mill: 'Mill',
	dead_pit: 'Pit',
	dead_raft: 'Raft',
	dead_swim: 'Crossing',
	dead_market: 'Market',
	dead_chapel: 'Chapel',
	dead_mirror: 'Lake',
	dead_hollow: 'Hollow',
	dead_wall: 'Wall',
	dead_well: 'Well'
};

/** A few tags on the opening places, to show the designer what they are for. */
const ATTRIBUTES_FOR_NODE: Record<string, string[]> = {
	forest: ['dark', 'large', 'dense'],
	mountain: ['high', 'dangerous'],
	dead_river: ['deep', 'dangerous'],
	dead_water: ['dark', 'deep'],
	dead_cave: ['dark', 'evil'],
	dead_mirror: ['cursed'],
	home: ['bright']
};

const q = (value: string) => JSON.stringify(value);

const chunks: string[] = [
	`import type { Locale } from '../i18n/index.ts';`,
	`import type { EndingType, NodeKind, ChoiceResult } from '../engine/types.ts';`,
	'',
	'/**',
	' * THE LONG WAY HOME, as data.',
	' *',
	" * Generated once by `scripts/emit-homeward.ts` from the prototype's",
	' * hand-written map and its computed layout, then frozen here. Every title,',
	' * epitaph, path name and node position is exactly what the game shipped with',
	' * before stories moved into the database.',
	' *',
	' * Edit it by hand if you like — it is now just the built-in story, and the',
	' * designer can produce more of them. Re-seed to apply changes.',
	' */',
	'',
	'export type SeedChoice = {',
	'\tlabel: string;',
	'\t/** Key of the node this way leads to. */',
	'\tto: string;',
	'\tresult: ChoiceResult;',
	'\tconsequence: string;',
	'};',
	'',
	'export type SeedNode = {',
	'\t/** Stable, human-readable key. Only used to wire the choices up on seeding. */',
	'\tkey: string;',
	'\t/** English name of a palette template, or null for a one-off node. */',
	'\ttemplate: string | null;',
	'\tkind: NodeKind;',
	'\ttitle: string;',
	'\tbody: string;',
	'\tendingType: EndingType | null;',
	'\tx: number;',
	'\ty: number;',
	'\t/** English names of palette attributes. */',
	'\tattributes: string[];',
	'\tchoices: SeedChoice[];',
	'};',
	'',
	'export type StorySeed = {',
	'\tslug: string;',
	'\tname: string;',
	'\tdescription: string;',
	'\tstartKey: string;',
	'\tnodes: SeedNode[];',
	'};',
	''
];

const entries: string[] = [];

for (const locale of LOCALES) {
	const map = homewardMap(locale);
	const layout = layoutTree(map);

	const nodes = Object.values(map.nodes).map((node) => {
		const placed = layout.nodes[node.id];
		const ending =
			node.kind === 'home' ? `'SUCCESS'` : node.kind === 'death' ? `'FAILURE'` : 'null';

		const choices = node.choices.map(
			(choice) =>
				`\t\t\t\t{ label: ${q(choice.label)}, to: ${q(choice.nextNode)}, result: 'ADVANCE', consequence: '' }`
		);

		return [
			'\t\t\t{',
			`\t\t\t\tkey: ${q(node.id)},`,
			`\t\t\t\ttemplate: ${TEMPLATE_FOR_NODE[node.id] ? q(TEMPLATE_FOR_NODE[node.id]) : 'null'},`,
			`\t\t\t\tkind: 'LOCATION',`,
			`\t\t\t\ttitle: ${q(node.title)},`,
			// A death node's epitaph *is* the text read out when a run stops there.
			`\t\t\t\tbody: ${q(node.epitaph ?? node.description)},`,
			`\t\t\t\tendingType: ${ending},`,
			`\t\t\t\tx: ${placed?.x ?? 0},`,
			`\t\t\t\ty: ${placed?.y ?? 0},`,
			`\t\t\t\tattributes: ${JSON.stringify(ATTRIBUTES_FOR_NODE[node.id] ?? [])},`,
			choices.length
				? `\t\t\t\tchoices: [\n${choices.join(',\n')}\n\t\t\t\t]`
				: `\t\t\t\tchoices: []`,
			'\t\t\t}'
		].join('\n');
	});

	entries.push(
		[
			`\t${locale}: {`,
			`\t\tslug: 'homeward-${locale}',`,
			`\t\tname: ${q(map.name)},`,
			`\t\tdescription: ${q(map.tagline)},`,
			`\t\tstartKey: ${q(map.startNode)},`,
			`\t\tnodes: [\n${nodes.join(',\n')}\n\t\t]`,
			'\t}'
		].join('\n')
	);
}

chunks.push('export const HOMEWARD: Record<Locale, StorySeed> = {', entries.join(',\n'), '};', '');

const out = 'src/lib/db/homeward-story.ts';
writeFileSync(out, chunks.join('\n'));
console.log(`wrote ${out}`);
