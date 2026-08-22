import type { StorySeed } from './homeward-story.ts';

/**
 * DIE MITTERNACHTSPFORTE — the story written to use everything the graph can do.
 *
 * THE LONG WAY HOME is eight levels of three, one road onward and two graves. It
 * was the shape the prototype could express, and it is a fine first tale. This
 * one is what the story graph was widened *for*:
 *
 *  - **Roads that rejoin.** Moor, Wald and Brücke are three different opening
 *    journeys that all come out at the Kreuzung. A note about the far half of
 *    the land is worth writing whichever way an agent went in.
 *  - **Wrong turns you survive.** Fleeing the Wolf, turning back from the
 *    Fährmann, climbing down from the Zinne and retreating from the Garten all
 *    cost ground without killing. Marked SETBACK so the telling says so.
 *  - **Places you can get stuck in.** Each of those doubles back, so an agent
 *    with contradictory notes can walk Wald → Wolf → Wald until the light goes.
 *    That ending is `wandered`, and it does not blame the road it was on.
 *  - **Creatures, objects and events**, not just places. The Wolf, the Fährmann
 *    and the Irrlicht want something; the Seil, the Boot and der Schlüssel are
 *    things you pick up; die Rast and die Dämmerung are things that happen.
 *  - **An ending that is neither death nor home.** Wait at the Pforte and the
 *    dawn simply arrives. Nothing killed the agent. It just did not get in.
 *
 * Two rules govern every label, in any language, because the agent matches a
 * player's twenty handwritten characters against them:
 *   1. No two roads out of one place may share a significant word.
 *   2. Prefer one short, plain noun. Twenty characters have to hold a name and
 *      something to say about it.
 *
 * Labels are also kept clear of the words the offline brain reads as judgements
 * — `weg`, `heim`, `sicher`, `gut`, `böse` and the rest of `vocabulary.ts` — so
 * that a road is never accidentally arguing for or against itself.
 */

export const MITTERNACHT: StorySeed = {
	slug: 'mitternachtspforte',
	name: 'DIE MITTERNACHTSPFORTE',
	description: 'Ein Land voller Leben, und eine Pforte, die im Morgengrauen schließt.',
	startKey: 'grenzstein',
	nodes: [
		/* ─────────────────────────────────────────── der Anfang */
		{
			key: 'grenzstein',
			template: 'Crossroads',
			kind: 'LOCATION',
			title: 'Der Grenzstein',
			body: 'Hier endet, was dein Agent kennt. Drei Fährten führen in die Nacht hinaus, und keine ist beschriftet.',
			endingType: null,
			x: 0,
			y: 0,
			attributes: ['old'],
			choices: [
				{ label: 'Moor', to: 'moor', result: 'ADVANCE', consequence: '' },
				{ label: 'Wald', to: 'wald', result: 'ADVANCE', consequence: '' },
				{ label: 'Brücke', to: 'bruecke', result: 'ADVANCE', consequence: '' }
			]
		},

		/* ─────────────────────────────── drei Anfänge, ein Ende */
		{
			key: 'moor',
			template: 'Hollow',
			kind: 'LOCATION',
			title: 'Das Moor',
			body: 'Der Boden gibt nach und gibt nach und trägt dann doch. Etwas Blasses schwebt zwischen den Binsen.',
			endingType: null,
			x: 0,
			y: 150,
			attributes: ['dark', 'dangerous'],
			choices: [
				{ label: 'Irrlicht', to: 'irrlicht', result: 'ADVANCE', consequence: '' },
				{ label: 'Pfad', to: 'pfad', result: 'ADVANCE', consequence: '' },
				{ label: 'Sumpf', to: 'tod_sumpf', result: 'ADVANCE', consequence: '' }
			]
		},
		{
			key: 'wald',
			template: 'Forest',
			kind: 'LOCATION',
			title: 'Der Schwarzholzwald',
			body: 'Die Stämme stehen so dicht, dass die Nacht darin noch dunkler ist. Etwas atmet mit ihm im Takt.',
			endingType: null,
			x: -200,
			y: 150,
			attributes: ['dark', 'dense', 'large'],
			choices: [
				{ label: 'Wolf', to: 'wolf', result: 'ADVANCE', consequence: '' },
				{ label: 'Lichtung', to: 'lichtung', result: 'ADVANCE', consequence: '' },
				{ label: 'Dornen', to: 'tod_dornen', result: 'ADVANCE', consequence: '' }
			]
		},
		{
			key: 'bruecke',
			template: 'Bridge',
			kind: 'LOCATION',
			title: 'Die alte Brücke',
			body: 'Zwei Bohlen fehlen. Am anderen Ende steht jemand, der schon lange dort steht.',
			endingType: null,
			x: 200,
			y: 150,
			attributes: ['old', 'abandoned'],
			choices: [
				{ label: 'Fährmann', to: 'faehrmann', result: 'ADVANCE', consequence: '' },
				{ label: 'Ufer', to: 'ufer', result: 'ADVANCE', consequence: '' },
				{ label: 'Sprung', to: 'tod_sprung', result: 'ADVANCE', consequence: '' }
			]
		},

		/* ────────────────────────────────── was dort lebt */
		{
			key: 'irrlicht',
			template: 'Fairy',
			kind: 'CREATURE',
			title: 'Das Irrlicht',
			body: 'Es tanzt einen Schritt vor ihm her und wartet jedes Mal, bis es ihm nachkommt.',
			endingType: null,
			x: 0,
			y: 300,
			attributes: ['cursed', 'small'],
			choices: [
				{ label: 'Folgen', to: 'tod_folgen', result: 'ADVANCE', consequence: '' },
				{ label: 'Abwenden', to: 'pfad', result: 'DETOUR', consequence: '' }
			]
		},
		{
			key: 'wolf',
			template: 'Wolf',
			kind: 'CREATURE',
			title: 'Der hungrige Wolf',
			body: 'Er ist mager und alt und stellt sich ihm in den Rücken, nicht in den Rachen.',
			endingType: null,
			x: -200,
			y: 300,
			attributes: ['dangerous', 'wounded', 'old'],
			choices: [
				{ label: 'Füttern', to: 'lichtung', result: 'ADVANCE', consequence: '' },
				{ label: 'Kämpfen', to: 'tod_kampf', result: 'ADVANCE', consequence: '' },
				{ label: 'Fliehen', to: 'wald', result: 'SETBACK', consequence: '' }
			]
		},
		{
			key: 'faehrmann',
			template: 'Ferryman',
			kind: 'CREATURE',
			title: 'Der Fährmann',
			body: 'Er hält die Hand auf. Er sagt nicht, was hineingehört, und er hat alle Zeit der Nacht.',
			endingType: null,
			x: 200,
			y: 300,
			attributes: ['old', 'noble'],
			choices: [
				{ label: 'Bezahlen', to: 'ufer', result: 'ADVANCE', consequence: '' },
				{ label: 'Schweigen', to: 'tod_schweigen', result: 'ADVANCE', consequence: '' },
				{ label: 'Umkehren', to: 'bruecke', result: 'SETBACK', consequence: '' }
			]
		},

		/* ──────────────────────── drei Wege, die zusammenlaufen */
		{
			key: 'pfad',
			template: 'Road',
			kind: 'LOCATION',
			title: 'Der schmale Pfad',
			body: 'Kaum breiter als ein Fuß, aber jemand hat ihn getreten, und wer ihn trat, ging irgendwohin.',
			endingType: null,
			x: -400,
			y: 300,
			attributes: ['small'],
			choices: [
				{ label: 'Kreuzung', to: 'kreuzung', result: 'ADVANCE', consequence: '' },
				{ label: 'Nebel', to: 'tod_nebel', result: 'ADVANCE', consequence: '' },
				{ label: 'Rast', to: 'rast', result: 'DETOUR', consequence: '' }
			]
		},
		{
			key: 'lichtung',
			template: 'Hollow',
			kind: 'LOCATION',
			title: 'Die Lichtung',
			body: 'Ein Loch im Wald, voller Sterne. In der Mitte liegt Holz, aufgeschichtet von jemandem.',
			endingType: null,
			x: 400,
			y: 300,
			attributes: ['bright'],
			choices: [
				{ label: 'Kreuzung', to: 'kreuzung', result: 'ADVANCE', consequence: '' },
				{ label: 'Feuer', to: 'lagerfeuer', result: 'DETOUR', consequence: '' },
				{ label: 'Grube', to: 'tod_grube', result: 'ADVANCE', consequence: '' }
			]
		},
		{
			key: 'ufer',
			template: 'Crossing',
			kind: 'LOCATION',
			title: 'Das andere Ufer',
			body: 'Nasser Kies, und dahinter Land. Ein Boot liegt halb im Wasser, angebunden an nichts.',
			endingType: null,
			x: -600,
			y: 300,
			attributes: ['wide'],
			choices: [
				{ label: 'Kreuzung', to: 'kreuzung', result: 'ADVANCE', consequence: '' },
				{ label: 'Strudel', to: 'tod_strudel', result: 'ADVANCE', consequence: '' },
				{ label: 'Boot', to: 'boot', result: 'DETOUR', consequence: '' }
			]
		},

		/* ─────────────────────────────── was man aufheben kann */
		{
			key: 'lagerfeuer',
			template: 'Campfire',
			kind: 'OBJECT',
			title: 'Das Lagerfeuer',
			body: 'Noch warm. Wer es geschichtet hat, ist nicht weit, oder ist nicht mehr.',
			endingType: null,
			x: 0,
			y: 450,
			attributes: ['bright'],
			choices: [
				{ label: 'Wärmen', to: 'kreuzung', result: 'ADVANCE', consequence: '' },
				{ label: 'Löschen', to: 'tod_kalt', result: 'ADVANCE', consequence: '' }
			]
		},
		{
			key: 'boot',
			template: 'Boat',
			kind: 'OBJECT',
			title: 'Das Boot',
			body: 'Ein Ruder liegt darin. Das zweite fehlt, und das ist eine Entscheidung, die schon getroffen wurde.',
			endingType: null,
			x: -200,
			y: 450,
			attributes: ['abandoned', 'old'],
			choices: [
				{ label: 'Rudern', to: 'kreuzung', result: 'ADVANCE', consequence: '' },
				{ label: 'Treiben', to: 'tod_treiben', result: 'ADVANCE', consequence: '' }
			]
		},
		{
			key: 'rast',
			template: 'Nightfall',
			kind: 'EVENT',
			title: 'Die Rast',
			body: 'Die Beine werden schwer. Es wäre so leicht, sich einen Augenblick hinzusetzen.',
			endingType: null,
			x: 200,
			y: 450,
			attributes: ['sudden'],
			choices: [
				{ label: 'Weiter', to: 'kreuzung', result: 'ADVANCE', consequence: '' },
				{ label: 'Schlafen', to: 'tod_schlaf', result: 'ADVANCE', consequence: '' }
			]
		},

		/* ──────────────────────────── wo alles zusammenkommt */
		{
			key: 'kreuzung',
			template: 'Crossroads',
			kind: 'LOCATION',
			title: 'Die Kreuzung der Nacht',
			body: 'Alle Fährten des Landes laufen hier zusammen und teilen sich sofort wieder. Am Himmel steht ein Turm.',
			endingType: null,
			x: -400,
			y: 450,
			attributes: ['old'],
			choices: [
				{ label: 'Turm', to: 'turm', result: 'ADVANCE', consequence: '' },
				{ label: 'Dorf', to: 'dorf', result: 'ADVANCE', consequence: '' },
				{ label: 'Schlucht', to: 'tod_schlucht', result: 'ADVANCE', consequence: '' }
			]
		},
		{
			key: 'turm',
			template: 'Castle',
			kind: 'LOCATION',
			title: 'Der schiefe Turm',
			body: 'Er steht seit langem schief und fällt seit langem nicht. Eine Treppe führt hinauf, eine hinab.',
			endingType: null,
			x: 0,
			y: 600,
			attributes: ['high', 'old', 'abandoned'],
			choices: [
				{ label: 'Aufstieg', to: 'zinne', result: 'ADVANCE', consequence: '' },
				{ label: 'Keller', to: 'tod_keller', result: 'ADVANCE', consequence: '' },
				{ label: 'Umrunden', to: 'dorf', result: 'DETOUR', consequence: '' }
			]
		},
		{
			key: 'dorf',
			template: 'Village',
			kind: 'LOCATION',
			title: 'Das stille Dorf',
			body: 'Türen offen, Tische gedeckt, niemand da. Ein Brunnen in der Mitte, eine Kapelle am Rand.',
			endingType: null,
			x: -200,
			y: 600,
			attributes: ['abandoned', 'small'],
			choices: [
				{ label: 'Brunnen', to: 'brunnen', result: 'DETOUR', consequence: '' },
				{ label: 'Markt', to: 'tod_markt', result: 'ADVANCE', consequence: '' },
				{ label: 'Kapelle', to: 'kapelle', result: 'ADVANCE', consequence: '' }
			]
		},
		{
			key: 'zinne',
			template: 'Wall',
			kind: 'LOCATION',
			title: 'Die Zinne',
			body: 'Von hier oben sieht es die Pforte liegen, weit unten und weit weg. Ein Seil hängt über die Brüstung.',
			endingType: null,
			x: 0,
			y: 750,
			attributes: ['high'],
			choices: [
				{ label: 'Seil', to: 'seil', result: 'ADVANCE', consequence: '' },
				{ label: 'Springen', to: 'tod_sturz', result: 'ADVANCE', consequence: '' },
				{ label: 'Hinab', to: 'turm', result: 'SETBACK', consequence: '' }
			]
		},
		{
			key: 'seil',
			template: 'Rope',
			kind: 'OBJECT',
			title: 'Das Seil',
			body: 'Alt, aber jemand hat es geknotet, und wer knotet, rechnet mit dem Zurückkommen.',
			endingType: null,
			x: 0,
			y: 900,
			attributes: ['old'],
			choices: [
				{ label: 'Abseilen', to: 'kapelle', result: 'ADVANCE', consequence: '' },
				{ label: 'Reißen', to: 'tod_riss', result: 'ADVANCE', consequence: '' }
			]
		},
		{
			key: 'brunnen',
			template: 'Well',
			kind: 'LOCATION',
			title: 'Der Brunnen',
			body: 'Tief, und unten steht kein Wasser, sondern etwas anderes. Der Eimer hängt noch am Haken.',
			endingType: null,
			x: -200,
			y: 750,
			attributes: ['deep', 'dark'],
			choices: [
				{ label: 'Eimer', to: 'kapelle', result: 'ADVANCE', consequence: '' },
				{ label: 'Tauchen', to: 'tod_tiefe', result: 'ADVANCE', consequence: '' }
			]
		},

		/* ─────────────────────────────────── das letzte Stück */
		{
			key: 'kapelle',
			template: 'Chapel',
			kind: 'LOCATION',
			title: 'Die Kapelle',
			body: 'Eine Kerze brennt auf dem Altar, und niemand hat sie angezündet. Hinter dem Haus liegt ein Garten.',
			endingType: null,
			x: 200,
			y: 750,
			attributes: ['old', 'bright'],
			choices: [
				{ label: 'Altar', to: 'altar', result: 'DETOUR', consequence: '' },
				{ label: 'Krypta', to: 'tod_krypta', result: 'ADVANCE', consequence: '' },
				{ label: 'Garten', to: 'garten', result: 'ADVANCE', consequence: '' }
			]
		},
		{
			key: 'altar',
			template: 'Key',
			kind: 'OBJECT',
			title: 'Der Altar',
			body: 'Auf dem Stein liegen zwei Dinge: ein kalter Schlüssel und eine Kerze, die nicht ausgeht.',
			endingType: null,
			x: -200,
			y: 900,
			attributes: ['noble'],
			choices: [
				{ label: 'Schlüssel', to: 'schluessel', result: 'ADVANCE', consequence: '' },
				{ label: 'Kerze', to: 'tod_kerze', result: 'ADVANCE', consequence: '' }
			]
		},
		{
			key: 'schluessel',
			template: 'Key',
			kind: 'OBJECT',
			title: 'Der kalte Schlüssel',
			body: 'Er ist schwerer, als er aussieht, und er wird nicht wärmer in der Hand.',
			endingType: null,
			x: 0,
			y: 1050,
			attributes: ['cursed', 'small'],
			choices: [
				{ label: 'Pforte', to: 'pforte', result: 'ADVANCE', consequence: '' },
				{ label: 'Fortwerfen', to: 'tod_leer', result: 'ADVANCE', consequence: '' }
			]
		},
		{
			key: 'garten',
			template: 'Orchard',
			kind: 'LOCATION',
			title: 'Der überwachsene Garten',
			body: 'Zwischen den Ranken steht die Pforte, und der Himmel im Osten ist schon eine Spur heller.',
			endingType: null,
			x: 200,
			y: 900,
			attributes: ['dense', 'abandoned'],
			choices: [
				{ label: 'Pforte', to: 'pforte', result: 'ADVANCE', consequence: '' },
				{ label: 'Hecke', to: 'tod_hecke', result: 'ADVANCE', consequence: '' },
				{ label: 'Umkehren', to: 'kapelle', result: 'SETBACK', consequence: '' }
			]
		},
		{
			key: 'pforte',
			template: 'Gate',
			kind: 'LOCATION',
			title: 'Vor der Mitternachtspforte',
			body: 'Sie ist zu, und sie ist nicht verschlossen, und das sind zwei verschiedene Dinge.',
			endingType: null,
			x: -200,
			y: 1050,
			attributes: ['high', 'old'],
			choices: [
				{ label: 'Öffnen', to: 'daheim', result: 'ADVANCE', consequence: '' },
				{ label: 'Klopfen', to: 'tod_klopfen', result: 'ADVANCE', consequence: '' },
				{ label: 'Warten', to: 'daemmerung', result: 'DETOUR', consequence: '' }
			]
		},

		/* ────────────────────────────────────────── die Enden */
		{
			key: 'daheim',
			template: 'Gate',
			kind: 'LOCATION',
			title: 'Daheim',
			body: 'Die Pforte geht auf, als hätte sie nur darauf gewartet. Dahinter ist es hell und es ist warm und es ist vorbei.',
			endingType: 'SUCCESS',
			x: 0,
			y: 1200,
			attributes: ['bright'],
			choices: []
		},
		{
			key: 'daemmerung',
			template: 'Nightfall',
			kind: 'EVENT',
			title: 'Die Dämmerung',
			body: 'Der Morgen kommt über den Garten, und die Pforte ist immer noch zu. Nichts hat ihm etwas getan. Es steht nur draußen.',
			endingType: 'NEUTRAL',
			x: -200,
			y: 1200,
			attributes: ['sudden'],
			choices: []
		},

		/* ─────────────────────────────────────── und die Gräber */
		{
			key: 'tod_sumpf',
			template: 'Hollow',
			kind: 'LOCATION',
			title: 'Der Sumpf',
			body: 'Es sank so langsam, dass es lange dachte, es käme wieder heraus.',
			endingType: 'FAILURE',
			x: 600,
			y: 300,
			attributes: ['deep', 'dangerous'],
			choices: []
		},
		{
			key: 'tod_dornen',
			template: 'Wall',
			kind: 'LOCATION',
			title: 'Die Dornen',
			body: 'Jeder Schritt kostete ein wenig. Am Ende war nichts mehr übrig, das gehen konnte.',
			endingType: 'FAILURE',
			x: -800,
			y: 300,
			attributes: ['dense'],
			choices: []
		},
		{
			key: 'tod_sprung',
			template: 'Bridge',
			kind: 'LOCATION',
			title: 'Die Lücke',
			body: 'Zwei Bohlen fehlten. Es brauchte drei.',
			endingType: 'FAILURE',
			x: 800,
			y: 300,
			attributes: ['dangerous'],
			choices: []
		},
		{
			key: 'tod_folgen',
			template: 'Lake',
			kind: 'LOCATION',
			title: 'Hinter dem Licht',
			body: 'Das Licht ging weiter, immer einen Schritt weiter, bis kein Boden mehr darunter war.',
			endingType: 'FAILURE',
			x: 400,
			y: 450,
			attributes: ['cursed', 'dark'],
			choices: []
		},
		{
			key: 'tod_kampf',
			template: 'Wolf',
			kind: 'CREATURE',
			title: 'Der satte Wolf',
			body: 'Er war mager und alt und hatte es trotzdem sehr eilig.',
			endingType: 'FAILURE',
			x: -600,
			y: 450,
			attributes: ['dangerous'],
			choices: []
		},
		{
			key: 'tod_schweigen',
			template: 'River',
			kind: 'LOCATION',
			title: 'Der Fluss',
			body: 'Der Fährmann nahm sich, was ihm zustand. Er fragte nur einmal.',
			endingType: 'FAILURE',
			x: 600,
			y: 450,
			attributes: ['deep'],
			choices: []
		},
		{
			key: 'tod_nebel',
			template: 'Hollow',
			kind: 'LOCATION',
			title: 'Der Nebel',
			body: 'Es ging weiter geradeaus. Geradeaus war nicht mehr dort, wo es gewesen war.',
			endingType: 'FAILURE',
			x: -800,
			y: 450,
			attributes: ['dark'],
			choices: []
		},
		{
			key: 'tod_grube',
			template: 'Pit',
			kind: 'LOCATION',
			title: 'Die Grube',
			body: 'Jemand hatte sie zugedeckt, und das war der ganze Sinn der Sache.',
			endingType: 'FAILURE',
			x: 800,
			y: 450,
			attributes: ['deep'],
			choices: []
		},
		{
			key: 'tod_strudel',
			template: 'River',
			kind: 'LOCATION',
			title: 'Der Strudel',
			body: 'Das Wasser sah ruhig aus. Das Wasser sieht immer ruhig aus.',
			endingType: 'FAILURE',
			x: -1000,
			y: 450,
			attributes: ['deep', 'dangerous'],
			choices: []
		},
		{
			key: 'tod_kalt',
			template: 'Campfire',
			kind: 'OBJECT',
			title: 'Die kalte Asche',
			body: 'Das Feuer aus, die Nacht herein. Bis zum Morgen war nichts mehr zu wärmen.',
			endingType: 'FAILURE',
			x: 200,
			y: 600,
			attributes: ['dark'],
			choices: []
		},
		{
			key: 'tod_treiben',
			template: 'Boat',
			kind: 'OBJECT',
			title: 'Die Strömung',
			body: 'Ohne das zweite Ruder entschied der Fluss, und der Fluss wollte woanders hin.',
			endingType: 'FAILURE',
			x: -400,
			y: 600,
			attributes: ['wide'],
			choices: []
		},
		{
			key: 'tod_schlaf',
			template: 'Nightfall',
			kind: 'EVENT',
			title: 'Der Schlaf',
			body: 'Nur einen Augenblick. Der Augenblick hielt bis zum Morgen, und der Morgen kam zu spät.',
			endingType: 'FAILURE',
			x: 400,
			y: 600,
			attributes: ['sudden'],
			choices: []
		},
		{
			key: 'tod_schlucht',
			template: 'Valley',
			kind: 'LOCATION',
			title: 'Die Schlucht',
			body: 'Der Boden hörte einfach auf, und es merkte es erst danach.',
			endingType: 'FAILURE',
			x: -600,
			y: 600,
			attributes: ['deep'],
			choices: []
		},
		{
			key: 'tod_keller',
			template: 'Cave',
			kind: 'LOCATION',
			title: 'Der Keller',
			body: 'Die Treppe ging hinab und hinab, und irgendwann ging sie nicht mehr zurück.',
			endingType: 'FAILURE',
			x: -400,
			y: 750,
			attributes: ['dark', 'deep'],
			choices: []
		},
		{
			key: 'tod_markt',
			template: 'Market',
			kind: 'LOCATION',
			title: 'Der Markt',
			body: 'Die Stände waren voll und die Verkäufer waren da. Sie waren nur schon sehr lange da.',
			endingType: 'FAILURE',
			x: 400,
			y: 750,
			attributes: ['cursed', 'abandoned'],
			choices: []
		},
		{
			key: 'tod_sturz',
			template: 'Wall',
			kind: 'LOCATION',
			title: 'Der Sturz',
			body: 'Von der Zinne aus sah es sehr nah aus. Von unten sah es gar nicht mehr aus.',
			endingType: 'FAILURE',
			x: -400,
			y: 900,
			attributes: ['high'],
			choices: []
		},
		{
			key: 'tod_riss',
			template: 'Rope',
			kind: 'OBJECT',
			title: 'Der Riss',
			body: 'Das Seil hielt für drei Klafter. Es waren neun.',
			endingType: 'FAILURE',
			x: 200,
			y: 1050,
			attributes: ['old'],
			choices: []
		},
		{
			key: 'tod_tiefe',
			template: 'Well',
			kind: 'LOCATION',
			title: 'Die Tiefe',
			body: 'Unten stand kein Wasser. Unten stand etwas, das gewartet hatte.',
			endingType: 'FAILURE',
			x: 400,
			y: 900,
			attributes: ['deep', 'evil'],
			choices: []
		},
		{
			key: 'tod_krypta',
			template: 'Cave',
			kind: 'LOCATION',
			title: 'Die Krypta',
			body: 'Es war nicht allein da unten, und die anderen waren schon länger dort.',
			endingType: 'FAILURE',
			x: -600,
			y: 900,
			attributes: ['dark', 'evil'],
			choices: []
		},
		{
			key: 'tod_kerze',
			template: 'Lantern',
			kind: 'OBJECT',
			title: 'Die Kerze',
			body: 'Sie ging nicht aus, weil sie brannte. Sie ging nicht aus, weil sie nahm.',
			endingType: 'FAILURE',
			x: -400,
			y: 1050,
			attributes: ['cursed'],
			choices: []
		},
		{
			key: 'tod_hecke',
			template: 'Wall',
			kind: 'LOCATION',
			title: 'Die Hecke',
			body: 'Sie wuchs schneller zu, als es hindurchkam, und sie hatte die ganze Nacht Zeit.',
			endingType: 'FAILURE',
			x: 400,
			y: 1050,
			attributes: ['dense'],
			choices: []
		},
		{
			key: 'tod_leer',
			template: 'Gate',
			kind: 'LOCATION',
			title: 'Die verschlossene Pforte',
			body: 'Ohne den Schlüssel war die Pforte nur eine Wand mit einem Griff daran.',
			endingType: 'FAILURE',
			x: 200,
			y: 1200,
			attributes: ['high'],
			choices: []
		},
		{
			key: 'tod_klopfen',
			template: 'Gate',
			kind: 'LOCATION',
			title: 'Was aufmachte',
			body: 'Es klopfte, und es machte auf. Es war nur nicht das, was es erwartet hatte.',
			endingType: 'FAILURE',
			x: -400,
			y: 1200,
			attributes: ['evil'],
			choices: []
		}
	]
};
