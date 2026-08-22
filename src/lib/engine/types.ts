/**
 * Core data model for HOMEWARD.
 *
 * Everything in `src/lib/engine` is pure TypeScript: no Svelte, no I/O, no
 * `Math.random`. This module is the shared vocabulary between the authoritative
 * server and the client that renders it.
 */

/**
 * A story is a **directed graph**, not a tree.
 *
 * Any node may be reached by several routes, routes may reconverge, and a route
 * may loop back on itself. That is a deliberate widening of the original
 * eight-levels-of-three shape: it lets a story have a detour that rejoins the
 * road, a setback that costs progress without killing, and a wrong turn you can
 * walk out of.
 *
 * Ids here are **strings** throughout, minted from the database's integer keys
 * at load time (see `src/lib/db/story.ts`). The conversion happens once, at that
 * boundary; the engine, the wire protocol and the client never see a number, so
 * there is no place for a string/number mix-up to hide.
 */

export type NodeKind = 'LOCATION' | 'CREATURE' | 'OBJECT' | 'EVENT';

/**
 * Why a run stops when it reaches this node. `null` means it doesn't.
 *
 * Terminality is a property of **where you land**, never of the road you took.
 * One source of truth: an edge cannot claim to be fatal while the node it leads
 * to says the story continues.
 */
export type EndingType = 'SUCCESS' | 'FAILURE' | 'NEUTRAL';

/**
 * Narrative colour on an edge. Deliberately *not* including a fatal option —
 * see `EndingType`. The engine reads none of these; they exist so an author can
 * say "this way is a detour" and have the telling reflect it.
 */
export type ChoiceResult = 'ADVANCE' | 'DETOUR' | 'SETBACK';

/** What taking a choice turned out to cost. The engine alone decides this. */
export type ChoiceOutcome =
	/** Landed somewhere the story goes on. */
	| 'continue'
	/** Landed on a FAILURE ending. */
	| 'death'
	/** Landed on a SUCCESS ending. */
	| 'win'
	/** Landed on a NEUTRAL ending: the run is over, but nothing killed it. */
	| 'end';

export type StoryChoice = {
	id: string;
	label: string;
	/**
	 * A word-shaped, stable, per-node-unique handle for this choice.
	 *
	 * The brain picks by this, not by `id`: the offline brain matches it against
	 * the player's notes as a keyword, and the prompt shows it to the model. A
	 * row number would be meaningless to both.
	 */
	slug: string;
	nextNode: string;
	result: ChoiceResult;
	/** Optional line told as the agent sets off down this road. */
	consequence: string;
};

export type StoryNode = {
	id: string;
	kind: NodeKind;
	title: string;
	description: string;
	/** Non-null makes this node terminal — arriving here ends the run. */
	endingType: EndingType | null;
	/** Authored position on the canvas. Persisted, not computed. */
	x: number;
	y: number;
	/** Empty at an ending; the validator guarantees ≥ 2 anywhere else. */
	choices: StoryChoice[];
};

export type StoryGraph = {
	/** The story's slug, stable across re-seeds. */
	id: string;
	name: string;
	tagline: string;
	startNode: string;
	/** Every SUCCESS ending. Publicly marked on the board, as HOME always was. */
	homeNodes: string[];
	/**
	 * Shortest route from the start to a SUCCESS ending.
	 *
	 * Replaces the old fixed `depth`, which quietly assumed every route was the
	 * same length. It is the denominator the UI shows progress against, so it is
	 * "par for the course" rather than a hard limit — a detour can legitimately
	 * take an agent past it.
	 */
	parSteps: number;
	/**
	 * Hard cap on steps in a single run.
	 *
	 * A graph that permits reconvergence permits `A → B → A`, and the agent walks
	 * itself. Rather than forbid cycles — walking in circles is a good story — the
	 * run ends when the budget is spent. See `RunEnding['wandered']`.
	 */
	stepBudget: number;
	/**
	 * Steps from each node to the nearest SUCCESS ending. Missing when home
	 * cannot be reached from there at all.
	 *
	 * This is what progress is measured against. Counting steps *taken* was fine
	 * for a tree where every step was forward, but in a graph an agent can take
	 * twenty steps in a circle and be no nearer home than when it set out.
	 */
	distanceHome: Record<string, number>;
	nodes: Record<string, StoryNode>;
};

/* ------------------------------------------------------------------ agents */

export type AgentStatus =
	/** Between rounds, waiting for the next one to start. */
	| 'idle'
	/** Walking the tree in the current round. */
	| 'running'
	/** Died this round. Stays where it fell until the next round begins. */
	| 'dead'
	/** Reached HOME. Terminal. */
	| 'home';

export type Decision = {
	nodeId: string;
	nodeTitle: string;
	choiceId: string;
	choiceLabel: string;
	reasoning: string;
	outcome: ChoiceOutcome;
	/** Wall-clock ms since the match started, for the log. */
	at: number;
};

/**
 * How a run finished. Separate from `ChoiceOutcome` because 'wandered' is not
 * something a *choice* did — it is the step budget running out, and the last
 * edge taken was perfectly survivable. Conflating the two would have the fog
 * mark that edge lethal and teach every later round a lie.
 */
export type RunEnding =
	/** Reached a SUCCESS ending. */
	| 'home'
	/** Reached a FAILURE ending. */
	| 'died'
	/** Reached a NEUTRAL ending: over, but not fatal. */
	| 'ended'
	/** Spent the step budget without reaching any ending. */
	| 'wandered';

export type RunRecord = {
	index: number;
	decisions: Decision[];
	/** The node the run stopped on. */
	endedAt: string;
	ending: RunEnding;
	/** True only for 'home'. */
	survived: boolean;
	depthReached: number;
};

/** One agent's fate in one round, for the between-rounds recap. */
export type RoundOutcome = {
	playerId: string;
	name: string;
	seat: number;
	isBot: boolean;
	depth: number;
	survived: boolean;
	/** How the run finished, so the recap can say the right thing about it. */
	ending: RunEnding;
	/** Label of the choice that killed it — null unless it actually died. */
	killedBy: string | null;
	epitaph: string | null;
	/** True when it died at the same place as the round before. */
	repeatedMistake: boolean;
	/** True when its memory was corrupted before this round. */
	wasSabotaged: boolean;
};

export type RoundSummary = {
	round: number;
	/** One line of story for the round as a whole. */
	headline: string;
	outcomes: RoundOutcome[];
};

export type Agent = {
	currentNode: string;
	status: AgentStatus;
	decisions: Decision[];
	/** How deep the *current* run has gotten. */
	depth: number;
	/** Deepest level reached across every run. */
	bestDepth: number;
	/** Set while the brain is deciding, so the UI can show a thinking pulse. */
	thinking: boolean;
};

/* ----------------------------------------------------------------- players */

export type MemoryLine = {
	id: string;
	text: string;
	/** Run index the line was written on. */
	addedOnRun: number;
	/** Set when an opponent overwrote this line. */
	sabotagedBy?: string;
};

/**
 * How well a simulated rival plays. Lives here rather than with the bot
 * controller because it is part of what a player *is*, and a restored match has
 * to be able to say which one each rival was.
 */
export type BotSkill = 'careless' | 'steady' | 'sharp';

export type Player = {
	id: string;
	name: string;
	/** Join order. A persistence key and the turn order; no longer a colour. */
	seat: number;
	/**
	 * The portrait this player picked, 0..CHARACTER_COUNT-1.
	 *
	 * Duplicates are legal — the design only marks *colours* as taken, and two
	 * players in the same coat are told apart by the colour anyway.
	 */
	character: number;
	/**
	 * The identity colour this player picked, 0..PALETTE_SIZE-1.
	 *
	 * Unique within a match, and the same on every screen: this is the one thing
	 * that makes "the orange agent walked off a cliff" mean something at a table.
	 * An index rather than a hex, because the engine has no business knowing what
	 * the colours actually look like.
	 */
	colour: number;
	isBot: boolean;
	/**
	 * How a rival plays, and whether it is the one that plays dirty. Held here
	 * rather than only in the bot controller so a restored match can rebuild the
	 * same opponents rather than four strangers with the old names.
	 */
	botSkill?: BotSkill;
	botSabotages?: boolean;
	connected: boolean;
	ready: boolean;
	memory: MemoryLine[];
	agent: Agent;
	runCount: number;
	runs: RunRecord[];
	sabotageUsed: boolean;
	/** True once this player has been hit by a sabotage at least once. */
	wasSabotaged: boolean;
	/** True if sabotaged since the last round started — drives the "hit" badge. */
	sabotagedThisRound: boolean;
	/** Unspent 20-character grants. Earned at the end of every round. */
	pendingGrants: number;
};

/* ------------------------------------------------------------------- games */

export type GameStatus = 'lobby' | 'running' | 'finished';

/**
 * Matches are round-based and simultaneous. Every agent sets out together and
 * faces the same level at the same moment, which is what makes one agent
 * walking into the Volcano while another finds the Forest worth watching.
 */
export type GamePhase =
	/** Waiting for players before the match begins. */
	| 'lobby'
	/** Between rounds: everyone spends their 20 characters. */
	| 'teaching'
	/** A round is in progress; agents are stepping in lockstep. */
	| 'running'
	/** Someone made it home. */
	| 'over';

/** How long players get to teach between rounds. */
export const TEACHING_SECONDS = 30;

/** What the client is allowed to know about the map: fog of war. */
export type RevealState = {
	/** Node ids whose choices are visible (an agent has stood here). */
	visitedNodes: string[];
	/** Choice ids some agent has taken, with the outcome it produced. */
	takenChoices: Record<string, ChoiceOutcome>;
};

export const MEMORY_GRANT_CHARS = 20;
export const MAX_PLAYERS = 4;

/**
 * How many identity colours there are, and how many portraits.
 *
 * `PALETTE_SIZE` must stay >= `MAX_PLAYERS`, which is what makes auto-assignment
 * total: there is always a free colour for a joiner, so "that colour is taken"
 * can never wedge a lobby. `scripts/check-graph.ts` asserts it.
 */
export const PALETTE_SIZE = 5;
export const CHARACTER_COUNT = 5;

/** How long the lobby counts down once everybody is ready. */
export const LOBBY_COUNTDOWN_SECONDS = 3;
