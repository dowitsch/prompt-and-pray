import type { Strings } from './types.ts';

/**
 * German. Written to be read aloud like a märchen, not translated word for
 * word — the agent is an "es", the paths are "Wege", and the twenty characters
 * are "Buchstaben".
 */
export const de: Strings = {
	home: {
		eyebrow: 'Eine Geschichte von vier Agenten',
		blurb:
			'Dein Agent hat sich verirrt, in einem Land voller Weggabelungen. An jeder führt genau ein Weg weiter, die beiden anderen nicht. Du kannst es nicht führen — du darfst ihm zwischen den Runden nur {letters} schreiben, und diese Buchstaben sind alles, was es je wissen wird.',
		tabCreate: 'Geschichte beginnen',
		tabJoin: 'Geschichte beitreten',
		yourName: 'Wie heißt du?',
		namePlaceholder: 'DU',
		joinNamePlaceholder: 'AGENT',
		begin: 'Beginnen',
		connecting: 'Die Kerze wird entzündet…',
		seatsNote: 'Leere Plätze übernehmen Agenten der Geschichte, ein Fenster genügt also.',
		passphrase: 'Das Losungswort',
		join: 'Beitreten',
		footer: 'Kein Name bleibt · kein Konto · keine Spur',
		language: 'Sprache der Geschichte'
	},
	lobby: {
		passphrase: 'Das Losungswort',
		share: 'Sag es dem, der mitkommen soll',
		copied: 'Kopiert',
		whoIsHere: 'Wer hier ist',
		you: 'du',
		host: 'Erzähler',
		emptySeat: 'Ein leerer Platz',
		filledBy: 'ein Agent der Geschichte',
		leave: 'Verlassen',
		start: 'Die Geschichte beginnen',
		waitingForHost: 'Warten auf den Erzähler',
		note: 'Jeder leere Platz wird besetzt, wenn die Geschichte beginnt. Alle vier gehen durch dasselbe verborgene Land, einer nach dem anderen, Runde für Runde.',
		notFound: 'Keine solche Geschichte',
		finding: 'Dein Platz wird gesucht…'
	},
	game: {
		round: 'Runde {n}',
		betweenRounds: 'Zwischen den Runden',
		theEnd: 'Das Ende',
		ofDepth: '{n} von {total}',
		noTale: 'Keine Geschichte im Gange',
		finding: 'Dein Platz wird gesucht…',
		teachingHint:
			'Die vier stehen wieder am Anfang. Schreib deinem noch eine Zeile, bevor sie erneut aufbrechen.',
		wholeLand: 'Das ganze Land',
		follow: 'Folgen'
	},
	narration: {
		roundIs: 'Runde {n}.',
		backToStart: 'Alle vier kehren an den Anfang zurück.',
		goesFirst: '{name} geht zuerst.',
		setsOut: '{name} bricht auf.',
		knowsNothing: 'Es weiß überhaupt nichts.',
		carriesOne: 'Es trägt eine Zeile bei sich.',
		carriesMany: 'Es trägt {n} Zeilen bei sich.',
		oneIsFalse: 'Eine davon ist falsch.',
		manyAreFalse: '{n} davon sind falsch.',
		comesTo: 'Vor ihm: {place}.',
		waysTwo: '{a} oder {b}?',
		waysMany: '{list} oder {last}?',
		waysOne: '{a}?',
		hurriesOn: 'Es eilt den Weg entlang, den es kennt.',
		takes: 'Es nimmt {choice}.',
		wayHolds: 'Der Weg trägt.',
		record: 'So weit ist noch niemand gekommen.',
		doesNotReturn: 'Es kehrt nicht zurück.',
		gateOpens: 'Das Tor öffnet sich.',
		isHome: 'Es ist zu Hause.',
		yourAgent: 'dein Agent',
		turnOf: '{n} von {total}'
	},
	carried: {
		title: 'Was {name} bei sich trägt',
		oneFalse: 'eine Zeile ist falsch',
		manyFalse: '{n} Zeilen sind falsch',
		nothing: 'Überhaupt nichts. Es geht nach Gefühl.'
	},
	memory: {
		title: 'Alles, was dein Agent weiß',
		letters: '{n} Buchstaben',
		blank: 'Die Seite ist leer. Es weiß überhaupt nichts.',
		struckOutBy: 'gestrichen von {name}',
		waitingOthers: 'Warten auf die anderen',
		writeOne: 'Schreib noch eine Zeile',
		nothingLeft: 'Nichts mehr zu geben',
		placeholder: 'Der Fluss ist tödlich',
		spent: 'Für diese Runde verbraucht',
		inscribe: 'Eintragen',
		ready: 'Bereit',
		sendOut: 'Schick sie los',
		waitingOn: 'Warten auf {names}…',
		pageClosed: 'Runde {n} · die Seite ist geschlossen',
		taleTold: 'Die Geschichte ist erzählt'
	},
	roster: {
		title: 'Die vier',
		mischiefSpent: 'deine List ist verbraucht',
		mischiefLeft: 'eine List bleibt dir',
		you: 'du',
		thinking: 'denkt nach…',
		misled: 'getäuscht',
		mislead: 'Täuschen',
		misleadHint: 'Eine Zeile seines Gedächtnisses umschreiben'
	},
	tale: {
		round: 'Runde {n}',
		you: 'du',
		home: 'zu Hause',
		furthest: 'am weitesten',
		lostAt: 'verloren — {place}',
		asBefore: '— wie zuvor',
		onFalsePage: '— auf einer falschen Seite'
	},
	sabotage: {
		title: 'Eine falsche Seite',
		blurb:
			'Das darfst du einmal, und nie wieder. Schreib eine Zeile aus {name}s Gedächtnis in deiner eigenen Hand neu — bis zu {letters} Buchstaben.',
		whichLine: 'Welche Zeile gestrichen wird',
		writeInstead: 'Und stattdessen steht da',
		liePlaceholder: 'Das Tal tötet',
		blankNote: 'Lass es leer, und die Zeile ist einfach fort.',
		howItReads: 'So wird es zu lesen sein',
		cancel: 'Lieber doch nicht',
		confirm: 'Die Lüge schreiben'
	},
	victory: {
		andSo: 'Und so',
		youCameHome: 'Dein Agent kam nach Hause',
		theyFoundTheGate: '{names} fand das Tor',
		nobody: 'Niemand',
		stillOut: 'Deiner war noch da draußen, {depth} von {total} Gabelungen weit.',
		rounds: 'Runden',
		lettersSpent: 'Buchstaben verbraucht',
		partingsPassed: 'Gabelungen bestanden',
		misled: 'Getäuscht',
		misledOnce: 'EINMAL',
		misledNever: 'NIE',
		roadItTook: 'Der Weg, den es nahm',
		whatYouWrote: 'Was du ihm geschrieben hast',
		theOthers: 'Die anderen',
		again: 'Noch eine erzählen'
	},
	toast: {
		sabotagedTitle: 'EINE FALSCHE SEITE',
		sabotagedBody: '{actor} schrieb Zeile {line} um: aus „{before}“ wurde „{after}“.',
		joinedTitle: 'NOCH EIN ERZÄHLER',
		joinedBody: '{name} ist der Geschichte beigetreten.',
		reconnecting: 'Der Faden riss — er wird wieder gesucht'
	},
	headlines: {
		oneHome: '{name} ging durch das Tor.',
		manyHome: '{names} kamen gemeinsam nach Hause.',
		allSameWay: 'Alle {n} nahmen denselben Weg: {place}.',
		repeated: '{name} starb wieder — {place}.',
		believedLie: '{name} glaubte etwas, das nicht wahr war.',
		nobodyPastFirst: 'Niemand kam über die erste Gabelung hinaus.',
		tiedAtTop: '{n} Agenten blieben gleich weit stecken.',
		furthest: '{name} kam am weitesten: {levels} tief.',
		levelOne: '1 Ebene',
		levelMany: '{n} Ebenen'
	}
};
