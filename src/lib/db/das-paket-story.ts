import type { StorySeed } from './homeward-story.ts';

/**
 * DAS PAKET — a small story where every place has something to say.
 *
 * DIE MITTERNACHTSPFORTE proved the graph could do everything a tree could not,
 * and it is forty-nine nodes of it. A run touches ten of those, so most of what
 * is written there is never heard by anybody. This one is thirty nodes at the
 * same par, and the difference is spent on the nodes a player actually lands on:
 *
 *  - **Every place says what it is.** `body` is read out on arrival now, ahead of
 *    the question, so a place is a moment rather than a name and a fork.
 *  - **Every road answers back.** `consequence` was written into every seeded
 *    story from the start and never left the server. It is the beat after the
 *    agent commits and before it finds out — which is exactly where a trap goes.
 *    Fatal roads have one too: the plank gives way, and *then* the epitaph.
 *  - **Every grave is a joke.** Epitaphs are read out, so they are the payoff
 *    rather than a line in a table nobody opens.
 *
 * Two rules govern every label, in any language, because the agent matches a
 * player's twenty handwritten characters against them:
 *   1. No two roads out of one place may share a significant word.
 *   2. One short, plain noun. Twenty characters have to hold a name and something
 *      to say about it.
 *
 * Labels are also kept clear of the words the offline brain reads as judgements —
 * `weg`, `heim`, `sicher`, `gut`, `falle`, `tod` and the rest of `vocabulary.ts`
 * — so that a road is never accidentally arguing for or against itself. Which is
 * why the mountain road is a `Karrenspur` and not a `Karrenweg`.
 *
 * The shapes the engine checks for are all here: three roads into the Waldrand,
 * two into the Steg, two into das Aschfeld; three survivable wrong turns
 * (`SETBACK`) at the Ziege, the Förster and the Firnfeld, each of which doubles
 * back and so makes a walkable cycle; all four node kinds; and an ending that is
 * neither death nor home, because a delivery can be completed to nobody.
 *
 * ---
 *
 * **The land, and why the numbers look the way they do.**
 *
 * Six regions walked in order — Vorland, Schwarzholz, Seenland, Aschfeld, Grat,
 * Firn — each with its own biome. Without `biome` the Aschfeld might be drawn as
 * forest, because the terrain generator knows where a node is and not what it is,
 * and a story cannot be authored *into* the right landscape: the terrain seed is
 * hashed from node row ids, which change on every re-seed.
 *
 * The generator works in sections of `SECTION_W` = 192 units, and a place claims
 * the section it stands in. So two places of different biomes must never stand in
 * the same section, or one of them loses and is drawn on the other's ground. That
 * is why the steps inside a region are the usual 150 and the steps *between*
 * regions are 225–240: a region has to clear a section boundary outright, with
 * room for the ±55 that `meander` displaces every place by. Every grave takes the
 * biome of the row it is drawn in rather than the region of the place that killed
 * it, for the same reason — which is also the truth of it, since you die on the
 * road out of one land and into the next.
 *
 * `region` is for the author and the designer's arranger; the game never reads it.
 */

export const DAS_PAKET: StorySeed = {
	slug: 'das-paket',
	name: 'DAS PAKET',
	description: 'Ein Paket, sechs Landschaften und eine Poststelle, die um sechs schließt.',
	startKey: 'packhof',
	nodes: [
		/* ───────────────────────── das Vorland · Wiese · y 0–300 */
		{
			key: 'packhof',
			template: 'Crossroads',
			kind: 'LOCATION',
			title: 'Der Packhof',
			body: 'Ein Paket, kein Absender, und auf dem Zettel steht nur: bis sechs. Drei Fährten führen aus dem Hof.',
			endingType: null,
			x: 0,
			y: 0,
			biome: 'wiese',
			sigil: '📦',
			region: 'vorland',
			attributes: ['old', 'abandoned'],
			choices: [
				{
					label: 'Kuhweide',
					to: 'weide',
					result: 'ADVANCE',
					consequence:
						'Es klettert über den Tritt. Der Tritt macht ein Geräusch, das Kühe interessant finden.'
				},
				{
					label: 'Hohlgasse',
					to: 'traenke',
					result: 'ADVANCE',
					consequence:
						'Die Gasse ist so schmal, dass das Paket vorangeht und der Agent hinterherkommt.'
				},
				{
					label: 'Bahndamm',
					to: 'tod_bahndamm',
					result: 'ADVANCE',
					consequence: 'Der Schotter knirscht so laut, dass es das Läuten überhört.'
				}
			]
		},
		{
			key: 'weide',
			template: 'Valley',
			kind: 'LOCATION',
			title: 'Die Kuhweide',
			body: 'Vierzig Kühe drehen gleichzeitig den Kopf. Am Übergang steht eine Ziege, die nicht dazugehört.',
			endingType: null,
			x: -220,
			y: 150,
			biome: 'wiese',
			sigil: '🐄',
			region: 'vorland',
			attributes: ['wide', 'bright'],
			choices: [
				{
					label: 'Zollziege',
					to: 'ziege',
					result: 'ADVANCE',
					consequence: 'Die Ziege sieht das Paket. Die Ziege sieht ab jetzt nur noch das Paket.'
				},
				{
					label: 'Weidezaun',
					to: 'tod_zaun',
					result: 'ADVANCE',
					consequence: 'Der Draht summt. Ein Summen ist eine Auskunft, und es hört nicht zu.'
				},
				{
					label: 'Tränke',
					to: 'traenke',
					result: 'DETOUR',
					consequence: 'Es geht quer über die Weide. Vierzig Köpfe drehen sich mit.'
				}
			]
		},
		{
			key: 'tod_bahndamm',
			template: 'Road',
			kind: 'LOCATION',
			title: 'Der Bahndamm',
			body: 'Der Zug hielt nicht an, weil er nicht musste. Das Paket kam übrigens an. Vier Tage später und in achtzehn Umschlägen.',
			endingType: 'FAILURE',
			x: 300,
			y: 150,
			biome: 'wiese',
			sigil: '🚂',
			region: 'vorland',
			attributes: ['dangerous', 'old'],
			choices: []
		},
		{
			key: 'ziege',
			template: 'Merchant',
			kind: 'CREATURE',
			title: 'Die Zollziege',
			body: 'Sie steht mitten auf dem Übergang, kaut und rührt sich nicht. Zoll ist Zoll, sagt ihr Blick.',
			endingType: null,
			x: -260,
			y: 300,
			biome: 'wiese',
			sigil: '🐐',
			region: 'vorland',
			attributes: ['old', 'noble', 'friendly'],
			choices: [
				{
					label: 'Zoll',
					to: 'waldrand',
					result: 'ADVANCE',
					consequence: 'Es gibt die Schnur her. Die Ziege prüft sie gründlich und lässt durch.'
				},
				{
					label: 'Kitzeln',
					to: 'tod_kitzeln',
					result: 'ADVANCE',
					consequence: 'Eine Ziege am Kinn zu kitzeln ist ein Plan. Es ist nur nicht ihr Plan.'
				},
				{
					label: 'Umkehren',
					to: 'packhof',
					result: 'SETBACK',
					consequence:
						'Es geht denselben Hang zurück, und die Ziege sieht ihm nach wie einem Versprechen.'
				}
			]
		},
		{
			key: 'traenke',
			template: null,
			kind: 'OBJECT',
			title: 'Die Tränke',
			body: 'Ein steinerner Trog, halb voll, mit einem Blechbecher am Rand. Jemand hat ihn hier gelassen, für jemanden.',
			endingType: null,
			x: 240,
			y: 300,
			biome: 'wiese',
			sigil: '💧',
			region: 'vorland',
			attributes: ['old', 'abandoned'],
			choices: [
				{
					label: 'Schöpfen',
					to: 'waldrand',
					result: 'ADVANCE',
					consequence:
						'Es trinkt einen Becher, stellt ihn zurück und dreht den Griff nach außen, für den Nächsten.'
				},
				{
					label: 'Ausschütten',
					to: 'tod_ausschuetten',
					result: 'ADVANCE',
					consequence: 'Es kippt den Trog. Unter dem Wasser war nie Boden, sondern ein Schacht.'
				}
			]
		},
		{
			key: 'tod_zaun',
			template: 'Wall',
			kind: 'LOCATION',
			title: 'Der Weidezaun',
			body: 'Es hielt den Draht mit beiden Händen fest, damit er nicht wackelte. Es hielt ihn dann noch eine ganze Weile.',
			endingType: 'FAILURE',
			x: -560,
			y: 300,
			biome: 'wiese',
			sigil: '⚡',
			region: 'vorland',
			attributes: ['dangerous'],
			choices: []
		},

		/* ────────────────────── das Schwarzholz · Wald · y 450–600 */
		{
			key: 'waldrand',
			template: 'Forest',
			kind: 'LOCATION',
			title: 'Der Waldrand',
			body: 'Alle Fährten des Vorlands enden hier an derselben Baumreihe. Dahinter wird es zehn Grad kühler.',
			endingType: null,
			x: 0,
			y: 450,
			biome: 'wald',
			sigil: '🌲',
			region: 'schwarzholz',
			attributes: ['dense', 'dark', 'large'],
			choices: [
				{
					label: 'Försterei',
					to: 'foerster',
					result: 'ADVANCE',
					consequence:
						'Ein getretener Pfad, alle zwanzig Schritte ein Schild. Die Schilder verbieten verschiedene Dinge.'
				},
				{
					label: 'Pilzstelle',
					to: 'pilze',
					result: 'ADVANCE',
					consequence: 'Der Boden federt. Es riecht nach Keller, und der Keller riecht zurück.'
				},
				{
					label: 'Dickung',
					to: 'tod_dickung',
					result: 'ADVANCE',
					consequence: 'Die ersten zehn Schritte sind eng. Die nächsten zehn sind enger.'
				}
			]
		},
		{
			key: 'tod_kitzeln',
			template: 'Merchant',
			kind: 'CREATURE',
			title: 'Die beleidigte Ziege',
			body: 'Sie nahm den Zoll dann selbst, bis zur Baumreihe und dort noch einmal. Sie nahm den Zoll, das Paket, den Hut und eine grundsätzliche Entscheidung.',
			endingType: 'FAILURE',
			x: -540,
			y: 450,
			biome: 'wald',
			sigil: '🐐',
			region: 'schwarzholz',
			attributes: ['dangerous', 'old'],
			choices: []
		},
		{
			key: 'tod_ausschuetten',
			template: 'Well',
			kind: 'LOCATION',
			title: 'Der Schacht',
			body: 'Der Trog war der Deckel. Das ist die Art von Sache, die man genau einmal herausfindet.',
			endingType: 'FAILURE',
			x: 520,
			y: 450,
			biome: 'wald',
			sigil: '🪣',
			region: 'schwarzholz',
			attributes: ['deep', 'dark'],
			choices: []
		},
		{
			key: 'foerster',
			template: 'Stranger',
			kind: 'CREATURE',
			title: 'Der Förster',
			body: 'Er sieht das Paket, bevor er den Agenten sieht. Er hat ein Formular dabei, und er hatte es schon vorher dabei.',
			endingType: null,
			x: -240,
			y: 600,
			biome: 'wald',
			sigil: '🪓',
			region: 'schwarzholz',
			attributes: ['old', 'noble'],
			choices: [
				{
					label: 'Formular',
					to: 'steg',
					result: 'ADVANCE',
					consequence:
						'Es füllt alle vier Seiten aus. Der Förster faltet sie, nickt und zeigt hinunter zum See.'
				},
				{
					label: 'Schweigen',
					to: 'tod_saegewerk',
					result: 'ADVANCE',
					consequence: 'Wer nichts sagt, wird eingeordnet. Der Förster ordnet es unter Holz ein.'
				},
				{
					label: 'Fliehen',
					to: 'waldrand',
					result: 'SETBACK',
					consequence:
						'Es rennt, bis der Wald aufhört, und der Wald hört genau dort auf, wo es hergekommen ist.'
				}
			]
		},
		{
			key: 'pilze',
			template: null,
			kind: 'OBJECT',
			title: 'Die Pilzstelle',
			body: 'Ein Ring aus Hüten, groß wie Teller, in einem sehr ordentlichen Kreis. Ordentlich ist hier das Beunruhigende.',
			endingType: null,
			x: 240,
			y: 600,
			biome: 'wald',
			sigil: '🍄',
			region: 'schwarzholz',
			attributes: ['cursed', 'old'],
			choices: [
				{
					label: 'Stehenlassen',
					to: 'steg',
					result: 'ADVANCE',
					consequence:
						'Es geht außen herum, mit dem Paket auf der abgewandten Seite. Der Kreis bleibt ein Kreis.'
				},
				{
					label: 'Kosten',
					to: 'tod_kosten',
					result: 'ADVANCE',
					consequence: 'Der erste Bissen schmeckt nach Nuss. Der zweite schmeckt nach Musik.'
				}
			]
		},
		{
			key: 'tod_dickung',
			template: 'Forest',
			kind: 'LOCATION',
			title: 'Die Dickung',
			body: 'Vorwärts ging noch. Rückwärts ging nicht mehr. Dazwischen liegen ungefähr drei Stunden.',
			endingType: 'FAILURE',
			x: 560,
			y: 600,
			biome: 'wald',
			sigil: '🌳',
			region: 'schwarzholz',
			attributes: ['dense', 'dark'],
			choices: []
		},

		/* ─────────────────── das Seenland · Seenland · y 825–975 */
		{
			key: 'steg',
			template: 'Crossing',
			kind: 'LOCATION',
			title: 'Der Bootssteg',
			body: 'Der See liegt still und ist deutlich breiter als von oben. Am Steg hängt ein Fahrplan von letztem Jahr.',
			endingType: null,
			x: 0,
			y: 825,
			biome: 'seenland',
			sigil: '⛵',
			region: 'seenland',
			attributes: ['wide', 'bright'],
			choices: [
				{
					label: 'Fähre',
					to: 'faehre',
					result: 'ADVANCE',
					consequence: 'Es stellt sich an. Vor ihm stehen vier Leute, hinter ihm sofort sieben.'
				},
				{
					label: 'Ruderboot',
					to: 'tod_ruderboot',
					result: 'ADVANCE',
					consequence:
						'Ein Ruder liegt darin. Das zweite lag darin, bis jemand eine Entscheidung getroffen hat.'
				},
				{
					label: 'Watstelle',
					to: 'watstelle',
					result: 'ADVANCE',
					consequence: 'Es geht dem Ufer nach, bis das Schilf aufhört und Kies anfängt.'
				}
			]
		},
		{
			key: 'tod_saegewerk',
			template: 'Mill',
			kind: 'LOCATION',
			title: 'Das Sägewerk am See',
			body: 'Es wurde ordnungsgemäß erfasst, gestapelt und trocken gelagert. Auf dem Zettel stand: bis sechs.',
			endingType: 'FAILURE',
			x: -560,
			y: 825,
			biome: 'seenland',
			sigil: '🪵',
			region: 'seenland',
			attributes: ['old', 'dangerous'],
			choices: []
		},
		{
			key: 'tod_kosten',
			template: null,
			kind: 'OBJECT',
			title: 'Der dritte Bissen',
			body: 'Es sang zwei Stunden lang mit dem Schilf. Das Schilf war höflich und sang bis zum Schluss mit.',
			endingType: 'FAILURE',
			x: 540,
			y: 825,
			biome: 'seenland',
			sigil: '🍄',
			region: 'seenland',
			attributes: ['cursed'],
			choices: []
		},
		{
			key: 'faehre',
			template: null,
			kind: 'EVENT',
			title: 'Die Fähre',
			body: 'Sie kommt, sie ist voll, und der Kapitän zählt langsam. Am Steg wird gedrängelt, wie immer.',
			endingType: null,
			x: -240,
			y: 975,
			biome: 'seenland',
			sigil: '🚢',
			region: 'seenland',
			attributes: ['sudden'],
			choices: [
				{
					label: 'Warten',
					to: 'aschfeld',
					result: 'ADVANCE',
					consequence:
						'Es lässt zwei Fahrten vorbei und darf beim dritten Mal ganz hinten stehen, mit dem Paket auf den Knien.'
				},
				{
					label: 'Vordrängeln',
					to: 'tod_vordraengeln',
					result: 'ADVANCE',
					consequence:
						'Es schiebt sich an vier Leuten vorbei. Vier Leute fassen daraufhin einen gemeinsamen Beschluss.'
				}
			]
		},
		{
			key: 'watstelle',
			template: 'River',
			kind: 'LOCATION',
			title: 'Die Watstelle',
			body: 'Hier ist der See nur hüfttief, sagt ein Pfahl. Der Pfahl steht schief und wirkt schlecht informiert.',
			endingType: null,
			x: 240,
			y: 975,
			biome: 'seenland',
			sigil: '🥾',
			region: 'seenland',
			attributes: ['deep', 'dangerous'],
			choices: [
				{
					label: 'Waten',
					to: 'aschfeld',
					result: 'ADVANCE',
					consequence:
						'Es hält das Paket über den Kopf und geht los. Das Paket bleibt trocken, alles andere nicht.'
				},
				{
					label: 'Barfuss',
					to: 'tod_barfuss',
					result: 'ADVANCE',
					consequence:
						'Es bindet die Schuhe zusammen und hängt sie sich um den Hals. Der Grund hier ist scharf.'
				}
			]
		},
		{
			key: 'tod_ruderboot',
			template: 'Boat',
			kind: 'OBJECT',
			title: 'Das Ruderboot',
			body: 'Mit einem Ruder fährt man Kreise. Es fuhr sehr saubere Kreise, bis zum Morgen, immer am selben Steg vorbei.',
			endingType: 'FAILURE',
			x: 580,
			y: 975,
			biome: 'seenland',
			sigil: '🚣',
			region: 'seenland',
			attributes: ['abandoned', 'old'],
			choices: []
		},
		{
			key: 'tod_vordraengeln',
			template: 'Lake',
			kind: 'LOCATION',
			title: 'Der Platz an der Reling',
			body: 'Es bekam den Platz ganz vorne. Ganz vorne ist auf einer Fähre der Platz mit dem wenigsten Geländer.',
			endingType: 'FAILURE',
			x: -580,
			y: 975,
			biome: 'seenland',
			sigil: '🌊',
			region: 'seenland',
			attributes: ['deep'],
			choices: []
		},
		{
			key: 'tod_barfuss',
			template: 'Crossing',
			kind: 'LOCATION',
			title: 'Die Muschelbank',
			body: 'Der Pfahl hatte recht mit der Tiefe. Über den Grund hatte der Pfahl nie etwas behauptet.',
			endingType: 'FAILURE',
			x: 820,
			y: 975,
			biome: 'seenland',
			sigil: '🦶',
			region: 'seenland',
			attributes: ['dangerous'],
			choices: []
		},

		/* ────────────────────── das Aschfeld · Wüste · y 1215–1365 */
		{
			key: 'aschfeld',
			template: 'Hollow',
			kind: 'LOCATION',
			title: 'Das Aschfeld',
			body: 'Hier war einmal derselbe See. Jetzt ist hier Staub, ein umgestürzter Steg und sehr viel Aussicht.',
			endingType: null,
			x: 0,
			y: 1215,
			biome: 'wueste',
			sigil: '🏜️',
			region: 'aschfeld',
			attributes: ['wide', 'abandoned', 'bright'],
			choices: [
				{
					label: 'Karrenspur',
					to: 'karrenspur',
					result: 'ADVANCE',
					consequence:
						'Zwei Rillen im Staub, kilometerweit gerade. Wer sie gefahren hat, wusste, wohin.'
				},
				{
					label: 'Salzpfanne',
					to: 'tod_salzpfanne',
					result: 'ADVANCE',
					consequence: 'Die Kruste trägt. Die Kruste trägt wirklich beeindruckend lange.'
				},
				{
					label: 'Luftspiegelung',
					to: 'luftspiegelung',
					result: 'DETOUR',
					consequence: 'Da vorne steht ein Schalter, mit Fenster, mit Klingel. Es geht schneller.'
				}
			]
		},
		{
			key: 'tod_salzpfanne',
			template: 'Hollow',
			kind: 'LOCATION',
			title: 'Die Salzpfanne',
			body: 'Sie trug ihn bis fast ganz hinüber. Fast ganz hinüber ist auf einer Salzpfanne die schlechteste Stelle.',
			endingType: 'FAILURE',
			x: -460,
			y: 1365,
			biome: 'wueste',
			sigil: '🧂',
			region: 'aschfeld',
			attributes: ['wide', 'dangerous'],
			choices: []
		},
		{
			key: 'luftspiegelung',
			template: 'Village',
			kind: 'LOCATION',
			title: 'Die Luftspiegelung',
			body: 'Der Schalter war da. Das Fenster war da, die Klingel war da, und es hat geklingelt. Aufgemacht hat die Hitze. Das Paket liegt jetzt korrekt zugestellt im Staub, an einem Ort, den es nicht gibt.',
			endingType: 'NEUTRAL',
			x: 380,
			y: 1365,
			biome: 'wueste',
			sigil: '🌅',
			region: 'aschfeld',
			attributes: ['bright', 'cursed'],
			choices: []
		},

		/* ──────────────────────── der Grat · Berge · y 1600–1750 */
		{
			key: 'karrenspur',
			template: 'Road',
			kind: 'LOCATION',
			title: 'Die Karrenspur',
			body: 'Die Rillen steigen an und werden steiler, als sie aussahen. Oben hängt eine Wolke an einem Sattel.',
			endingType: null,
			x: 0,
			y: 1600,
			biome: 'berge',
			sigil: '🛤️',
			region: 'grat',
			attributes: ['high', 'old'],
			choices: [
				{
					label: 'Passhöhe',
					to: 'passhoehe',
					result: 'ADVANCE',
					consequence:
						'Es geht die Kehren aus, eine nach der anderen, und zählt sie nicht mehr mit.'
				},
				{
					label: 'Geröllhalde',
					to: 'tod_geroell',
					result: 'ADVANCE',
					consequence: 'Der erste Stein rollt los. Es entschuldigt sich beim ersten Stein.'
				}
			]
		},
		{
			key: 'tod_geroell',
			template: 'Valley',
			kind: 'LOCATION',
			title: 'Die Geröllhalde',
			body: 'Es kam sehr schnell hinunter, in guter Gesellschaft, und ganz oben liegt jetzt eine hübsche neue Rinne.',
			endingType: 'FAILURE',
			x: -440,
			y: 1600,
			biome: 'berge',
			sigil: '🪨',
			region: 'grat',
			attributes: ['high', 'dangerous'],
			choices: []
		},
		{
			key: 'passhoehe',
			template: 'Mountain',
			kind: 'LOCATION',
			title: 'Die Passhöhe',
			body: 'Ein Sattel, ein Steinkreuz, viel Wind. Auf der anderen Seite liegt Schnee, und dahinter liegt ein Dach.',
			endingType: null,
			x: 0,
			y: 1750,
			biome: 'berge',
			sigil: '🏔️',
			region: 'grat',
			attributes: ['high', 'wide'],
			choices: [
				{
					label: 'Firnfeld',
					to: 'firnfeld',
					result: 'ADVANCE',
					consequence:
						'Es tritt in eine fremde Spur, die genau dorthin führt, wo es hin will. Eine Spur ist ein Geschenk.'
				},
				{
					label: 'Abkürzung',
					to: 'tod_abkuerzung',
					result: 'ADVANCE',
					consequence:
						'Von hier oben sieht die Rinne aus wie die halbe Zeit. Von hier oben sieht man auch keinen Schnee von unten.'
				}
			]
		},
		{
			key: 'tod_abkuerzung',
			template: 'Pit',
			kind: 'LOCATION',
			title: 'Die Abkürzung',
			body: 'Die Rinne war die halbe Zeit. Sie war auch die halbe Strecke, und die andere Hälfte war senkrecht.',
			endingType: 'FAILURE',
			x: 440,
			y: 1750,
			biome: 'berge',
			sigil: '🧊',
			region: 'grat',
			attributes: ['deep', 'high'],
			choices: []
		},

		/* ──────────────────────── der Firn · Schnee · y 1975–2125 */
		{
			key: 'firnfeld',
			template: 'Mountain',
			kind: 'LOCATION',
			title: 'Das Firnfeld',
			body: 'Weiß, still und leicht abschüssig. Ein Schild bittet um Ruhe, in vier Sprachen und mit einem Ausrufezeichen.',
			endingType: null,
			x: 0,
			y: 1975,
			biome: 'schnee',
			sigil: '❄️',
			region: 'firn',
			attributes: ['bright', 'high', 'dangerous'],
			choices: [
				{
					label: 'Trittspur',
					to: 'poststelle',
					result: 'ADVANCE',
					consequence:
						'Es geht leise, Tritt für Tritt, und hält das Paket wie etwas, das schlafen könnte.'
				},
				{
					label: 'Jodeln',
					to: 'tod_lawine',
					result: 'ADVANCE',
					consequence: 'Der erste Ton ist wirklich schön. Der Berg findet das auch und antwortet.'
				},
				{
					label: 'Umkehren',
					to: 'passhoehe',
					result: 'SETBACK',
					consequence:
						'Es steigt die eigene Spur wieder hinauf, im Wind, und kommt oben mit weniger Zeit an.'
				}
			]
		},
		{
			key: 'tod_lawine',
			template: 'Mountain',
			kind: 'LOCATION',
			title: 'Das Echo',
			body: 'Der Berg antwortete vollständig und mit großer Beteiligung. Das Paket wurde im Frühling gefunden, geöffnet, und war ein Schal.',
			endingType: 'FAILURE',
			x: -440,
			y: 1975,
			biome: 'schnee',
			sigil: '🏔️',
			region: 'firn',
			attributes: ['dangerous', 'high'],
			choices: []
		},
		{
			key: 'poststelle',
			template: 'Gate',
			kind: 'LOCATION',
			title: 'Die Poststelle',
			body: 'Ein Fenster, eine Klingel, und drinnen jemand, der auf die Uhr sieht und dann doch aufsteht. Es ist drei Minuten vor sechs, und das Paket ist da.',
			endingType: 'SUCCESS',
			x: 0,
			y: 2125,
			biome: 'schnee',
			sigil: '📮',
			region: 'firn',
			attributes: ['bright', 'small'],
			choices: []
		}
	]
};
