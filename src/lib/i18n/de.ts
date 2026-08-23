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
		footer: 'Kein Konto · kein Passwort · nichts anzumelden',
		whichTale: 'Welche Geschichte',
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
		follow: 'Folgen',
		mapStart: 'START',
		mapHome: 'HEIM'
	},
	narration: {
		comesTo: 'Vor ihm: {place}.',
		waysOne: '{a}?',
		waysTwo: '{a} oder {b}?',
		waysMany: '{list} oder {last}?',
		knowsTheWay: 'Diesen Weg kenne ich. Ich spüre ihn in den Knochen.',
		doesNotReturn: 'Es kehrt nicht zurück.',
		wandered: 'Es ging, bis das Licht schwand, und war dem Heim nicht näher.'
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
		wandered: 'ging noch, als das Licht schwand',
		stopped: 'der Weg hörte einfach auf',
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
		taughtBy: 'unterrichtet von {name}',
		whatYouWrote: 'Was du ihm geschrieben hast',
		theOthers: 'Die anderen',
		again: 'Noch eine erzählen'
	},
	toast: {
		sabotagedTitle: 'EINE FALSCHE SEITE',
		sabotagedBody: '{actor} schrieb Zeile {line} um: aus „{before}“ wurde „{after}“.',
		joinedTitle: 'NOCH EIN ERZÄHLER',
		joinedBody: '{name} ist der Geschichte beigetreten.',
		leftTitle: 'EIN LEERER STUHL',
		leftBody: '{name} hat die Runde verlassen.',
		replacedBody: '{name} ist weg — der Agent ist jetzt auf sich allein gestellt.',
		reconnecting: 'Der Faden riss — er wird wieder gesucht',
		offline: 'Der Faden ist verloren — neu laden, um neu zu beginnen'
	},
	pp: {
		joinRound: 'Runde beitreten',
		scanPrompt: 'QR-Code der Runde scannen',
		scanCancel: 'Abbrechen',
		typeCodeInstead: 'Code eingeben',
		codePlaceholder: 'X7KD',
		codeSubmit: 'Beitreten',
		cameraBlocked: 'Keine Kamera verf\u00fcgbar. Gib stattdessen den Code der Runde ein.',
		showQr: 'QR-Code zeigen',
		scanToJoin: 'Freunde können dir durch Scannen beitreten',
		invite: 'Einladen',
		hereCount: '{n} von {total} da',
		forward: 'Weiter',
		menu: 'Men\u00fc',
		readAloud: 'Geschichte vorlesen',
		readAloudStop: 'Vorlesen beenden'
	},
	config: {
		namePlaceholder: 'Name',
		editName: 'Namen \u00e4ndern',
		commitName: 'Namen \u00fcbernehmen',
		done: 'Fertig',
		previous: 'Vorheriger Charakter',
		next: 'N\u00e4chster Charakter',
		character: '{name}, {epithet}',
		artMissing: '{name} kommt hier hin',
		colourTaken: 'Diese Farbe ist vergeben',
		pickColour: 'Spielfarbe w\u00e4hlen'
	},
	seats: {
		ready: 'Bereit',
		waiting: 'Warten',
		empty: 'Ein freier Platz',
		you: 'du',
		editYours: 'Deine Figur \u00e4ndern',
		startingIn: 'Start in {n}'
	},
	map: {
		cluePhase: 'Hinweise erfassen',
		roundRunning: 'Runde l\u00e4uft',
		theEnd: 'Das Ende',
		cluePlaceholder: 'Hinweis eingeben',
		clueClosed: 'Runde l\u00e4uft \u2026',
		rationSpent: 'Ration verbraucht',
		waitingOthers: 'Warten auf die anderen',
		send: 'Hinweis senden',
		imDone: 'Ich bin fertig',
		jumpToLatest: 'Zum neuesten',
		toBrain: 'Ged\u00e4chtnis \u00f6ffnen',
		toMap: 'Karte \u00f6ffnen',
		nowRunning: '{name} ist unterwegs',
		onInstinct: '(aus dem Bauch)',
		storyOf: 'Verlauf von {name}',
		focusOn: '{name} auf der Karte zeigen',
		lettersLeft: '{n}/{total}',
		canvas:
			'Die Karte. Ziehen, um sich umzusehen, Pfeiltasten zum Verschieben, Plus und Minus zum Zoomen.'
	},
	brain: {
		yourOwn: 'Dein Ged\u00e4chtnis',
		injectPlaceholder: 'Injection platzieren',
		pickLineFirst: 'Zeile zum \u00dcberschreiben w\u00e4hlen',
		overwrites: '\u00fcberschreibt \u00ab{line}\u00bb',
		mischiefSpent: 'Dein Streich ist verbraucht',
		noNotes: 'Noch keine Notizen',
		selectPlayer: '{name} anzeigen',
		poisonLine: 'Hinweis {n} \u00fcberschreiben',
		poisonedBy: 'Von {name} \u00fcberschrieben',
		noNotesYet: 'Du hast noch nichts geschrieben.',
		theirNoNotes: 'Dieser Charakter hat noch keine Hinweise erhalten.',
		cancelInject: 'Diesen Hinweis in Ruhe lassen',
		grantsLeft: '{n} verf\u00fcgbar'
	},
	menu: {
		title: 'Men\u00fc',
		leaveRound: 'Runde verlassen',
		showRules: 'Spielregeln anzeigen',
		readAloud: 'Vorlesen',
		sound: 'Musik',
		settings: 'Einstellungen',
		mapSection: 'Karte',
		close: 'Schlie\u00dfen'
	},
	rules: {
		title: 'Spielregeln',
		lead: 'Vier KI-Agenten irren durch eine unentdeckte Welt auf der Suche nach dem Weg nach Hause.',
		paragraphs: [
			'Du steuerst als Operator deinen Agenten nicht direkt. \u00dcber die Runden schreibst du limitierte Prompts in sein Ged\u00e4chtnis. Er vertraut deinen Notizen mehr als seinem Gef\u00fchl. Einmal pro Spiel kannst du einen Prompt eines Rivalen \u00fcberschreiben und ihn mit deiner L\u00fcge ins Verderben senden. Wer seinen Agenten als erstes sicher nach Hause f\u00fchrt, gewinnt.'
		]
	},
	confirm: {
		leaveRound: 'Diese Runde wirklich verlassen?',
		inject: '\u00ab{before}\u00bb durch \u00ab{after}\u00bb ersetzen?',
		yes: 'Ja',
		no: 'Nein'
	},
	end: {
		wins: '{name} gewinnt',
		youWin: 'Du gewinnst',
		leaveRound: 'Runde verlassen',
		close: 'Schlie\u00dfen'
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
