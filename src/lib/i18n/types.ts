/**
 * Localisation.
 *
 * A locale is a property of the **match**, not of the viewer. That is not a
 * shortcut: players write their agent's memory by hand, and the agent matches
 * that memory against the names of the paths in front of it. If one player saw
 * "Forest" and another "Wald", they could not read each other's notes and the
 * keyword matching would break. The host picks the language; everyone in that
 * match reads and writes it.
 */

export const LOCALES = ['en', 'de'] as const;
export type Locale = (typeof LOCALES)[number];

export const LOCALE_NAMES: Record<Locale, string> = {
	en: 'English',
	de: 'Deutsch'
};

export function isLocale(value: unknown): value is Locale {
	return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/** Text that exists in every language. */
export type Strings = {
	home: {
		eyebrow: string;
		blurb: string;
		tabCreate: string;
		tabJoin: string;
		yourName: string;
		namePlaceholder: string;
		joinNamePlaceholder: string;
		begin: string;
		connecting: string;
		seatsNote: string;
		passphrase: string;
		join: string;
		footer: string;
		language: string;
	};
	lobby: {
		passphrase: string;
		share: string;
		copied: string;
		whoIsHere: string;
		you: string;
		host: string;
		emptySeat: string;
		filledBy: string;
		leave: string;
		start: string;
		waitingForHost: string;
		note: string;
		notFound: string;
		finding: string;
	};
	game: {
		round: string;
		betweenRounds: string;
		theEnd: string;
		ofDepth: string;
		noTale: string;
		finding: string;
		teachingHint: string;
		wholeLand: string;
		follow: string;
	};
	narration: {
		roundIs: string;
		backToStart: string;
		goesFirst: string;
		setsOut: string;
		knowsNothing: string;
		carriesOne: string;
		carriesMany: string;
		oneIsFalse: string;
		manyAreFalse: string;
		comesTo: string;
		waysTwo: string;
		waysMany: string;
		waysOne: string;
		hurriesOn: string;
		takes: string;
		wayHolds: string;
		record: string;
		doesNotReturn: string;
		gateOpens: string;
		isHome: string;
		yourAgent: string;
		turnOf: string;
	};
	carried: {
		title: string;
		oneFalse: string;
		manyFalse: string;
		nothing: string;
	};
	memory: {
		title: string;
		letters: string;
		blank: string;
		struckOutBy: string;
		waitingOthers: string;
		writeOne: string;
		nothingLeft: string;
		placeholder: string;
		spent: string;
		inscribe: string;
		ready: string;
		sendOut: string;
		waitingOn: string;
		pageClosed: string;
		taleTold: string;
	};
	roster: {
		title: string;
		mischiefSpent: string;
		mischiefLeft: string;
		you: string;
		thinking: string;
		misled: string;
		mislead: string;
		misleadHint: string;
	};
	tale: {
		round: string;
		you: string;
		home: string;
		furthest: string;
		lostAt: string;
		asBefore: string;
		onFalsePage: string;
	};
	sabotage: {
		title: string;
		blurb: string;
		whichLine: string;
		writeInstead: string;
		liePlaceholder: string;
		blankNote: string;
		howItReads: string;
		cancel: string;
		confirm: string;
	};
	victory: {
		andSo: string;
		youCameHome: string;
		theyFoundTheGate: string;
		nobody: string;
		stillOut: string;
		rounds: string;
		lettersSpent: string;
		partingsPassed: string;
		misled: string;
		misledOnce: string;
		misledNever: string;
		roadItTook: string;
		whatYouWrote: string;
		theOthers: string;
		again: string;
	};
	toast: {
		sabotagedTitle: string;
		sabotagedBody: string;
		joinedTitle: string;
		joinedBody: string;
		reconnecting: string;
	};
	/** One line of story for a whole round, chosen by the engine. */
	headlines: {
		oneHome: string;
		manyHome: string;
		allSameWay: string;
		repeated: string;
		believedLie: string;
		nobodyPastFirst: string;
		tiedAtTop: string;
		furthest: string;
		levelOne: string;
		levelMany: string;
	};
};
