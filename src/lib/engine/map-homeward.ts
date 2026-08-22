import type { DecisionMap, DecisionNode, DecisionChoice } from './types.ts';
import type { Locale } from '../i18n/index.ts';

/**
 * THE LONG WAY HOME — the prototype's single hand-designed map.
 *
 * 8 decision levels, 3 choices each, exactly one correct choice per level and
 * exactly one path to HOME. Every wrong choice leads to its own terminal death
 * node with its own epitaph, so the tree reads as a place rather than a graph.
 *
 * The correct path: Forest -> Mountain -> Valley -> Orchard -> Ferry ->
 * Lantern Road -> Ash Road -> The Gate.
 *
 * **Choice ids are language-independent** (`river`, `forest`, …). Only the
 * display text is translated, so the LLM contract, the reveal state and every
 * saved game stay identical whichever language a match is told in.
 *
 * Two rules govern the labels in *any* language, because the agent matches a
 * player's handwritten notes against them by keyword:
 *   1. No two labels at the same level may share a significant word.
 *   2. Prefer single common words. A German player has twenty characters to
 *      spend, and "Schwarzwasser" eats most of them.
 */

type Text = Record<Locale, string>;

type LevelSpec = {
	node: string;
	title: Text;
	description: Text;
	choices: {
		id: string;
		label: Text;
		correct?: true;
		epitaph?: Text;
		deathTitle?: Text;
	}[];
};

const LEVELS: LevelSpec[] = [
	{
		node: 'start',
		title: { en: 'The Three Trails', de: 'Die drei Pfade' },
		description: {
			en: 'Your carrier signal died somewhere over this valley. Three ways lead out of it.',
			de: 'Dein Trägersignal erlosch irgendwo über diesem Tal. Drei Wege führen hinaus.'
		},
		choices: [
			{
				id: 'river',
				label: { en: 'River', de: 'Fluss' },
				deathTitle: { en: 'The River', de: 'Der Fluss' },
				epitaph: {
					en: 'The current took it. Nothing came back downstream.',
					de: 'Die Strömung nahm es mit. Flussabwärts kam nichts zurück.'
				}
			},
			{ id: 'forest', label: { en: 'Forest', de: 'Wald' }, correct: true },
			{
				id: 'volcano',
				label: { en: 'Volcano', de: 'Vulkan' },
				deathTitle: { en: 'The Volcano', de: 'Der Vulkan' },
				epitaph: {
					en: 'The ash was warm, then it was not warm at all.',
					de: 'Die Asche war warm, dann war sie überhaupt nicht mehr warm.'
				}
			}
		]
	},
	{
		node: 'forest',
		title: { en: 'Under the Canopy', de: 'Unter dem Blätterdach' },
		description: {
			en: 'The trees close overhead. Three gaps in the green, and no sky to steer by.',
			de: 'Die Bäume schließen sich über ihm. Drei Lücken im Grün, und kein Himmel zum Steuern.'
		},
		choices: [
			{ id: 'mountain', label: { en: 'Mountain', de: 'Berg' }, correct: true },
			{
				id: 'water',
				label: { en: 'Black Water', de: 'Wasser' },
				deathTitle: { en: 'The Black Water', de: 'Das schwarze Wasser' },
				epitaph: {
					en: 'It waded in. The water did not ripple when it stopped moving.',
					de: 'Es watete hinein. Das Wasser kräuselte sich nicht, als es stillstand.'
				}
			},
			{
				id: 'cave',
				label: { en: 'Cave', de: 'Höhle' },
				deathTitle: { en: 'The Cave', de: 'Die Höhle' },
				epitaph: {
					en: 'Something in there was already awake.',
					de: 'Etwas darin war bereits wach.'
				}
			}
		]
	},
	{
		node: 'mountain',
		title: { en: 'The Ridge', de: 'Der Grat' },
		description: {
			en: 'Above the treeline at last. The wind is loud enough to think in.',
			de: 'Endlich über der Baumgrenze. Der Wind ist laut genug zum Nachdenken.'
		},
		choices: [
			{
				id: 'bridge',
				label: { en: 'Bridge', de: 'Brücke' },
				deathTitle: { en: 'The Bridge', de: 'Die Brücke' },
				epitaph: {
					en: 'The rope held for four steps. There were nine steps.',
					de: 'Das Seil hielt vier Schritte lang. Es waren neun Schritte.'
				}
			},
			{ id: 'valley', label: { en: 'Valley', de: 'Tal' }, correct: true },
			{
				id: 'tunnel',
				label: { en: 'Tunnel', de: 'Tunnel' },
				deathTitle: { en: 'The Tunnel', de: 'Der Tunnel' },
				epitaph: {
					en: 'It walked in straight and never found the far end.',
					de: 'Es ging geradewegs hinein und fand das andere Ende nie.'
				}
			}
		]
	},
	{
		node: 'valley',
		title: { en: 'The Valley Floor', de: 'Der Talgrund' },
		description: {
			en: 'Soft ground, low mist, and the smell of something that used to be a town.',
			de: 'Weicher Boden, tiefer Nebel und der Geruch von etwas, das einmal eine Stadt war.'
		},
		choices: [
			{
				id: 'mill',
				label: { en: 'Mill', de: 'Mühle' },
				deathTitle: { en: 'The Mill', de: 'Die Mühle' },
				epitaph: {
					en: 'The wheel was still turning. There was no water to turn it.',
					de: 'Das Rad drehte sich noch. Es gab kein Wasser, das es drehte.'
				}
			},
			{ id: 'orchard', label: { en: 'Orchard', de: 'Obstgarten' }, correct: true },
			{
				id: 'pit',
				label: { en: 'Pit', de: 'Grube' },
				deathTitle: { en: 'The Pit', de: 'Die Grube' },
				epitaph: {
					en: 'It went down to look. Down was further than it looked.',
					de: 'Es stieg hinab, um nachzusehen. Hinab war weiter, als es aussah.'
				}
			}
		]
	},
	{
		node: 'orchard',
		title: { en: 'The Wide River', de: 'Der breite Strom' },
		description: {
			en: 'Old fruit trees give way to a river too broad to see across.',
			de: 'Alte Obstbäume weichen einem Strom, zu breit, um hinüberzusehen.'
		},
		choices: [
			{ id: 'ferry', label: { en: 'Ferry', de: 'Fähre' }, correct: true },
			{
				id: 'raft',
				label: { en: 'Raft', de: 'Floß' },
				deathTitle: { en: 'The Raft', de: 'Das Floß' },
				epitaph: {
					en: 'Six planks and good intentions. The river was unimpressed.',
					de: 'Sechs Bretter und guter Wille. Den Strom beeindruckte das nicht.'
				}
			},
			{
				id: 'swim',
				label: { en: 'Swim', de: 'Schwimmen' },
				deathTitle: { en: 'The Crossing', de: 'Die Querung' },
				epitaph: {
					en: 'It was a strong swimmer for about ninety seconds.',
					de: 'Es war ein starker Schwimmer, etwa neunzig Sekunden lang.'
				}
			}
		]
	},
	{
		node: 'ferry',
		title: { en: 'The Far Bank', de: 'Das andere Ufer' },
		description: {
			en: 'The ferryman does not speak. Ahead, three lit ways into the dark.',
			de: 'Der Fährmann spricht nicht. Voraus drei erleuchtete Wege ins Dunkel.'
		},
		choices: [
			{
				id: 'market',
				label: { en: 'Market', de: 'Markt' },
				deathTitle: { en: 'The Night Market', de: 'Der Nachtmarkt' },
				epitaph: {
					en: 'Everyone was very friendly. That was the problem.',
					de: 'Alle waren überaus freundlich. Das war das Problem.'
				}
			},
			{
				id: 'chapel',
				label: { en: 'Chapel', de: 'Kapelle' },
				deathTitle: { en: 'The Chapel', de: 'Die Kapelle' },
				epitaph: {
					en: 'The door closed behind it, politely, and stayed closed.',
					de: 'Die Tür schloss sich höflich hinter ihm und blieb zu.'
				}
			},
			{ id: 'lantern', label: { en: 'Lantern Road', de: 'Laternen' }, correct: true }
		]
	},
	{
		node: 'lantern',
		title: { en: 'Where the Lights End', de: 'Wo die Lichter enden' },
		description: {
			en: 'The last lantern gutters out. Three roads continue without it.',
			de: 'Die letzte Laterne verlischt. Drei Wege gehen ohne sie weiter.'
		},
		choices: [
			// Shares no significant word with any other label at any level:
			// notes are matched by keyword, so overlapping names would fire twice.
			{ id: 'ash', label: { en: 'Ashfall', de: 'Asche' }, correct: true },
			{
				id: 'mirror',
				label: { en: 'Mirror Lake', de: 'Spiegel' },
				deathTitle: { en: 'Mirror Lake', de: 'Der Spiegelsee' },
				epitaph: {
					en: 'It saw itself arrive home. It kept walking toward that.',
					de: 'Es sah sich selbst zu Hause ankommen. Es ging weiter darauf zu.'
				}
			},
			{
				id: 'hollow',
				label: { en: 'Hollow', de: 'Senke' },
				deathTitle: { en: 'The Hollow', de: 'Die Senke' },
				epitaph: {
					en: 'The ground was thin here. It is thinner now.',
					de: 'Der Boden war hier dünn. Jetzt ist er dünner.'
				}
			}
		]
	},
	{
		node: 'ash',
		title: { en: 'The Last Gate', de: 'Das letzte Tor' },
		description: {
			en: 'Grey ash, grey air, and the outline of somewhere you know.',
			de: 'Graue Asche, graue Luft und die Umrisse von etwas, das du kennst.'
		},
		choices: [
			{ id: 'gate', label: { en: 'The Gate', de: 'Tor' }, correct: true },
			{
				id: 'wall',
				label: { en: 'Wall', de: 'Mauer' },
				deathTitle: { en: 'The Wall', de: 'Die Mauer' },
				epitaph: {
					en: 'It climbed. The wall was taller on the other side.',
					de: 'Es kletterte. Auf der anderen Seite war die Mauer höher.'
				}
			},
			{
				id: 'well',
				label: { en: 'Well', de: 'Brunnen' },
				deathTitle: { en: 'The Well', de: 'Der Brunnen' },
				epitaph: {
					en: 'It heard voices down there. They were not saying come back.',
					de: 'Es hörte Stimmen dort unten. Sie sagten nicht: komm zurück.'
				}
			}
		]
	}
];

const HOME_NODE = 'home';

const MAP_NAME: Text = { en: 'THE LONG WAY HOME', de: 'DER LANGE WEG NACH HAUSE' };
const MAP_TAGLINE: Text = {
	en: 'Eight choices between your agent and the gate.',
	de: 'Acht Entscheidungen zwischen deinem Agenten und dem Tor.'
};
const HOME_TITLE: Text = { en: 'HOME', de: 'ZU HAUSE' };
const HOME_DESCRIPTION: Text = {
	en: 'The gate opens. The signal reconnects. It made it.',
	de: 'Das Tor öffnet sich. Das Signal kehrt zurück. Es hat es geschafft.'
};

function build(locale: Locale): DecisionMap {
	const nodes: Record<string, DecisionNode> = {};

	for (const [level, spec] of LEVELS.entries()) {
		const isLastLevel = level === LEVELS.length - 1;
		const choices: DecisionChoice[] = [];

		for (const choice of spec.choices) {
			if (choice.correct) {
				choices.push({
					id: choice.id,
					label: choice.label[locale],
					nextNode: isLastLevel ? HOME_NODE : choice.id,
					outcome: isLastLevel ? 'win' : 'continue'
				});
				continue;
			}

			const deathNodeId = `dead_${choice.id}`;
			nodes[deathNodeId] = {
				id: deathNodeId,
				title: (choice.deathTitle ?? choice.label)[locale],
				description: choice.epitaph?.[locale] ?? '',
				epitaph: choice.epitaph?.[locale],
				choices: [],
				kind: 'death'
			};
			choices.push({
				id: choice.id,
				label: choice.label[locale],
				nextNode: deathNodeId,
				outcome: 'death'
			});
		}

		nodes[spec.node] = {
			id: spec.node,
			title: spec.title[locale],
			description: spec.description[locale],
			choices,
			kind: level === 0 ? 'start' : 'path'
		};
	}

	nodes[HOME_NODE] = {
		id: HOME_NODE,
		title: HOME_TITLE[locale],
		description: HOME_DESCRIPTION[locale],
		choices: [],
		kind: 'home'
	};

	return {
		id: 'homeward',
		name: MAP_NAME[locale],
		tagline: MAP_TAGLINE[locale],
		startNode: 'start',
		homeNode: HOME_NODE,
		depth: LEVELS.length,
		nodes
	};
}

const CACHE = new Map<Locale, DecisionMap>();

/** The map, told in one language. Built once per locale. */
export function homewardMap(locale: Locale): DecisionMap {
	const cached = CACHE.get(locale);
	if (cached) return cached;
	const built = build(locale);
	CACHE.set(locale, built);
	return built;
}

/** The winning sequence of choice ids. Server-side only — never sent to a client. */
export const SOLUTION: string[] = LEVELS.map(
	(level) => level.choices.find((choice) => choice.correct)!.id
);
