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
		/** Shown only when more than one tale is published in that language. */
		whichTale: string;
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
		/** Marks the opening node on the board. */
		mapStart: string;
		/** Marks a SUCCESS ending on the board. */
		mapHome: string;
	};
	/**
	 * What the map says out loud.
	 *
	 * A handful of lines, and that is the whole of it: the revised design tells the
	 * story in bubbles belonging to the agent that is walking, so most of the
	 * world's old commentary has nowhere to be said and is no longer written.
	 *
	 * What survives is the decision itself — where the agent is standing and what
	 * is in front of it — because that is what the pause before a choice is *for*.
	 */
	narration: {
		/** Where the agent has arrived. Heads the bubble that poses the choice. */
		comesTo: string;
		/** The roads on offer, as a question. One, two, and three-or-more. */
		waysOne: string;
		waysTwo: string;
		waysMany: string;
		/**
		 * Said once when an agent starts down ground it has already proven.
		 *
		 * In the agent's own voice, like its reasoning, because that is what it is:
		 * it is not deciding anything here, it is recognising the road.
		 */
		knowsTheWay: string;
		/** The one line a death gets, in the dead agent's colour. */
		doesNotReturn: string;
		/** Read out when a run spends its whole step budget without arriving. */
		wandered: string;
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
		/** Spent its whole step budget without arriving anywhere. */
		wandered: string;
		/** Reached an ending that was neither home nor a death. */
		stopped: string;
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
		/** Terminal: retrying gave up and the page needs a reload. */
		offline: string;
	};
	/* -------------------------------------------------- Prompt & Pray screens */

	/** Screen 1: the round's QR code, and joining someone else's. */
	pp: {
		joinRound: string;
		scanPrompt: string;
		scanCancel: string;
		/** Shown where the camera cannot be used: Safari, a denied permission, plain http. */
		typeCodeInstead: string;
		codePlaceholder: string;
		codeSubmit: string;
		cameraBlocked: string;
		showQr: string;
		forward: string;
		menu: string;
	};
	/** Screen 2: name, portrait, colour. */
	config: {
		namePlaceholder: string;
		editName: string;
		commitName: string;
		done: string;
		previous: string;
		next: string;
		/** Alt text for a portrait, and the placeholder when the art is missing. */
		character: string;
		artMissing: string;
		colourTaken: string;
		pickColour: string;
	};
	/** Screen 3, on top of the existing lobby copy. */
	seats: {
		ready: string;
		waiting: string;
		empty: string;
		you: string;
		editYours: string;
		startingIn: string;
	};
	/** Screen 4: the map and the clue feed. */
	map: {
		cluePhase: string;
		roundRunning: string;
		theEnd: string;
		cluePlaceholder: string;
		clueClosed: string;
		rationSpent: string;
		waitingOthers: string;
		send: string;
		imDone: string;
		jumpToLatest: string;
		toBrain: string;
		toMap: string;
		/** The title while somebody else's agent is walking. */
		nowRunning: string;
		/** Names the feed panel: whose history is in it. */
		storyOf: string;
		focusOn: string;
		lettersLeft: string;
	};
	/** Screen 5: somebody's whole history, and what you can put in it. */
	brain: {
		yourOwn: string;
		injectPlaceholder: string;
		pickLineFirst: string;
		overwrites: string;
		mischiefSpent: string;
		noNotes: string;
		selectPlayer: string;
		/** The flask on one of a rival's notes. Takes {n}, the line's number. */
		poisonLine: string;
		/** Read out on a poisoned line. Takes {name}, the rival who wrote over it. */
		poisonedBy: string;
		/** Your own list, before you have written anything. */
		noNotesYet: string;
		/** A rival's list, before they have. */
		theirNoNotes: string;
		/** Backing out of a chosen sabotage target. */
		cancelInject: string;
	};
	/** The global menu and its sheets. */
	menu: {
		title: string;
		newRound: string;
		playAgain: string;
		showRules: string;
		storyAndLanguage: string;
		close: string;
	};
	rules: {
		title: string;
		/** The one sentence that says what the game is. Set in bold above the rest. */
		lead: string;
		/** The body, one paragraph per entry. */
		paragraphs: string[];
	};
	confirm: {
		newRound: string;
		playAgain: string;
		inject: string;
		yes: string;
		no: string;
	};
	end: {
		wins: string;
		youWin: string;
		playAgain: string;
		close: string;
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
