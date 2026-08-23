import type { Locale } from '../i18n/index.ts';
import type { StorySeed } from './homeward-story.ts';

/**
 * DIE ABKÜRZUNG / THE SHORTCUT — the demo tale, and the one that argues for the game.
 *
 * The three tales that came before are eight to ten steps long. This one is five,
 * because a match has to fit into the time somebody is willing to stand and watch:
 * nobody gets through in round one, and it is usually over by round five or six.
 *
 * Short was the easy half. The half that matters is this:
 *
 * **A road's name says nothing about where it goes.** In THE LONG WAY HOME the
 * volcano kills and the forest does not, which is fair and readable and quietly
 * disastrous for a demonstration: a spectator watching an agent avoid the volcano
 * learns that you do not have to teach it anything, you only have to hope it has
 * taste. Here the ash pit is the way on and the sunny slope is a grave — and at the
 * very next place it is the other way round. The pattern flips at every fork, so
 * neither "frightening is fatal" nor its inverse is ever learnable.
 *
 * What is left once tone is worthless is the twenty characters. That is the whole
 * point of the game, and this tale is the one place where it is unavoidable.
 *
 * Counted over all twenty-one roads: three inviting names lead on, four inviting
 * names end a run, four ominous names lead on, three ominous names end a run. The
 * rest are flat, and three of those are the ways back. Anyone adding a road here
 * should check that column before checking anything else.
 *
 * Two rules govern every label, in any language, because the agent matches a
 * player's twenty handwritten characters against them:
 *   1. No two roads out of one place may share a significant word.
 *   2. One short, plain noun. Twenty characters have to hold a name and something
 *      to say about it.
 *
 * Labels are also kept clear of the words the offline brain reads as judgements —
 * `weg`, `heim`, `sicher`, `gut`, `falle`, `tod` and the rest of `vocabulary.ts` —
 * so that a road is never accidentally arguing for or against itself. Which is why
 * the road through the bog is a `Modergang` and not a `Moderweg`.
 *
 * The shapes the engine checks for are all here in seventeen nodes: two openings
 * that rejoin at the Steg; three survivable wrong turns (`SETBACK`) that each double
 * back and so make a walkable cycle; a `DETOUR` past the lantern that costs a step
 * and closes no ground, because `distanceHome` is 3 at both ends of it; all four node
 * kinds; and an ending that is neither death nor home, because the dragon's story is
 * long and the agent was polite.
 *
 * ---
 *
 * **The land.** Six regions walked in order — Vorland, Dämmerwald, Schlucht,
 * Aschfeld, Grat, Heimat — one row each, one biome each. The generator works in
 * sections of `SECTION_W` = 192 units and a place claims the section it stands in,
 * so two places of different biomes must never share one. The rows sit 300 apart,
 * which puts them in sections 0 · 1 · 3 · 4 · 6 · 7 even after `meander` displaces
 * every place by ±55. Every grave takes the biome of the row it is drawn in rather
 * than the region of the place that killed it — which is also the truth of it, since
 * you die on the road out of one land and into the next.
 *
 * `region` is for the author and the designer's arranger; the game never reads it.
 */

export const ABKUERZUNG: Record<Locale, StorySeed> = {
	de: {
		slug: 'shortcut-de',
		name: 'DIE ABKÜRZUNG',
		description: 'Fünf Schritte bis nach Hause. Kein einziger sieht aus wie das, was er ist.',
		startKey: 'clearing',
		nodes: [
			/* ───────────────────────── das Vorland · Wiese · y 0 */
			{
				key: 'clearing',
				template: 'Crossroads',
				kind: 'LOCATION',
				title: 'Die Lichtung',
				body: 'Ein Wegweiser mit drei Armen, und auf allen drei Armen steht dasselbe: HEIM, fünf Schritte. Jemand hat sich hier einen Spaß erlaubt.',
				endingType: null,
				x: 0,
				y: 0,
				biome: 'wiese',
				sigil: '🪧',
				region: 'vorland',
				attributes: ['old', 'bright'],
				choices: [
					{
						label: 'Sonnenhang',
						to: 'dead_meadow',
						result: 'ADVANCE',
						consequence:
							'Warmes Gras, Bienen, ein Hang so sanft, dass der Agent von allein zu laufen anfängt.'
					},
					{
						label: 'Aschgrube',
						to: 'fairy',
						result: 'ADVANCE',
						consequence:
							'Es steigt in die kalte Asche hinab und hustet dabei wie ein Ofenrohr im Frühling.'
					},
					{
						label: 'Steinmal',
						to: 'ork',
						result: 'ADVANCE',
						consequence:
							'Auf dem Stein steht eine Rechnung. Sie ist alt, sie ist lang, und sie ist nicht beglichen.'
					}
				]
			},

			/* ──────────────────── der Dämmerwald · Wald · y 300 */
			{
				key: 'dead_meadow',
				template: 'Hollow',
				kind: 'LOCATION',
				title: 'Der Sonnenhang',
				body: 'Der Hang war sanft, bis er aufhörte. Unten steht ein zweiter Wegweiser: HEIM, fünf Schritte. Er zeigt nach oben.',
				endingType: 'FAILURE',
				x: 0,
				y: 300,
				biome: 'wald',
				sigil: '☀️',
				region: 'daemmerwald',
				attributes: ['bright', 'wide'],
				choices: []
			},
			{
				key: 'fairy',
				template: 'Fairy',
				kind: 'CREATURE',
				title: 'Die Aschfee',
				body: 'Etwas Kleines sitzt in der Asche und sortiert sie nach Größe. Neben ihr steht ein Honigtopf, der ihr sichtbar nicht gehört, und hinter ihr wölbt sich ein Bogen aus Dornen.',
				endingType: null,
				x: -320,
				y: 300,
				biome: 'wald',
				sigil: '🧚',
				region: 'daemmerwald',
				attributes: ['small', 'old', 'friendly'],
				choices: [
					{
						label: 'Honigtopf',
						to: 'bridge',
						result: 'ADVANCE',
						consequence:
							'Der Agent schiebt ihr den Topf hin. Sie sagt kein Wort und zeigt mit dem Kinn talwärts.'
					},
					{
						label: 'Dornentor',
						to: 'dead_thorns',
						result: 'ADVANCE',
						consequence:
							'Die Dornen geben nach. Sie geben erstaunlich weit nach. Dann geben sie nicht mehr nach.'
					},
					{
						label: 'Umkehr',
						to: 'clearing',
						result: 'SETBACK',
						consequence: 'Es klettert dieselbe Grube wieder hinauf, diesmal ohne zu husten. Übung.'
					}
				]
			},
			{
				key: 'ork',
				template: 'Ork',
				kind: 'CREATURE',
				title: 'Der alte Ork',
				body: 'Er sitzt auf dem Rechenstein, eine Axt neben sich, ein Kochfeuer davor. Beides sieht gleich alt aus, und nur eines davon ist noch scharf.',
				endingType: null,
				x: 320,
				y: 300,
				biome: 'wald',
				sigil: '🪓',
				region: 'daemmerwald',
				attributes: ['large', 'old', 'dangerous'],
				choices: [
					{
						label: 'Zweikampf',
						to: 'bridge',
						result: 'ADVANCE',
						consequence:
							'Er steht auf, holt aus, verfehlt, setzt sich wieder hin und sagt anerkennend: talwärts.'
					},
					{
						label: 'Gastmahl',
						to: 'dead_banquet',
						result: 'ADVANCE',
						consequence: 'Er schöpft großzügig. Er schöpft sehr großzügig. Er schöpft weiter.'
					},
					{
						label: 'Rückzug',
						to: 'clearing',
						result: 'SETBACK',
						consequence:
							'Der Agent geht rückwärts den Hang hinauf, um ihn nicht aus den Augen zu lassen. Es dauert.'
					}
				]
			},

			/* ───────────────────── die Schlucht · Seenland · y 600 */
			{
				key: 'dead_thorns',
				template: 'Forest',
				kind: 'LOCATION',
				title: 'Das Dornentor',
				body: 'Es war kein Tor. Es war ein Maul mit sehr viel Geduld. Die Fee sortiert seither auch Splitter.',
				endingType: 'FAILURE',
				x: -400,
				y: 600,
				biome: 'seenland',
				sigil: '🌿',
				region: 'schlucht',
				attributes: ['dense', 'dangerous'],
				choices: []
			},
			{
				key: 'bridge',
				template: 'Bridge',
				kind: 'LOCATION',
				title: 'Der Steg',
				body: 'Ein Brett über einer Schlucht, in der Wasser steht statt Boden. Drüben teilt sich alles sofort wieder in drei.',
				endingType: null,
				x: 0,
				y: 600,
				biome: 'seenland',
				sigil: '🌉',
				region: 'schlucht',
				attributes: ['old', 'deep'],
				choices: [
					{
						label: 'Blütenhang',
						to: 'dragon',
						result: 'ADVANCE',
						consequence:
							'Der Hang blüht, riecht gut und steigt an. Mehr tut er nicht, und das ist heute sehr viel wert.'
					},
					{
						label: 'Modergang',
						to: 'lantern',
						result: 'DETOUR',
						consequence:
							'Es stapft durch etwas, das früher ein Bach war. Am Ende der Senke hängt ein Licht.'
					},
					{
						label: 'Seilfähre',
						to: 'dead_ferry',
						result: 'ADVANCE',
						consequence: 'Der Agent zieht sich Hand über Hand hinüber. Das Seil zählt mit.'
					}
				]
			},
			{
				key: 'dead_banquet',
				template: 'Ambush',
				kind: 'EVENT',
				title: 'Das Gastmahl',
				body: 'Orkische Gastfreundschaft kennt kein Ende, nur Nachschlag. Man fand den Agenten drei Tage später, satt und deutlich gequollen.',
				endingType: 'FAILURE',
				x: 400,
				y: 600,
				biome: 'seenland',
				sigil: '🍖',
				region: 'schlucht',
				attributes: ['dangerous', 'sudden'],
				choices: []
			},

			/* ───────────────────── das Aschfeld · Wüste · y 900 */
			{
				key: 'lantern',
				template: 'Lantern',
				kind: 'OBJECT',
				title: 'Die Laterne',
				body: 'Eine Laterne an einer Stange, mitten im Nichts, und sie brennt. Jemand kommt hier regelmäßig vorbei. Das ist entweder sehr erfreulich oder überhaupt nicht.',
				endingType: null,
				x: -380,
				y: 900,
				biome: 'wueste',
				sigil: '🏮',
				region: 'aschfeld',
				attributes: ['old', 'abandoned'],
				choices: [
					{
						label: 'Docht',
						to: 'dragon',
						result: 'ADVANCE',
						consequence:
							'Der Agent dreht den Docht klein, nimmt die Laterne mit und geht dorthin, wo es wärmer wird.'
					},
					{
						label: 'Spiegelglas',
						to: 'dead_mirror',
						result: 'ADVANCE',
						consequence:
							'Es poliert den Spiegel hinter der Flamme. Die Laterne wird hell. Sehr hell. Weithin hell.'
					},
					{
						label: 'Abstieg',
						to: 'bridge',
						result: 'SETBACK',
						consequence: 'Zurück durch den Moder. Der Moder erinnert sich an den Agenten.'
					}
				]
			},
			{
				key: 'dragon',
				template: 'Dragon',
				kind: 'CREATURE',
				title: 'Der Drachenhort',
				body: 'Der Drache ist wach, uralt und gelangweilt. Sein Gold liegt unsortiert herum, seine Glut ist heruntergebrannt, und er hat seit vierzig Jahren mit niemandem geredet.',
				endingType: null,
				x: 0,
				y: 900,
				biome: 'wueste',
				sigil: '🐉',
				region: 'aschfeld',
				attributes: ['large', 'old', 'noble'],
				choices: [
					{
						label: 'Glutbett',
						to: 'gate',
						result: 'ADVANCE',
						consequence:
							'Der Agent steigt über die Glut. Sie ist kalt. Der Drache tut so, als merke er es nicht.'
					},
					{
						label: 'Höflichkeit',
						to: 'audience',
						result: 'ADVANCE',
						consequence:
							'Der Agent setzt sich hin. Der Drache holt Luft und beginnt bei seiner Großmutter.'
					},
					{
						label: 'Bernstein',
						to: 'dead_amber',
						result: 'ADVANCE',
						consequence:
							'Ein Stück Bernstein wandert in die Tasche. Es klimpert. Hier klimpert alles.'
					}
				]
			},
			{
				key: 'dead_ferry',
				template: 'Raft',
				kind: 'OBJECT',
				title: 'Die Seilfähre',
				body: 'Das Seil hielt bis zweiundzwanzig. Der Agent hatte auf hundert gehofft, aber nichts davon aufgeschrieben.',
				endingType: 'FAILURE',
				x: 380,
				y: 900,
				biome: 'wueste',
				sigil: '🪢',
				region: 'aschfeld',
				attributes: ['old', 'abandoned'],
				choices: []
			},

			/* ─────────────────────────── der Grat · Berge · y 1200 */
			{
				key: 'dead_mirror',
				template: 'Pit',
				kind: 'LOCATION',
				title: 'Das Leuchtfeuer',
				body: 'Man sah das Licht drei Täler weit. Etwas in einem der drei Täler sah es auch.',
				endingType: 'FAILURE',
				x: -720,
				y: 1200,
				biome: 'berge',
				sigil: '🪞',
				region: 'grat',
				attributes: ['bright', 'dangerous'],
				choices: []
			},
			{
				key: 'audience',
				template: 'Cave',
				kind: 'LOCATION',
				title: 'Die Zuhörerschaft',
				body: 'Es ist eine gute Geschichte. Sie hat einen Mittelteil, und der Mittelteil dauert bis zum Morgen. Der Agent lebt, hört zu und ist für diese Runde draußen.',
				endingType: 'NEUTRAL',
				x: -380,
				y: 1200,
				biome: 'berge',
				sigil: '🕯️',
				region: 'grat',
				attributes: ['old', 'bright'],
				choices: []
			},
			{
				key: 'gate',
				template: 'Gate',
				kind: 'LOCATION',
				title: 'Das Tor',
				body: 'Die letzte Mauer vor dem Tal. Am Tor hängt eine Glocke mit einem unangenehm langen Seil, links klafft ein Riss, und rechts steht ein Fallgitter halb offen wie ein Gähnen.',
				endingType: null,
				x: 0,
				y: 1200,
				biome: 'berge',
				sigil: '🚪',
				region: 'grat',
				attributes: ['old', 'high'],
				choices: [
					{
						label: 'Torglocke',
						to: 'home',
						result: 'ADVANCE',
						consequence:
							'Der Agent zieht. Es dauert lange, bis oben etwas geschieht, und dann geschieht es freundlich.'
					},
					{
						label: 'Mauerriss',
						to: 'dead_crack',
						result: 'ADVANCE',
						consequence: 'Der Riss ist genau breit genug. Für den Hinweg.'
					},
					{
						label: 'Fallgitter',
						to: 'dead_portcullis',
						result: 'ADVANCE',
						consequence:
							'Halb offen ist die Hälfte, die zählt. Die andere Hälfte ist die, die fällt.'
					}
				]
			},
			{
				key: 'dead_amber',
				template: 'Cave',
				kind: 'LOCATION',
				title: 'Der Hort',
				body: 'Der Drache zählt sein Gold nicht. Er wiegt es. Es fehlten vierzehn Gramm, und kurz darauf fehlte ein Agent.',
				endingType: 'FAILURE',
				x: 380,
				y: 1200,
				biome: 'berge',
				sigil: '💎',
				region: 'grat',
				attributes: ['dark', 'cursed'],
				choices: []
			},

			/* ─────────────────────────── die Heimat · Schnee · y 1500 */
			{
				key: 'dead_crack',
				template: 'Wall',
				kind: 'LOCATION',
				title: 'Der Riss',
				body: 'Er kam hinein. Er kam nicht hinaus. Die Mauer hat seither eine Verzierung, über die niemand gern spricht.',
				endingType: 'FAILURE',
				x: -330,
				y: 1500,
				biome: 'schnee',
				sigil: '🧱',
				region: 'heimat',
				attributes: ['old', 'small'],
				choices: []
			},
			{
				key: 'home',
				template: 'Village',
				kind: 'LOCATION',
				title: 'Heim',
				body: 'Jemand macht auf, sieht nach unten, sieht einen Holzagenten mit fremden Notizen in der Brust und sagt: da bist du ja. Fünf Schritte. Es waren nie fünf Schritte.',
				endingType: 'SUCCESS',
				x: 0,
				y: 1500,
				biome: 'schnee',
				sigil: '🏡',
				region: 'heimat',
				attributes: ['bright', 'small'],
				choices: []
			},
			{
				key: 'dead_portcullis',
				template: 'Castle',
				kind: 'LOCATION',
				title: 'Das Fallgitter',
				body: 'Es heißt Fallgitter. Es hat auch nie etwas anderes von sich behauptet.',
				endingType: 'FAILURE',
				x: 330,
				y: 1500,
				biome: 'schnee',
				sigil: '⛓️',
				region: 'heimat',
				attributes: ['old', 'dangerous'],
				choices: []
			}
		]
	},

	en: {
		slug: 'shortcut-en',
		name: 'THE SHORTCUT',
		description: 'Five steps to get home. Not one of them looks like what it is.',
		startKey: 'clearing',
		nodes: [
			/* ───────────────────────── the Lowland · meadow · y 0 */
			{
				key: 'clearing',
				template: 'Crossroads',
				kind: 'LOCATION',
				title: 'The Clearing',
				body: 'A signpost with three arms, and all three arms say the same thing: HOME, five steps. Somebody was having a joke.',
				endingType: null,
				x: 0,
				y: 0,
				biome: 'wiese',
				sigil: '🪧',
				region: 'lowland',
				attributes: ['old', 'bright'],
				choices: [
					{
						label: 'Meadow',
						to: 'dead_meadow',
						result: 'ADVANCE',
						consequence:
							'Warm grass, bees, and a slope so gentle the agent starts running without deciding to.'
					},
					{
						label: 'Ashpit',
						to: 'fairy',
						result: 'ADVANCE',
						consequence: 'It climbs down into the cold ash, coughing like a stovepipe in spring.'
					},
					{
						label: 'Cairn',
						to: 'ork',
						result: 'ADVANCE',
						consequence:
							'There is a bill carved into the stone. It is old, it is long, and it has not been paid.'
					}
				]
			},

			/* ──────────────────── the Duskwood · forest · y 300 */
			{
				key: 'dead_meadow',
				template: 'Hollow',
				kind: 'LOCATION',
				title: 'The Meadow',
				body: 'The slope was gentle right up until it stopped. At the bottom stands a second signpost: HOME, five steps. It points up.',
				endingType: 'FAILURE',
				x: 0,
				y: 300,
				biome: 'wald',
				sigil: '☀️',
				region: 'duskwood',
				attributes: ['bright', 'wide'],
				choices: []
			},
			{
				key: 'fairy',
				template: 'Fairy',
				kind: 'CREATURE',
				title: 'The Ash Fairy',
				body: 'Something small sits in the ash, sorting it by size. Beside her stands a honeypot that is plainly not hers, and behind her an archway of thorns.',
				endingType: null,
				x: -320,
				y: 300,
				biome: 'wald',
				sigil: '🧚',
				region: 'duskwood',
				attributes: ['small', 'old', 'friendly'],
				choices: [
					{
						label: 'Honeypot',
						to: 'bridge',
						result: 'ADVANCE',
						consequence:
							'The agent pushes the pot across to her. She says nothing and nods down the valley.'
					},
					{
						label: 'Thorngate',
						to: 'dead_thorns',
						result: 'ADVANCE',
						consequence:
							'The thorns give way. They give way a remarkably long way. Then they stop giving.'
					},
					{
						label: 'Backtrack',
						to: 'clearing',
						result: 'SETBACK',
						consequence: 'It climbs the same pit again, this time without coughing. Practice.'
					}
				]
			},
			{
				key: 'ork',
				template: 'Ork',
				kind: 'CREATURE',
				title: 'The Old Ork',
				body: 'He sits on the reckoning stone with an axe beside him and a cook fire in front of him. They look the same age, and only one of them is still sharp.',
				endingType: null,
				x: 320,
				y: 300,
				biome: 'wald',
				sigil: '🪓',
				region: 'duskwood',
				attributes: ['large', 'old', 'dangerous'],
				choices: [
					{
						label: 'Duel',
						to: 'bridge',
						result: 'ADVANCE',
						consequence:
							'He stands, swings, misses, sits back down and says, with respect: down the valley.'
					},
					{
						label: 'Banquet',
						to: 'dead_banquet',
						result: 'ADVANCE',
						consequence: 'He ladles generously. He ladles very generously. He is still ladling.'
					},
					{
						label: 'Retreat',
						to: 'clearing',
						result: 'SETBACK',
						consequence:
							'The agent walks back up the slope facing him the whole way, so as not to lose sight of him. It takes a while.'
					}
				]
			},

			/* ───────────────────── the Gorge · lakeland · y 600 */
			{
				key: 'dead_thorns',
				template: 'Forest',
				kind: 'LOCATION',
				title: 'The Thorngate',
				body: 'It was not a gate. It was a mouth with a great deal of patience. The fairy sorts splinters now too.',
				endingType: 'FAILURE',
				x: -400,
				y: 600,
				biome: 'seenland',
				sigil: '🌿',
				region: 'gorge',
				attributes: ['dense', 'dangerous'],
				choices: []
			},
			{
				key: 'bridge',
				template: 'Bridge',
				kind: 'LOCATION',
				title: 'The Footbridge',
				body: 'A plank over a gorge with water at the bottom instead of ground. On the far side everything immediately splits into three again.',
				endingType: null,
				x: 0,
				y: 600,
				biome: 'seenland',
				sigil: '🌉',
				region: 'gorge',
				attributes: ['old', 'deep'],
				choices: [
					{
						label: 'Blossoms',
						to: 'dragon',
						result: 'ADVANCE',
						consequence:
							'The slope is in flower, smells good and goes up. That is all it does, and today that is worth a great deal.'
					},
					{
						label: 'Mirepath',
						to: 'lantern',
						result: 'DETOUR',
						consequence:
							'It wades through something that used to be a stream. At the end of the hollow hangs a light.'
					},
					{
						label: 'Ropeferry',
						to: 'dead_ferry',
						result: 'ADVANCE',
						consequence: 'The agent hauls itself across hand over hand. The rope keeps count.'
					}
				]
			},
			{
				key: 'dead_banquet',
				template: 'Ambush',
				kind: 'EVENT',
				title: 'The Banquet',
				body: 'Orkish hospitality has no ending, only seconds. They found the agent three days later, full and noticeably swollen.',
				endingType: 'FAILURE',
				x: 400,
				y: 600,
				biome: 'seenland',
				sigil: '🍖',
				region: 'gorge',
				attributes: ['dangerous', 'sudden'],
				choices: []
			},

			/* ───────────────────── the Ashfield · desert · y 900 */
			{
				key: 'lantern',
				template: 'Lantern',
				kind: 'OBJECT',
				title: 'The Lantern',
				body: 'A lantern on a pole in the middle of nowhere, and it is lit. Somebody comes through here regularly. That is either very good news or the other kind.',
				endingType: null,
				x: -380,
				y: 900,
				biome: 'wueste',
				sigil: '🏮',
				region: 'ashfield',
				attributes: ['old', 'abandoned'],
				choices: [
					{
						label: 'Wick',
						to: 'dragon',
						result: 'ADVANCE',
						consequence:
							'The agent turns the wick down, takes the lantern along and walks towards the warmer air.'
					},
					{
						label: 'Mirror',
						to: 'dead_mirror',
						result: 'ADVANCE',
						consequence:
							'It polishes the mirror behind the flame. The lantern gets bright. Very bright. Bright for miles.'
					},
					{
						label: 'Descent',
						to: 'bridge',
						result: 'SETBACK',
						consequence: 'Back down through the mire. The mire remembers the agent.'
					}
				]
			},
			{
				key: 'dragon',
				template: 'Dragon',
				kind: 'CREATURE',
				title: "The Dragon's Hoard",
				body: 'The dragon is awake, ancient and bored. Its gold lies about unsorted, its embers have burned down, and it has not spoken to anybody in forty years.',
				endingType: null,
				x: 0,
				y: 900,
				biome: 'wueste',
				sigil: '🐉',
				region: 'ashfield',
				attributes: ['large', 'old', 'noble'],
				choices: [
					{
						label: 'Embers',
						to: 'gate',
						result: 'ADVANCE',
						consequence:
							'The agent steps across the embers. They are cold. The dragon pretends not to notice.'
					},
					{
						label: 'Courtesy',
						to: 'audience',
						result: 'ADVANCE',
						consequence:
							'The agent sits down. The dragon draws breath and starts with its grandmother.'
					},
					{
						label: 'Amber',
						to: 'dead_amber',
						result: 'ADVANCE',
						consequence: 'A piece of amber goes into the pocket. It clinks. Everything here clinks.'
					}
				]
			},
			{
				key: 'dead_ferry',
				template: 'Raft',
				kind: 'OBJECT',
				title: 'The Ropeferry',
				body: 'The rope held to twenty-two. The agent had been hoping for a hundred, but had written none of it down.',
				endingType: 'FAILURE',
				x: 380,
				y: 900,
				biome: 'wueste',
				sigil: '🪢',
				region: 'ashfield',
				attributes: ['old', 'abandoned'],
				choices: []
			},

			/* ─────────────────────────── the Ridge · mountains · y 1200 */
			{
				key: 'dead_mirror',
				template: 'Pit',
				kind: 'LOCATION',
				title: 'The Beacon',
				body: 'The light could be seen three valleys away. Something in one of the three valleys saw it too.',
				endingType: 'FAILURE',
				x: -720,
				y: 1200,
				biome: 'berge',
				sigil: '🪞',
				region: 'ridge',
				attributes: ['bright', 'dangerous'],
				choices: []
			},
			{
				key: 'audience',
				template: 'Cave',
				kind: 'LOCATION',
				title: 'The Audience',
				body: 'It is a good story. It has a middle, and the middle lasts until morning. The agent is alive, listening, and out of this round.',
				endingType: 'NEUTRAL',
				x: -380,
				y: 1200,
				biome: 'berge',
				sigil: '🕯️',
				region: 'ridge',
				attributes: ['old', 'bright'],
				choices: []
			},
			{
				key: 'gate',
				template: 'Gate',
				kind: 'LOCATION',
				title: 'The Gate',
				body: 'The last wall before the valley. A bell hangs at the gate on an uncomfortably long rope, a crack gapes to the left, and to the right a portcullis stands half open like a yawn.',
				endingType: null,
				x: 0,
				y: 1200,
				biome: 'berge',
				sigil: '🚪',
				region: 'ridge',
				attributes: ['old', 'high'],
				choices: [
					{
						label: 'Bellpull',
						to: 'home',
						result: 'ADVANCE',
						consequence:
							'The agent pulls. It takes a long time before anything happens up there, and then it happens kindly.'
					},
					{
						label: 'Wallcrack',
						to: 'dead_crack',
						result: 'ADVANCE',
						consequence: 'The crack is exactly wide enough. For the way in.'
					},
					{
						label: 'Portcullis',
						to: 'dead_portcullis',
						result: 'ADVANCE',
						consequence: 'Half open is the half that counts. The other half is the half that falls.'
					}
				]
			},
			{
				key: 'dead_amber',
				template: 'Cave',
				kind: 'LOCATION',
				title: 'The Hoard',
				body: 'The dragon does not count its gold. It weighs it. Fourteen grams were missing, and shortly afterwards an agent was missing.',
				endingType: 'FAILURE',
				x: 380,
				y: 1200,
				biome: 'berge',
				sigil: '💎',
				region: 'ridge',
				attributes: ['dark', 'cursed'],
				choices: []
			},

			/* ─────────────────────────── Home · snow · y 1500 */
			{
				key: 'dead_crack',
				template: 'Wall',
				kind: 'LOCATION',
				title: 'The Crack',
				body: 'It got in. It did not get out. The wall has had a decoration ever since that nobody likes to talk about.',
				endingType: 'FAILURE',
				x: -330,
				y: 1500,
				biome: 'schnee',
				sigil: '🧱',
				region: 'homeland',
				attributes: ['old', 'small'],
				choices: []
			},
			{
				key: 'home',
				template: 'Village',
				kind: 'LOCATION',
				title: 'Home',
				body: 'Somebody opens the door, looks down, sees a wooden agent with other people’s notes in its chest and says: there you are. Five steps. It was never five steps.',
				endingType: 'SUCCESS',
				x: 0,
				y: 1500,
				biome: 'schnee',
				sigil: '🏡',
				region: 'homeland',
				attributes: ['bright', 'small'],
				choices: []
			},
			{
				key: 'dead_portcullis',
				template: 'Castle',
				kind: 'LOCATION',
				title: 'The Portcullis',
				body: 'It is called a portcullis. It has never claimed to be anything else.',
				endingType: 'FAILURE',
				x: 330,
				y: 1500,
				biome: 'schnee',
				sigil: '⛓️',
				region: 'homeland',
				attributes: ['old', 'dangerous'],
				choices: []
			}
		]
	}
};
