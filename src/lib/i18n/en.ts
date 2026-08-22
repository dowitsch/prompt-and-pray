import type { Strings } from './types.ts';

/** `{name}` placeholders are filled by `fmt()`. */
export const en: Strings = {
	home: {
		eyebrow: 'A tale of four agents',
		blurb:
			'Your agent is lost in a land of three-way partings. At every one, a single road goes on and the other two do not. You cannot lead it — you may only write it {letters} between rounds, and those letters are the whole of what it will ever know.',
		tabCreate: 'Begin a tale',
		tabJoin: 'Join a tale',
		yourName: 'What are you called?',
		namePlaceholder: 'YOU',
		joinNamePlaceholder: 'AGENT',
		begin: 'Begin',
		connecting: 'Lighting the candle…',
		seatsNote: 'Any empty seats are taken by agents of the tale, so one window is enough.',
		passphrase: 'The word of passage',
		join: 'Join',
		// Matches are stored on the server now, so they survive a restart. "No
		// record" was true of the prototype and would be a lie here.
		footer: 'No account · no password · nothing to sign up for',
		whichTale: 'Which tale',
		language: 'Language of the tale'
	},
	lobby: {
		passphrase: 'The word of passage',
		share: 'Speak it to whoever should join you',
		copied: 'Copied',
		whoIsHere: 'Who is here',
		you: 'you',
		host: 'teller',
		emptySeat: 'An empty seat',
		filledBy: 'an agent of the tale',
		leave: 'Leave',
		start: 'Begin the tale',
		waitingForHost: 'Waiting for the teller',
		note: 'Every empty seat is filled when the tale begins. All four walk the same hidden land, one after another, round by round.',
		notFound: 'No such tale',
		finding: 'Finding your place…'
	},
	game: {
		round: 'Round {n}',
		betweenRounds: 'Between rounds',
		theEnd: 'The end',
		ofDepth: '{n} of {total}',
		noTale: 'No tale in progress',
		finding: 'Finding your place…',
		teachingHint:
			'The four are back at the beginning. Give yours one more line before they set out again.',
		wholeLand: 'The whole land',
		follow: 'Follow',
		mapStart: 'START',
		mapHome: 'HOME'
	},
	narration: {
		comesTo: 'It comes to {place}.',
		waysOne: '{a}?',
		waysTwo: '{a} or {b}?',
		waysMany: '{list} or {last}?',
		knowsTheWay: 'I know this road. I can feel the way in my bones.',
		doesNotReturn: 'It does not come back.',
		wandered: 'It walked until the light failed, and was no nearer home.'
	},
	carried: {
		title: 'What {name} carries',
		oneFalse: 'one line is false',
		manyFalse: '{n} lines are false',
		nothing: 'Nothing at all. It walks on instinct.'
	},
	memory: {
		title: 'All your agent knows',
		letters: '{n} letters',
		blank: 'The page is blank. It knows nothing at all.',
		struckOutBy: 'struck out by {name}',
		waitingOthers: 'Waiting on the others',
		writeOne: 'Write one more line',
		nothingLeft: 'Nothing left to give',
		placeholder: 'The river is deadly',
		spent: 'Spent for this round',
		inscribe: 'Inscribe',
		ready: 'Ready',
		sendOut: 'Send them out',
		waitingOn: 'Waiting on {names}…',
		pageClosed: 'Round {n} · the page is closed',
		taleTold: 'The tale is told'
	},
	roster: {
		title: 'The four',
		mischiefSpent: 'your mischief is spent',
		mischiefLeft: 'one mischief remains',
		you: 'you',
		thinking: 'thinking…',
		misled: 'misled',
		mislead: 'Mislead',
		misleadHint: 'Rewrite one line of their memory'
	},
	tale: {
		round: 'Round {n}',
		you: 'you',
		home: 'home',
		furthest: 'furthest',
		lostAt: 'lost at the {place}',
		wandered: 'still walking when the light went',
		stopped: 'the road simply ran out',
		asBefore: '— as before',
		onFalsePage: '— on a false page'
	},
	sabotage: {
		title: 'A false page',
		blurb:
			"You may do this once, and never again. Rewrite one line of {name}'s memory in your own hand — up to {letters} letters.",
		whichLine: 'Which line to strike out',
		writeInstead: 'And write instead',
		liePlaceholder: 'The valley kills',
		blankNote: 'Leave it blank and the line is simply gone.',
		howItReads: 'How it will read',
		cancel: 'Think better of it',
		confirm: 'Write the lie'
	},
	victory: {
		andSo: 'And so',
		youCameHome: 'Your agent came home',
		theyFoundTheGate: '{names} found the gate',
		nobody: 'Nobody',
		stillOut: 'Yours was still out there, {depth} partings of {total} along the way.',
		rounds: 'Rounds',
		lettersSpent: 'Letters spent',
		partingsPassed: 'Partings passed',
		misled: 'Misled',
		misledOnce: 'ONCE',
		misledNever: 'NEVER',
		roadItTook: 'The road it took',
		taughtBy: 'taught by {name}',
		whatYouWrote: 'What you wrote for it',
		theOthers: 'The others',
		again: 'Tell another'
	},
	toast: {
		sabotagedTitle: 'A FALSE PAGE',
		sabotagedBody: '{actor} rewrote line {line}: "{before}" became "{after}".',
		joinedTitle: 'ANOTHER TELLER',
		joinedBody: '{name} joined the tale.',
		reconnecting: 'The thread broke — finding it again',
		offline: 'The thread is lost — reload to begin again'
	},
	pp: {
		joinRound: 'Join a round',
		scanPrompt: "Scan the round's QR code",
		scanCancel: 'Cancel',
		typeCodeInstead: 'Type the code instead',
		codePlaceholder: 'X7KD',
		codeSubmit: 'Join',
		cameraBlocked: 'No camera here. Type the code of the round instead.',
		showQr: 'Show the QR code',
		forward: 'Onward',
		menu: 'Menu'
	},
	config: {
		namePlaceholder: 'Name',
		editName: 'Change your name',
		commitName: 'Keep this name',
		done: 'Done',
		previous: 'Previous character',
		next: 'Next character',
		character: '{name}, {epithet}',
		artMissing: '{name} goes here',
		colourTaken: 'That colour is taken',
		pickColour: 'Pick your colour'
	},
	seats: {
		ready: 'Ready',
		waiting: 'Waiting',
		empty: 'An empty seat',
		you: 'you',
		editYours: 'Change your figure',
		startingIn: 'Starting in {n}'
	},
	map: {
		cluePhase: 'Write a clue',
		roundRunning: 'The round is running',
		theEnd: 'The end',
		cluePlaceholder: 'Write a clue',
		clueClosed: 'The round is running \u2026',
		rationSpent: 'Nothing left to give',
		waitingOthers: 'Waiting for the others',
		send: 'Send the clue',
		imDone: "I'm done",
		jumpToLatest: 'Jump to the newest',
		toBrain: 'Open the memory',
		toMap: 'Open the map',
		nowRunning: '{name} is walking',
		onInstinct: '(on instinct)',
		storyOf: "{name}'s story",
		focusOn: 'Show {name} on the map',
		lettersLeft: '{n}/{total}'
	},
	brain: {
		yourOwn: 'Your memory',
		injectPlaceholder: 'Plant a line',
		pickLineFirst: 'Pick a line to overwrite',
		overwrites: 'overwrites \u201C{line}\u201D',
		mischiefSpent: 'Your one mischief is spent',
		noNotes: 'Nothing written yet',
		selectPlayer: 'Show {name}',
		poisonLine: 'Overwrite note {n}',
		poisonedBy: 'Overwritten by {name}',
		noNotesYet: 'You have not written anything yet.',
		theirNoNotes: 'This agent has not been told anything yet.',
		cancelInject: 'Leave this note alone'
	},
	menu: {
		title: 'Menu',
		newRound: 'New round',
		playAgain: 'Play again',
		showRules: 'Show the rules',
		storyAndLanguage: 'Story & language',
		close: 'Close'
	},
	rules: {
		title: 'The rules',
		lead: 'Four AI agents wander an undiscovered world, looking for the way home.',
		paragraphs: [
			'You are their operator, and you never steer your agent directly. Between rounds you write a short prompt into its memory, and it trusts your notes more than its own instinct. Once per match you may overwrite one of a rival\u2019s prompts and send them into the dark on your lie. Whoever gets their agent safely home first wins.'
		]
	},
	confirm: {
		newRound: 'End your current round?',
		playAgain: 'Back to the lobby?',
		inject: 'Replace \u201C{before}\u201D with \u201C{after}\u201D?',
		yes: 'Yes',
		no: 'No'
	},
	end: {
		wins: '{name} wins',
		youWin: 'You win',
		playAgain: 'Play again',
		close: 'Close'
	},
	headlines: {
		oneHome: '{name} walked through the gate.',
		manyHome: '{names} reached home together.',
		allSameWay: 'All {n} of them walked into the {place}.',
		repeated: '{name} died at the {place}. Again.',
		believedLie: "{name} believed something that wasn't true.",
		nobodyPastFirst: 'Nobody got past the first choice.',
		tiedAtTop: '{n} agents stalled at the same depth.',
		furthest: '{name} got the furthest — {levels} in.',
		levelOne: '1 level',
		levelMany: '{n} levels'
	}
};
