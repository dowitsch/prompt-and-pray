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
		footer: 'No name kept · no account · no record',
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
		follow: 'Follow'
	},
	narration: {
		roundIs: 'Round {n}.',
		backToStart: 'All four go back to the beginning.',
		goesFirst: '{name} goes first.',
		setsOut: '{name} sets out.',
		knowsNothing: 'It knows nothing at all.',
		carriesOne: 'It carries one line.',
		carriesMany: 'It carries {n} lines.',
		oneIsFalse: 'One of them is false.',
		manyAreFalse: '{n} of them are false.',
		comesTo: 'It comes to {place}.',
		waysTwo: '{a} or {b}?',
		waysMany: '{list} or {last}?',
		waysOne: '{a}?',
		hurriesOn: 'It hurries along the road it knows.',
		takes: 'It takes the {choice}.',
		wayHolds: 'The way holds.',
		record: 'No one has ever come this far.',
		doesNotReturn: 'It does not come back.',
		gateOpens: 'The gate opens.',
		isHome: 'It is home.',
		yourAgent: 'your agent',
		turnOf: '{n} of {total}'
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
		whatYouWrote: 'What you wrote for it',
		theOthers: 'The others',
		again: 'Tell another'
	},
	toast: {
		sabotagedTitle: 'A FALSE PAGE',
		sabotagedBody: '{actor} rewrote line {line}: "{before}" became "{after}".',
		joinedTitle: 'ANOTHER TELLER',
		joinedBody: '{name} joined the tale.',
		reconnecting: 'The thread broke — finding it again'
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
