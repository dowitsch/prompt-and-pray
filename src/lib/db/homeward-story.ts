import type { Locale } from '../i18n/index.ts';
import type { EndingType, NodeKind, ChoiceResult } from '../engine/types.ts';

/**
 * THE LONG WAY HOME, as data.
 *
 * Generated once by `scripts/emit-homeward.ts` from the prototype's
 * hand-written map and its computed layout, then frozen here. Every title,
 * epitaph, path name and node position is exactly what the game shipped with
 * before stories moved into the database.
 *
 * Edit it by hand if you like — it is now just the built-in story, and the
 * designer can produce more of them. Re-seed to apply changes.
 */

export type SeedChoice = {
	label: string;
	/** Key of the node this way leads to. */
	to: string;
	result: ChoiceResult;
	consequence: string;
};

export type SeedNode = {
	/** Stable, human-readable key. Only used to wire the choices up on seeding. */
	key: string;
	/** English name of a palette template, or null for a one-off node. */
	template: string | null;
	kind: NodeKind;
	title: string;
	body: string;
	endingType: EndingType | null;
	x: number;
	y: number;
	/** English names of palette attributes. */
	attributes: string[];
	choices: SeedChoice[];
};

export type StorySeed = {
	slug: string;
	name: string;
	description: string;
	startKey: string;
	nodes: SeedNode[];
};

export const HOMEWARD: Record<Locale, StorySeed> = {
	en: {
		slug: 'homeward-en',
		name: 'THE LONG WAY HOME',
		description: 'Eight choices between your agent and the gate.',
		startKey: 'start',
		nodes: [
			{
				key: 'dead_river',
				template: 'River',
				kind: 'LOCATION',
				title: 'The River',
				body: 'The current took it. Nothing came back downstream.',
				endingType: 'FAILURE',
				x: -210,
				y: 99,
				attributes: ['deep', 'dangerous'],
				choices: []
			},
			{
				key: 'dead_volcano',
				template: 'Volcano',
				kind: 'LOCATION',
				title: 'The Volcano',
				body: 'The ash was warm, then it was not warm at all.',
				endingType: 'FAILURE',
				x: 210,
				y: 99,
				attributes: [],
				choices: []
			},
			{
				key: 'start',
				template: 'Crossroads',
				kind: 'LOCATION',
				title: 'The Three Trails',
				body: 'Your carrier signal died somewhere over this valley. Three ways lead out of it.',
				endingType: null,
				x: 0,
				y: 0,
				attributes: [],
				choices: [
					{ label: 'River', to: 'dead_river', result: 'ADVANCE', consequence: '' },
					{ label: 'Forest', to: 'forest', result: 'ADVANCE', consequence: '' },
					{ label: 'Volcano', to: 'dead_volcano', result: 'ADVANCE', consequence: '' }
				]
			},
			{
				key: 'dead_water',
				template: 'Lake',
				kind: 'LOCATION',
				title: 'The Black Water',
				body: 'It waded in. The water did not ripple when it stopped moving.',
				endingType: 'FAILURE',
				x: -210,
				y: 249,
				attributes: ['dark', 'deep'],
				choices: []
			},
			{
				key: 'dead_cave',
				template: 'Cave',
				kind: 'LOCATION',
				title: 'The Cave',
				body: 'Something in there was already awake.',
				endingType: 'FAILURE',
				x: 210,
				y: 249,
				attributes: ['dark', 'evil'],
				choices: []
			},
			{
				key: 'forest',
				template: 'Forest',
				kind: 'LOCATION',
				title: 'Under the Canopy',
				body: 'The trees close overhead. Three gaps in the green, and no sky to steer by.',
				endingType: null,
				x: 0,
				y: 150,
				attributes: ['dark', 'large', 'dense'],
				choices: [
					{ label: 'Mountain', to: 'mountain', result: 'ADVANCE', consequence: '' },
					{ label: 'Black Water', to: 'dead_water', result: 'ADVANCE', consequence: '' },
					{ label: 'Cave', to: 'dead_cave', result: 'ADVANCE', consequence: '' }
				]
			},
			{
				key: 'dead_bridge',
				template: 'Bridge',
				kind: 'LOCATION',
				title: 'The Bridge',
				body: 'The rope held for four steps. There were nine steps.',
				endingType: 'FAILURE',
				x: -210,
				y: 399,
				attributes: [],
				choices: []
			},
			{
				key: 'dead_tunnel',
				template: 'Tunnel',
				kind: 'LOCATION',
				title: 'The Tunnel',
				body: 'It walked in straight and never found the far end.',
				endingType: 'FAILURE',
				x: 210,
				y: 399,
				attributes: [],
				choices: []
			},
			{
				key: 'mountain',
				template: 'Mountain',
				kind: 'LOCATION',
				title: 'The Ridge',
				body: 'Above the treeline at last. The wind is loud enough to think in.',
				endingType: null,
				x: 0,
				y: 300,
				attributes: ['high', 'dangerous'],
				choices: [
					{ label: 'Bridge', to: 'dead_bridge', result: 'ADVANCE', consequence: '' },
					{ label: 'Valley', to: 'valley', result: 'ADVANCE', consequence: '' },
					{ label: 'Tunnel', to: 'dead_tunnel', result: 'ADVANCE', consequence: '' }
				]
			},
			{
				key: 'dead_mill',
				template: 'Mill',
				kind: 'LOCATION',
				title: 'The Mill',
				body: 'The wheel was still turning. There was no water to turn it.',
				endingType: 'FAILURE',
				x: -210,
				y: 549,
				attributes: [],
				choices: []
			},
			{
				key: 'dead_pit',
				template: 'Pit',
				kind: 'LOCATION',
				title: 'The Pit',
				body: 'It went down to look. Down was further than it looked.',
				endingType: 'FAILURE',
				x: 210,
				y: 549,
				attributes: [],
				choices: []
			},
			{
				key: 'valley',
				template: 'Valley',
				kind: 'LOCATION',
				title: 'The Valley Floor',
				body: 'Soft ground, low mist, and the smell of something that used to be a town.',
				endingType: null,
				x: 0,
				y: 450,
				attributes: [],
				choices: [
					{ label: 'Mill', to: 'dead_mill', result: 'ADVANCE', consequence: '' },
					{ label: 'Orchard', to: 'orchard', result: 'ADVANCE', consequence: '' },
					{ label: 'Pit', to: 'dead_pit', result: 'ADVANCE', consequence: '' }
				]
			},
			{
				key: 'dead_raft',
				template: 'Raft',
				kind: 'LOCATION',
				title: 'The Raft',
				body: 'Six planks and good intentions. The river was unimpressed.',
				endingType: 'FAILURE',
				x: -210,
				y: 699,
				attributes: [],
				choices: []
			},
			{
				key: 'dead_swim',
				template: 'Crossing',
				kind: 'LOCATION',
				title: 'The Crossing',
				body: 'It was a strong swimmer for about ninety seconds.',
				endingType: 'FAILURE',
				x: 210,
				y: 699,
				attributes: [],
				choices: []
			},
			{
				key: 'orchard',
				template: 'Orchard',
				kind: 'LOCATION',
				title: 'The Wide River',
				body: 'Old fruit trees give way to a river too broad to see across.',
				endingType: null,
				x: 0,
				y: 600,
				attributes: [],
				choices: [
					{ label: 'Ferry', to: 'ferry', result: 'ADVANCE', consequence: '' },
					{ label: 'Raft', to: 'dead_raft', result: 'ADVANCE', consequence: '' },
					{ label: 'Swim', to: 'dead_swim', result: 'ADVANCE', consequence: '' }
				]
			},
			{
				key: 'dead_market',
				template: 'Market',
				kind: 'LOCATION',
				title: 'The Night Market',
				body: 'Everyone was very friendly. That was the problem.',
				endingType: 'FAILURE',
				x: -210,
				y: 849,
				attributes: [],
				choices: []
			},
			{
				key: 'dead_chapel',
				template: 'Chapel',
				kind: 'LOCATION',
				title: 'The Chapel',
				body: 'The door closed behind it, politely, and stayed closed.',
				endingType: 'FAILURE',
				x: 210,
				y: 849,
				attributes: [],
				choices: []
			},
			{
				key: 'ferry',
				template: 'River',
				kind: 'LOCATION',
				title: 'The Far Bank',
				body: 'The ferryman does not speak. Ahead, three lit ways into the dark.',
				endingType: null,
				x: 0,
				y: 750,
				attributes: [],
				choices: [
					{ label: 'Market', to: 'dead_market', result: 'ADVANCE', consequence: '' },
					{ label: 'Chapel', to: 'dead_chapel', result: 'ADVANCE', consequence: '' },
					{ label: 'Lantern Road', to: 'lantern', result: 'ADVANCE', consequence: '' }
				]
			},
			{
				key: 'dead_mirror',
				template: 'Lake',
				kind: 'LOCATION',
				title: 'Mirror Lake',
				body: 'It saw itself arrive home. It kept walking toward that.',
				endingType: 'FAILURE',
				x: -210,
				y: 999,
				attributes: ['cursed'],
				choices: []
			},
			{
				key: 'dead_hollow',
				template: 'Hollow',
				kind: 'LOCATION',
				title: 'The Hollow',
				body: 'The ground was thin here. It is thinner now.',
				endingType: 'FAILURE',
				x: 210,
				y: 999,
				attributes: [],
				choices: []
			},
			{
				key: 'lantern',
				template: 'Road',
				kind: 'LOCATION',
				title: 'Where the Lights End',
				body: 'The last lantern gutters out. Three roads continue without it.',
				endingType: null,
				x: 0,
				y: 900,
				attributes: [],
				choices: [
					{ label: 'Ashfall', to: 'ash', result: 'ADVANCE', consequence: '' },
					{ label: 'Mirror Lake', to: 'dead_mirror', result: 'ADVANCE', consequence: '' },
					{ label: 'Hollow', to: 'dead_hollow', result: 'ADVANCE', consequence: '' }
				]
			},
			{
				key: 'dead_wall',
				template: 'Wall',
				kind: 'LOCATION',
				title: 'The Wall',
				body: 'It climbed. The wall was taller on the other side.',
				endingType: 'FAILURE',
				x: -210,
				y: 1149,
				attributes: [],
				choices: []
			},
			{
				key: 'dead_well',
				template: 'Well',
				kind: 'LOCATION',
				title: 'The Well',
				body: 'It heard voices down there. They were not saying come back.',
				endingType: 'FAILURE',
				x: 210,
				y: 1149,
				attributes: [],
				choices: []
			},
			{
				key: 'ash',
				template: 'Road',
				kind: 'LOCATION',
				title: 'The Last Gate',
				body: 'Grey ash, grey air, and the outline of somewhere you know.',
				endingType: null,
				x: 0,
				y: 1050,
				attributes: [],
				choices: [
					{ label: 'The Gate', to: 'home', result: 'ADVANCE', consequence: '' },
					{ label: 'Wall', to: 'dead_wall', result: 'ADVANCE', consequence: '' },
					{ label: 'Well', to: 'dead_well', result: 'ADVANCE', consequence: '' }
				]
			},
			{
				key: 'home',
				template: 'Gate',
				kind: 'LOCATION',
				title: 'HOME',
				body: 'The gate opens. The signal reconnects. It made it.',
				endingType: 'SUCCESS',
				x: 0,
				y: 1200,
				attributes: ['bright'],
				choices: []
			}
		]
	},
	de: {
		slug: 'homeward-de',
		name: 'DER LANGE WEG NACH HAUSE',
		description: 'Acht Entscheidungen zwischen deinem Agenten und dem Tor.',
		startKey: 'start',
		nodes: [
			{
				key: 'dead_river',
				template: 'River',
				kind: 'LOCATION',
				title: 'Der Fluss',
				body: 'Die Strömung nahm es mit. Flussabwärts kam nichts zurück.',
				endingType: 'FAILURE',
				x: -210,
				y: 99,
				attributes: ['deep', 'dangerous'],
				choices: []
			},
			{
				key: 'dead_volcano',
				template: 'Volcano',
				kind: 'LOCATION',
				title: 'Der Vulkan',
				body: 'Die Asche war warm, dann war sie überhaupt nicht mehr warm.',
				endingType: 'FAILURE',
				x: 210,
				y: 99,
				attributes: [],
				choices: []
			},
			{
				key: 'start',
				template: 'Crossroads',
				kind: 'LOCATION',
				title: 'Die drei Pfade',
				body: 'Dein Trägersignal erlosch irgendwo über diesem Tal. Drei Wege führen hinaus.',
				endingType: null,
				x: 0,
				y: 0,
				attributes: [],
				choices: [
					{ label: 'Fluss', to: 'dead_river', result: 'ADVANCE', consequence: '' },
					{ label: 'Wald', to: 'forest', result: 'ADVANCE', consequence: '' },
					{ label: 'Vulkan', to: 'dead_volcano', result: 'ADVANCE', consequence: '' }
				]
			},
			{
				key: 'dead_water',
				template: 'Lake',
				kind: 'LOCATION',
				title: 'Das schwarze Wasser',
				body: 'Es watete hinein. Das Wasser kräuselte sich nicht, als es stillstand.',
				endingType: 'FAILURE',
				x: -210,
				y: 249,
				attributes: ['dark', 'deep'],
				choices: []
			},
			{
				key: 'dead_cave',
				template: 'Cave',
				kind: 'LOCATION',
				title: 'Die Höhle',
				body: 'Etwas darin war bereits wach.',
				endingType: 'FAILURE',
				x: 210,
				y: 249,
				attributes: ['dark', 'evil'],
				choices: []
			},
			{
				key: 'forest',
				template: 'Forest',
				kind: 'LOCATION',
				title: 'Unter dem Blätterdach',
				body: 'Die Bäume schließen sich über ihm. Drei Lücken im Grün, und kein Himmel zum Steuern.',
				endingType: null,
				x: 0,
				y: 150,
				attributes: ['dark', 'large', 'dense'],
				choices: [
					{ label: 'Berg', to: 'mountain', result: 'ADVANCE', consequence: '' },
					{ label: 'Wasser', to: 'dead_water', result: 'ADVANCE', consequence: '' },
					{ label: 'Höhle', to: 'dead_cave', result: 'ADVANCE', consequence: '' }
				]
			},
			{
				key: 'dead_bridge',
				template: 'Bridge',
				kind: 'LOCATION',
				title: 'Die Brücke',
				body: 'Das Seil hielt vier Schritte lang. Es waren neun Schritte.',
				endingType: 'FAILURE',
				x: -210,
				y: 399,
				attributes: [],
				choices: []
			},
			{
				key: 'dead_tunnel',
				template: 'Tunnel',
				kind: 'LOCATION',
				title: 'Der Tunnel',
				body: 'Es ging geradewegs hinein und fand das andere Ende nie.',
				endingType: 'FAILURE',
				x: 210,
				y: 399,
				attributes: [],
				choices: []
			},
			{
				key: 'mountain',
				template: 'Mountain',
				kind: 'LOCATION',
				title: 'Der Grat',
				body: 'Endlich über der Baumgrenze. Der Wind ist laut genug zum Nachdenken.',
				endingType: null,
				x: 0,
				y: 300,
				attributes: ['high', 'dangerous'],
				choices: [
					{ label: 'Brücke', to: 'dead_bridge', result: 'ADVANCE', consequence: '' },
					{ label: 'Tal', to: 'valley', result: 'ADVANCE', consequence: '' },
					{ label: 'Tunnel', to: 'dead_tunnel', result: 'ADVANCE', consequence: '' }
				]
			},
			{
				key: 'dead_mill',
				template: 'Mill',
				kind: 'LOCATION',
				title: 'Die Mühle',
				body: 'Das Rad drehte sich noch. Es gab kein Wasser, das es drehte.',
				endingType: 'FAILURE',
				x: -210,
				y: 549,
				attributes: [],
				choices: []
			},
			{
				key: 'dead_pit',
				template: 'Pit',
				kind: 'LOCATION',
				title: 'Die Grube',
				body: 'Es stieg hinab, um nachzusehen. Hinab war weiter, als es aussah.',
				endingType: 'FAILURE',
				x: 210,
				y: 549,
				attributes: [],
				choices: []
			},
			{
				key: 'valley',
				template: 'Valley',
				kind: 'LOCATION',
				title: 'Der Talgrund',
				body: 'Weicher Boden, tiefer Nebel und der Geruch von etwas, das einmal eine Stadt war.',
				endingType: null,
				x: 0,
				y: 450,
				attributes: [],
				choices: [
					{ label: 'Mühle', to: 'dead_mill', result: 'ADVANCE', consequence: '' },
					{ label: 'Obstgarten', to: 'orchard', result: 'ADVANCE', consequence: '' },
					{ label: 'Grube', to: 'dead_pit', result: 'ADVANCE', consequence: '' }
				]
			},
			{
				key: 'dead_raft',
				template: 'Raft',
				kind: 'LOCATION',
				title: 'Das Floß',
				body: 'Sechs Bretter und guter Wille. Den Strom beeindruckte das nicht.',
				endingType: 'FAILURE',
				x: -210,
				y: 699,
				attributes: [],
				choices: []
			},
			{
				key: 'dead_swim',
				template: 'Crossing',
				kind: 'LOCATION',
				title: 'Die Querung',
				body: 'Es war ein starker Schwimmer, etwa neunzig Sekunden lang.',
				endingType: 'FAILURE',
				x: 210,
				y: 699,
				attributes: [],
				choices: []
			},
			{
				key: 'orchard',
				template: 'Orchard',
				kind: 'LOCATION',
				title: 'Der breite Strom',
				body: 'Alte Obstbäume weichen einem Strom, zu breit, um hinüberzusehen.',
				endingType: null,
				x: 0,
				y: 600,
				attributes: [],
				choices: [
					{ label: 'Fähre', to: 'ferry', result: 'ADVANCE', consequence: '' },
					{ label: 'Floß', to: 'dead_raft', result: 'ADVANCE', consequence: '' },
					{ label: 'Schwimmen', to: 'dead_swim', result: 'ADVANCE', consequence: '' }
				]
			},
			{
				key: 'dead_market',
				template: 'Market',
				kind: 'LOCATION',
				title: 'Der Nachtmarkt',
				body: 'Alle waren überaus freundlich. Das war das Problem.',
				endingType: 'FAILURE',
				x: -210,
				y: 849,
				attributes: [],
				choices: []
			},
			{
				key: 'dead_chapel',
				template: 'Chapel',
				kind: 'LOCATION',
				title: 'Die Kapelle',
				body: 'Die Tür schloss sich höflich hinter ihm und blieb zu.',
				endingType: 'FAILURE',
				x: 210,
				y: 849,
				attributes: [],
				choices: []
			},
			{
				key: 'ferry',
				template: 'River',
				kind: 'LOCATION',
				title: 'Das andere Ufer',
				body: 'Der Fährmann spricht nicht. Voraus drei erleuchtete Wege ins Dunkel.',
				endingType: null,
				x: 0,
				y: 750,
				attributes: [],
				choices: [
					{ label: 'Markt', to: 'dead_market', result: 'ADVANCE', consequence: '' },
					{ label: 'Kapelle', to: 'dead_chapel', result: 'ADVANCE', consequence: '' },
					{ label: 'Laternen', to: 'lantern', result: 'ADVANCE', consequence: '' }
				]
			},
			{
				key: 'dead_mirror',
				template: 'Lake',
				kind: 'LOCATION',
				title: 'Der Spiegelsee',
				body: 'Es sah sich selbst zu Hause ankommen. Es ging weiter darauf zu.',
				endingType: 'FAILURE',
				x: -210,
				y: 999,
				attributes: ['cursed'],
				choices: []
			},
			{
				key: 'dead_hollow',
				template: 'Hollow',
				kind: 'LOCATION',
				title: 'Die Senke',
				body: 'Der Boden war hier dünn. Jetzt ist er dünner.',
				endingType: 'FAILURE',
				x: 210,
				y: 999,
				attributes: [],
				choices: []
			},
			{
				key: 'lantern',
				template: 'Road',
				kind: 'LOCATION',
				title: 'Wo die Lichter enden',
				body: 'Die letzte Laterne verlischt. Drei Wege gehen ohne sie weiter.',
				endingType: null,
				x: 0,
				y: 900,
				attributes: [],
				choices: [
					{ label: 'Asche', to: 'ash', result: 'ADVANCE', consequence: '' },
					{ label: 'Spiegel', to: 'dead_mirror', result: 'ADVANCE', consequence: '' },
					{ label: 'Senke', to: 'dead_hollow', result: 'ADVANCE', consequence: '' }
				]
			},
			{
				key: 'dead_wall',
				template: 'Wall',
				kind: 'LOCATION',
				title: 'Die Mauer',
				body: 'Es kletterte. Auf der anderen Seite war die Mauer höher.',
				endingType: 'FAILURE',
				x: -210,
				y: 1149,
				attributes: [],
				choices: []
			},
			{
				key: 'dead_well',
				template: 'Well',
				kind: 'LOCATION',
				title: 'Der Brunnen',
				body: 'Es hörte Stimmen dort unten. Sie sagten nicht: komm zurück.',
				endingType: 'FAILURE',
				x: 210,
				y: 1149,
				attributes: [],
				choices: []
			},
			{
				key: 'ash',
				template: 'Road',
				kind: 'LOCATION',
				title: 'Das letzte Tor',
				body: 'Graue Asche, graue Luft und die Umrisse von etwas, das du kennst.',
				endingType: null,
				x: 0,
				y: 1050,
				attributes: [],
				choices: [
					{ label: 'Tor', to: 'home', result: 'ADVANCE', consequence: '' },
					{ label: 'Mauer', to: 'dead_wall', result: 'ADVANCE', consequence: '' },
					{ label: 'Brunnen', to: 'dead_well', result: 'ADVANCE', consequence: '' }
				]
			},
			{
				key: 'home',
				template: 'Gate',
				kind: 'LOCATION',
				title: 'ZU HAUSE',
				body: 'Das Tor öffnet sich. Das Signal kehrt zurück. Es hat es geschafft.',
				endingType: 'SUCCESS',
				x: 0,
				y: 1200,
				attributes: ['bright'],
				choices: []
			}
		]
	}
};
