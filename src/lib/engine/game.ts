import {
	MAX_PLAYERS,
	MEMORY_GRANT_CHARS,
	TEACHING_SECONDS,
	PALETTE_SIZE,
	CHARACTER_COUNT,
	LOBBY_COUNTDOWN_SECONDS,
	type Agent,
	type BotSkill,
	type ChoiceOutcome,
	type GamePhase,
	type MemoryLine,
	type Player,
	type RevealState,
	type RoundOutcome,
	type RoundSummary,
	type RunEnding,
	type RunRecord,
	type StoryChoice,
	type StoryGraph,
	type StoryNode
} from './types.ts';
import { fmt, strings, type Locale } from '../i18n/index.ts';
import {
	buildFoggedTree,
	nodeKind,
	outcomeToState,
	type ChoicesRevealed,
	type FoggedTree,
	type NodeRevealed
} from './fog.ts';

/**
 * The authoritative game.
 *
 * Matches run in **rounds**. Every agent sets out at the same moment and faces
 * the same level at the same moment; a round ends when they are all dead or
 * one of them is home. Between rounds everyone spends their twenty characters
 * at once. That synchronisation is the point — it is what turns four separate
 * attempts into one thing worth watching.
 *
 * This class is also the only thing in the system that knows which choice is
 * correct — not the client, and emphatically not the LLM.
 */

export type PublicPlayer = {
	id: string;
	name: string;
	seat: number;
	character: number;
	colour: number;
	isBot: boolean;
	connected: boolean;
	ready: boolean;
	memory: MemoryLine[];
	memoryChars: number;
	agent: Agent;
	runCount: number;
	bestDepth: number;
	sabotageUsed: boolean;
	wasSabotaged: boolean;
	sabotagedThisRound: boolean;
	pendingGrants: number;
	lastRun: RunRecord | null;
};

export type GameSnapshot = {
	code: string;
	phase: GamePhase;
	round: number;
	/** Epoch ms when the teaching phase closes. 0 outside teaching. */
	teachingEndsAt: number;
	/**
	 * Epoch ms when the lobby countdown fires. 0 when nobody is counting.
	 *
	 * Same shape as `teachingEndsAt` and for the same reason: the client renders
	 * `startsAt - now`, so four phones show the same number and a refresh
	 * mid-countdown lands on the right one. Deliberately not persisted — a three
	 * second window is not worth a column, and the honest recovery from a restart
	 * inside it is "the lobby is a lobby again, press ready".
	 */
	startsAt: number;
	hostId: string;
	depth: number;
	players: PublicPlayer[];
	tree: FoggedTree;
	winnerIds: string[];
	lastSummary: RoundSummary | null;
	maxPlayers: number;
	/** How slowly the tale is told, so the client can pace its sentences to match. */
	paceScale: number;
	/** The language this match is told in. Fixed when the game is created. */
	locale: Locale;
};

export type ResolveResult = {
	choice: StoryChoice;
	outcome: ChoiceOutcome;
	toNode: StoryNode;
	depth: number;
	run: RunRecord | null;
	revealed: NodeRevealed;
};

/**
 * Everything about a match that is not derivable from the story.
 *
 * The engine hands this out and takes it back; `src/lib/db/matches.ts` is what
 * turns it into rows. Keeping the conversion outside means the engine still has
 * no idea a database exists, and a match can be reconstituted exactly, including
 * the parts that are nobody's business from outside — the fog, and who died
 * where last round.
 */
export type MatchState = {
	phase: GamePhase;
	round: number;
	teachingEndsAt: number;
	hostId: string;
	winnerIds: string[];
	startedAt: number;
	lastSummary: RoundSummary | null;
	reveal: RevealState;
	/** Node each player died at last round, for spotting a repeated mistake. */
	previousDeaths: Record<string, string>;
	players: Player[];
};

/** How a run that spent its step budget is handed back to the runner. */
export type WanderResult = {
	node: StoryNode;
	run: RunRecord;
	epitaph: string;
	revealed: NodeRevealed;
};

/** What makes one rival different from another. Opaque to the engine. */
export type BotTraits = { skill: BotSkill; sabotages: boolean };

export class GameError extends Error {}

const SEAT_COUNT = MAX_PLAYERS;

export class Game {
	readonly code: string;
	readonly story: StoryGraph;
	readonly createdAt = Date.now();

	phase: GamePhase = 'lobby';
	round = 0;
	teachingEndsAt = 0;
	startsAt = 0;
	players: Player[] = [];
	hostId = '';
	winnerIds: string[] = [];
	startedAt = 0;
	lastSummary: RoundSummary | null = null;
	/** Set by the hub from PACE_SCALE; presentation only, never a rule. */
	paceScale = 1;

	private reveal: RevealState = { visitedNodes: [], takenChoices: {} };
	private familiarNodes = new Set<string>();
	private provenSafe = new Set<string>();
	private memoryLineSeq = 0;
	/** Where each player died last round, for spotting repeated mistakes. */
	private previousDeaths = new Map<string, string>();

	constructor(
		code: string,
		story: StoryGraph,
		/** Every player in a match reads and writes the same language. */
		readonly locale: Locale
	) {
		this.code = code;
		this.story = story;
	}

	/** The authoritative node record. Throws rather than return undefined. */
	node(id: string): StoryNode {
		const node = this.story.nodes[id];
		if (!node) throw new GameError(`No node "${id}" in story ${this.story.id}.`);
		return node;
	}

	/**
	 * How much of the journey an agent standing here has actually completed.
	 *
	 * Measured as ground closed towards home, not as steps walked. A detour that
	 * loops back to where it started took four steps and earns nothing, which is
	 * the honest reading — and it stops a cycle from inflating the score.
	 *
	 * Somewhere home cannot be reached from at all scores zero; the agent keeps
	 * whatever it had already earned, since `depth` only ever moves up.
	 */
	progressAt(nodeId: string): number {
		const remaining = this.story.distanceHome[nodeId];
		if (remaining === undefined) return 0;
		return Math.max(0, this.story.parSteps - remaining);
	}

	/* ------------------------------------------------------------- lobby */

	/**
	 * One rule for what a name is allowed to be, so joining and renaming cannot
	 * drift apart.
	 */
	private cleanName(raw: string, fallback: string): string {
		return raw.slice(0, 18) || fallback;
	}

	/**
	 * The lowest colour nobody has.
	 *
	 * Total, because `PALETTE_SIZE > MAX_PLAYERS`: a joiner always gets one, so a
	 * lobby can never be wedged by everyone having picked. Deterministic, because
	 * the engine is not allowed `Math.random`.
	 */
	private freeColour(): number {
		const taken = new Set(this.players.map((p) => p.colour));
		for (let i = 0; i < PALETTE_SIZE; i++) if (!taken.has(i)) return i;
		return 0;
	}

	/** Same idea for portraits, except duplicates are legal, so this wraps. */
	private freeCharacter(): number {
		const taken = new Set(this.players.map((p) => p.character));
		for (let i = 0; i < CHARACTER_COUNT; i++) if (!taken.has(i)) return i;
		return this.players.length % CHARACTER_COUNT;
	}

	addPlayer(id: string, name: string, isBot = false, bot?: BotTraits): Player {
		if (this.players.length >= SEAT_COUNT) throw new GameError('This game is full.');
		if (this.phase !== 'lobby') throw new GameError('This game has already started.');
		if (this.players.some((p) => p.id === id)) throw new GameError('You are already in this game.');

		const player: Player = {
			id,
			name: this.cleanName(name, `Agent ${this.players.length + 1}`),
			seat: this.players.length,
			// Everyone arrives already looking like somebody. Bots included — which
			// is why they need no code of their own for this.
			character: this.freeCharacter(),
			colour: this.freeColour(),
			isBot,
			botSkill: bot?.skill,
			botSabotages: bot?.sabotages,
			// Bots are always present; only humans can drop out.
			connected: true,
			ready: false,
			memory: [],
			agent: this.freshAgent(),
			runCount: 0,
			runs: [],
			sabotageUsed: false,
			wasSabotaged: false,
			sabotagedThisRound: false,
			pendingGrants: 0
		};

		this.players.push(player);
		if (!this.hostId) this.hostId = id;
		return player;
	}

	getPlayer(id: string): Player {
		const player = this.players.find((p) => p.id === id);
		if (!player) throw new GameError('Unknown player.');
		return player;
	}

	setReady(id: string, ready: boolean): void {
		this.getPlayer(id).ready = ready;
	}

	/**
	 * The config screen: portrait, colour, and the name you go by.
	 *
	 * A patch, so tapping one swatch does not have to resend the rest.
	 *
	 * Lobby only, and that is a rule rather than laziness: `MemoryLine.sabotagedBy`
	 * and `RoundOutcome.name` both store the *name as it was*, and `lastSummary`
	 * is frozen into the database. Renaming mid-match would leave a scatter of
	 * stale attributions in every recap that mentions you.
	 */
	configure(id: string, patch: { name?: string; character?: number; colour?: number }): Player {
		const player = this.getPlayer(id);
		// `startedAt` rather than the phase: `startMatch` sets the clock running but
		// leaves the phase at 'lobby' until the first `beginRound`, so a phase check
		// alone leaves a window in which a rename would still be accepted.
		if (this.phase !== 'lobby' || this.startedAt) {
			throw new GameError('You can only change that in the lobby.');
		}
		if (this.startsAt) {
			throw new GameError('The round is about to start.');
		}

		if (patch.name !== undefined) {
			player.name = this.cleanName(patch.name.trim(), player.name);
		}

		if (patch.character !== undefined) {
			if (
				!Number.isInteger(patch.character) ||
				patch.character < 0 ||
				patch.character >= CHARACTER_COUNT
			) {
				throw new GameError('No such character.');
			}
			player.character = patch.character;
		}

		if (patch.colour !== undefined) {
			if (!Number.isInteger(patch.colour) || patch.colour < 0 || patch.colour >= PALETTE_SIZE) {
				throw new GameError('No such colour.');
			}
			// The contested one. Two players tapping the same swatch in the same tick
			// can only be arbitrated here.
			if (this.players.some((p) => p.id !== id && p.colour === patch.colour)) {
				throw new GameError('That colour is taken.');
			}
			player.colour = patch.colour;
		}

		return player;
	}

	/**
	 * True when every human still at the table has said they are ready.
	 *
	 * Only humans: empty seats do not become bots until the match actually starts,
	 * so waiting for four would mean a lobby that can never begin. A human who
	 * closed their tab is excused for the same reason `allReady` excuses them —
	 * otherwise one person leaving holds everyone else hostage.
	 */
	allHumansReady(): boolean {
		const humans = this.players.filter((p) => !p.isBot && p.connected);
		return humans.length > 0 && humans.every((p) => p.ready);
	}

	/** Start the lobby's 3-2-1. Returns the deadline the clients count down to. */
	armStart(seconds = LOBBY_COUNTDOWN_SECONDS): number {
		if (this.phase !== 'lobby') throw new GameError('The match has already started.');
		this.startsAt = Date.now() + seconds * 1000;
		return this.startsAt;
	}

	disarmStart(): void {
		this.startsAt = 0;
	}

	setConnected(id: string, connected: boolean): void {
		const player = this.players.find((p) => p.id === id);
		if (player) player.connected = connected;
	}

	/**
	 * True when everyone still present has said they are done teaching.
	 * Bots count: they must actually finish writing their note first, or the
	 * round would start before they had a chance to learn anything.
	 */
	allReady(): boolean {
		return this.players.every((p) => p.ready || (!p.isBot && !p.connected));
	}

	startMatch(): void {
		if (this.phase !== 'lobby') throw new GameError('Already started.');
		if (this.players.length < 2) throw new GameError('Need at least two agents.');
		this.startedAt = Date.now();
		this.startsAt = 0;
		this.markVisited(this.story.startNode);
	}

	/**
	 * Play the same land again, with the same people and the same code.
	 *
	 * Every field is named explicitly rather than reconstructing the object,
	 * because the ones that matter most are private and a partial reset leaks
	 * them. `reveal` above all: carrying it over would hand the new match the
	 * previous match's fog, which is to say the answer.
	 *
	 * A no-op when already in the lobby — four players tapping "play again" at
	 * once must not produce three error toasts.
	 */
	rematch(): void {
		if (this.phase === 'lobby') return;
		if (this.phase === 'running' || this.phase === 'teaching') {
			throw new GameError('The match is still going.');
		}

		this.phase = 'lobby';
		this.round = 0;
		this.teachingEndsAt = 0;
		this.startsAt = 0;
		this.winnerIds = [];
		this.lastSummary = null;
		this.startedAt = 0;

		// The private half. Forgetting any of these is a silent bug rather than a
		// broken screen.
		this.reveal = { visitedNodes: [], takenChoices: {} };
		this.familiarNodes.clear();
		this.provenSafe.clear();
		this.previousDeaths.clear();
		this.memoryLineSeq = 0;

		for (const player of this.players) {
			player.memory = [];
			player.runs = [];
			player.runCount = 0;
			player.sabotageUsed = false;
			player.wasSabotaged = false;
			player.sabotagedThisRound = false;
			player.pendingGrants = 0;
			player.ready = false;
			// A plain fresh agent: unlike the restore path, `bestDepth` goes back to
			// zero. Nobody has been anywhere yet.
			player.agent = this.freshAgent();
		}
	}

	/* -------------------------------------------------------------- rounds */

	private freshAgent(): Agent {
		return {
			currentNode: this.story.startNode,
			status: 'idle',
			decisions: [],
			depth: 0,
			bestDepth: 0,
			thinking: false
		};
	}

	/** Everyone sets out this round; they take their turns one at a time. */
	beginRound(): number {
		this.round += 1;
		this.phase = 'running';
		this.teachingEndsAt = 0;

		// Snapshot what the world already knew before this round. Ground that was
		// already proven safe gets replayed quickly, so the story lingers only on
		// the step where something new actually happens.
		this.familiarNodes = new Set(this.reveal.visitedNodes);
		this.provenSafe = new Set(
			Object.entries(this.reveal.takenChoices)
				.filter(([, outcome]) => outcome !== 'death')
				.map(([choiceId]) => choiceId)
		);

		for (const player of this.players) {
			player.runCount += 1;
			player.ready = false;
			player.sabotagedThisRound = false;
			player.agent = {
				...this.freshAgent(),
				bestDepth: player.agent.bestDepth,
				status: 'running'
			};
		}

		this.markVisited(this.story.startNode);
		return this.round;
	}

	/**
	 * The order agents take their turns in.
	 *
	 * Rivals go first and humans last, so a round builds towards your own agent
	 * rather than trailing off after it. Rivals rotate each round so the same one
	 * is not always opening.
	 */
	turnOrder(): Player[] {
		const bots = this.players.filter((p) => p.isBot);
		const humans = this.players.filter((p) => !p.isBot);
		const shift = bots.length ? (this.round - 1) % bots.length : 0;
		return [...bots.slice(shift), ...bots.slice(0, shift), ...humans];
	}

	/** Ground already walked before this round: replay it quickly. */
	isFamiliar(nodeId: string): boolean {
		return this.familiarNodes.has(nodeId);
	}

	/** A choice the world had already proven survivable before this round. */
	isProvenSafe(choiceId: string): boolean {
		return this.provenSafe.has(choiceId);
	}

	/** The deepest anyone has ever reached. A step past it is worth its own line. */
	deepestSoFar(): number {
		return this.players.reduce((deepest, p) => Math.max(deepest, p.agent.bestDepth), 0);
	}

	/** Close the round, build its story, and hand everyone their characters. */
	endRound(): RoundSummary {
		const outcomes: RoundOutcome[] = this.players.map((player) => {
			const run = player.runs.at(-1) ?? null;
			// Only an actual death has a road that killed it. A run that merely
			// stopped, or ran out of daylight, was nobody's fault.
			const fatal = run?.ending === 'died' ? (run.decisions.at(-1) ?? null) : null;
			const deathNode = run?.ending === 'died' ? run.endedAt : null;

			return {
				playerId: player.id,
				name: player.name,
				seat: player.seat,
				isBot: player.isBot,
				depth: player.agent.depth,
				survived: player.agent.status === 'home',
				ending: run?.ending ?? 'wandered',
				killedBy: fatal?.choiceLabel ?? null,
				epitaph: deathNode ? (this.story.nodes[deathNode]?.description ?? null) : null,
				repeatedMistake: Boolean(deathNode && this.previousDeaths.get(player.id) === deathNode),
				wasSabotaged: player.sabotagedThisRound
			};
		});

		for (const player of this.players) {
			const run = player.runs.at(-1);
			if (run?.ending === 'died') this.previousDeaths.set(player.id, run.endedAt);
			else this.previousDeaths.delete(player.id);
		}

		const summary: RoundSummary = {
			round: this.round,
			headline: this.narrate(outcomes),
			outcomes
		};
		this.lastSummary = summary;

		if (this.winnerIds.length) {
			this.phase = 'over';
		} else {
			// Everyone earns their twenty characters, however badly it went.
			for (const player of this.players) player.pendingGrants += 1;
		}

		return summary;
	}

	openTeaching(seconds = TEACHING_SECONDS): number {
		this.phase = 'teaching';
		this.teachingEndsAt = Date.now() + seconds * 1000;
		for (const player of this.players) {
			player.ready = false;
			player.agent.status = 'idle';
		}
		return this.teachingEndsAt;
	}

	/**
	 * One line of story for the round. Ordered by what is most fun to read
	 * rather than what is most informative — a repeated death is better
	 * television than a statistic.
	 */
	private narrate(outcomes: RoundOutcome[]): string {
		const h = strings(this.locale).headlines;
		const winners = outcomes.filter((o) => o.survived);
		if (winners.length === 1) return fmt(h.oneHome, { name: winners[0].name });
		if (winners.length > 1) {
			return fmt(h.manyHome, { names: winners.map((w) => w.name).join(' & ') });
		}

		const dead = outcomes.filter((o) => o.killedBy);
		const deepest = [...outcomes].sort((a, b) => b.depth - a.depth)[0];

		// Everyone made the same mistake — the best possible round to watch.
		if (dead.length > 1 && dead.length === outcomes.length) {
			const first = dead[0].killedBy;
			if (dead.every((o) => o.killedBy === first)) {
				return fmt(h.allSameWay, { n: dead.length, place: first ?? '' });
			}
		}

		const repeat = dead.find((o) => o.repeatedMistake);
		if (repeat) return fmt(h.repeated, { name: repeat.name, place: repeat.killedBy ?? '' });

		const betrayed = dead.find((o) => o.wasSabotaged);
		if (betrayed) return fmt(h.believedLie, { name: betrayed.name });

		if (deepest && deepest.depth === 0) return h.nobodyPastFirst;

		const tiedAtTop = outcomes.filter((o) => o.depth === deepest.depth);
		if (tiedAtTop.length > 1) return fmt(h.tiedAtTop, { n: tiedAtTop.length });

		const levels = deepest.depth === 1 ? h.levelOne : fmt(h.levelMany, { n: deepest.depth });
		return fmt(h.furthest, { name: deepest.name, levels });
	}

	nodeFor(id: string): StoryNode {
		return this.node(this.getPlayer(id).agent.currentNode);
	}

	/** Reveals the choice labels at the agent's current node. */
	sightAt(id: string): ChoicesRevealed {
		const node = this.nodeFor(id);
		this.markVisited(node.id);
		return {
			nodeId: node.id,
			choices: node.choices.map((c) => ({ choiceId: c.id, label: c.label }))
		};
	}

	setThinking(id: string, thinking: boolean): void {
		this.getPlayer(id).agent.thinking = thinking;
	}

	/**
	 * Terminality is read off the node the agent lands on, never off the road it
	 * took to get there. One source of truth: there is no way for an edge to
	 * claim a death the destination disagrees with.
	 */
	private outcomeOf(node: StoryNode): ChoiceOutcome {
		switch (node.endingType) {
			case 'SUCCESS':
				return 'win';
			case 'FAILURE':
				return 'death';
			case 'NEUTRAL':
				return 'end';
			default:
				return 'continue';
		}
	}

	private revealOf(node: StoryNode, outcome: ChoiceOutcome, choiceId: string): NodeRevealed {
		return {
			choiceId,
			state: outcomeToState(outcome),
			node: {
				id: node.id,
				kind: nodeKind(node, node.id === this.story.startNode),
				title: node.title,
				description: node.description,
				epitaph: node.endingType ? node.description : null
			}
		};
	}

	private finishRun(player: Player, node: StoryNode, ending: RunEnding): RunRecord {
		player.agent.status = ending === 'home' ? 'home' : 'dead';
		player.agent.thinking = false;

		const run: RunRecord = {
			index: this.round,
			decisions: [...player.agent.decisions],
			endedAt: node.id,
			ending,
			survived: ending === 'home',
			depthReached: player.agent.depth
		};
		player.runs.push(run);

		// Several agents can arrive in the same round; they all win. Turn order
		// must never be what decides a match.
		if (ending === 'home' && !this.winnerIds.includes(player.id)) {
			this.winnerIds.push(player.id);
		}
		return run;
	}

	/**
	 * The single source of truth for what a choice costs. The brain picked a
	 * road; this decides where it goes and whether the story continues.
	 */
	resolveChoice(
		id: string,
		choiceId: string,
		reasoning: string,
		improvised = false
	): ResolveResult {
		const player = this.getPlayer(id);
		const node = this.nodeFor(id);
		const choice = node.choices.find((c) => c.id === choiceId);
		if (!choice) throw new GameError(`No such choice "${choiceId}" at ${node.id}.`);

		const toNode = this.node(choice.nextNode);
		const outcome = this.outcomeOf(toNode);

		player.agent.decisions.push({
			nodeId: node.id,
			nodeTitle: node.title,
			choiceId: choice.id,
			choiceLabel: choice.label,
			reasoning,
			outcome,
			improvised,
			at: Date.now() - this.startedAt
		});

		this.reveal.takenChoices[choice.id] = outcome;
		player.agent.currentNode = toNode.id;

		// Ground closed towards home, and only ever upwards: a setback that costs
		// an agent progress does not un-earn what it already showed it could do.
		player.agent.depth = Math.max(player.agent.depth, this.progressAt(toNode.id));
		player.agent.bestDepth = Math.max(player.agent.bestDepth, player.agent.depth);

		const ENDINGS = { win: 'home', death: 'died', end: 'ended' } as const;

		let run: RunRecord | null = null;
		if (outcome === 'continue') {
			this.markVisited(toNode.id);
		} else {
			run = this.finishRun(player, toNode, ENDINGS[outcome]);
		}

		return {
			choice,
			outcome,
			toNode,
			depth: player.agent.depth,
			run,
			revealed: this.revealOf(toNode, outcome, choice.id)
		};
	}

	/**
	 * End a run that spent its whole step budget without reaching an ending.
	 *
	 * The alternative was to forbid cycles, but an agent walking in circles
	 * because its notes contradict each other is one of the better things this
	 * game produces. So the loop is legal and the daylight is finite.
	 *
	 * Note what this deliberately does *not* do: it does not mark the last road
	 * taken as lethal. That road was survivable — the agent is standing on the
	 * far side of it. Recording otherwise would teach every later round a lie.
	 */
	wander(id: string): WanderResult {
		const player = this.getPlayer(id);
		const node = this.nodeFor(id);
		const run = this.finishRun(player, node, 'wandered');
		const lastChoice = player.agent.decisions.at(-1)?.choiceId ?? '';

		return {
			node,
			run,
			epitaph: strings(this.locale).narration.wandered,
			revealed: this.revealOf(node, 'continue', lastChoice)
		};
	}

	/* ------------------------------------------------------------ memory */

	/** Enforces the 20-character grant server-side. The input's maxlength is a courtesy. */
	addMemory(id: string, rawText: string): MemoryLine {
		const player = this.getPlayer(id);
		if (this.phase !== 'teaching') {
			throw new GameError('You can only teach between rounds.');
		}
		if (player.pendingGrants <= 0) {
			throw new GameError('No knowledge left to give this round.');
		}

		const text = rawText.trim();
		if (!text) throw new GameError('Write something first.');
		if (text.length > MEMORY_GRANT_CHARS) {
			throw new GameError(`Memory is limited to ${MEMORY_GRANT_CHARS} characters.`);
		}

		const line: MemoryLine = {
			id: `m${++this.memoryLineSeq}`,
			text,
			addedOnRun: this.round
		};
		player.memory.push(line);
		player.pendingGrants -= 1;
		return line;
	}

	/* ---------------------------------------------------------- sabotage */

	useSabotage(
		actorId: string,
		targetId: string,
		lineIndex: number,
		rawText: string
	): { target: Player; before: string; after: string; lineIndex: number } {
		const actor = this.getPlayer(actorId);
		const target = this.getPlayer(targetId);

		if (this.phase === 'lobby' || this.phase === 'over') {
			throw new GameError('The match is not running.');
		}
		if (actor.sabotageUsed) throw new GameError('You have already used your sabotage.');
		if (actorId === targetId) throw new GameError('You cannot sabotage your own agent.');

		const line = target.memory[lineIndex];
		if (!line) throw new GameError('That memory line no longer exists.');

		const text = rawText.trim();
		if (text.length > MEMORY_GRANT_CHARS) {
			throw new GameError(`Sabotage is limited to ${MEMORY_GRANT_CHARS} characters.`);
		}

		const before = line.text;
		// First hit only: a line poisoned twice should still show what its *owner*
		// wrote, not the previous liar's version.
		line.originalText ??= line.text;
		line.text = text || '…';
		line.sabotagedBy = actor.name;
		line.sabotagedById = actor.id;
		actor.sabotageUsed = true;
		target.wasSabotaged = true;
		target.sabotagedThisRound = true;

		return { target, before, after: line.text, lineIndex };
	}

	/* --------------------------------------------------- saving and loading */

	exportState(): MatchState {
		return {
			phase: this.phase,
			round: this.round,
			teachingEndsAt: this.teachingEndsAt,
			hostId: this.hostId,
			winnerIds: this.winnerIds,
			startedAt: this.startedAt,
			lastSummary: this.lastSummary,
			reveal: this.reveal,
			previousDeaths: Object.fromEntries(this.previousDeaths),
			players: this.players
		};
	}

	/**
	 * Put a match back the way it was.
	 *
	 * One thing deliberately does not survive: a round that was **in flight**. The
	 * turn loop lives in the runner's stack and is not persisted, so a match
	 * restored mid-round is reopened for teaching instead of resumed halfway
	 * through somebody's turn. Everything that was earned — memory, the fog, who
	 * has spent their sabotage, the round number — is kept.
	 */
	restore(state: MatchState): void {
		this.phase = state.phase === 'running' ? 'teaching' : state.phase;
		this.round = state.round;
		this.teachingEndsAt = state.teachingEndsAt;
		this.hostId = state.hostId;
		this.winnerIds = state.winnerIds;
		this.startedAt = state.startedAt;
		this.lastSummary = state.lastSummary;
		this.reveal = state.reveal;
		this.previousDeaths = new Map(Object.entries(state.previousDeaths));
		this.players = state.players;
		this.memoryLineSeq = state.players.reduce(
			(highest, player) =>
				player.memory.reduce((max, line) => Math.max(max, Number(line.id.slice(1)) || 0), highest),
			0
		);

		// An agent left standing in the middle of the land goes back to the start,
		// because its run is not going to be finished.
		for (const player of this.players) {
			if (player.agent.status === 'running') {
				player.agent = { ...this.freshAgent(), bestDepth: player.agent.bestDepth };
			}
		}

		// The one place a legal identity is guaranteed on the way in. A match stored
		// before these columns existed comes back with every player the same
		// colour, and the uniqueness rule lives in code rather than in a database
		// constraint precisely so that repairing it here is possible at all.
		const seen = new Set<number>();
		for (const player of this.players) {
			const valid =
				Number.isInteger(player.colour) && player.colour >= 0 && player.colour < PALETTE_SIZE;
			if (!valid || seen.has(player.colour)) {
				let next = 0;
				while (next < PALETTE_SIZE && seen.has(next)) next++;
				player.colour = next;
			}
			seen.add(player.colour);

			if (
				!Number.isInteger(player.character) ||
				player.character < 0 ||
				player.character >= CHARACTER_COUNT
			) {
				player.character = player.seat % CHARACTER_COUNT;
			}
		}
	}

	/* --------------------------------------------------------- snapshots */

	private markVisited(nodeId: string): void {
		if (!this.reveal.visitedNodes.includes(nodeId)) {
			this.reveal.visitedNodes.push(nodeId);
		}
	}

	foggedTree(): FoggedTree {
		return buildFoggedTree(this.story, this.reveal);
	}

	publicPlayer(player: Player): PublicPlayer {
		return {
			id: player.id,
			name: player.name,
			seat: player.seat,
			character: player.character,
			colour: player.colour,
			isBot: player.isBot,
			connected: player.connected,
			ready: player.ready,
			memory: player.memory,
			memoryChars: player.memory.reduce((sum, line) => sum + line.text.length, 0),
			agent: player.agent,
			runCount: player.runCount,
			bestDepth: player.agent.bestDepth,
			sabotageUsed: player.sabotageUsed,
			wasSabotaged: player.wasSabotaged,
			sabotagedThisRound: player.sabotagedThisRound,
			pendingGrants: player.pendingGrants,
			lastRun: player.runs.at(-1) ?? null
		};
	}

	snapshot(): GameSnapshot {
		return {
			code: this.code,
			phase: this.phase,
			round: this.round,
			teachingEndsAt: this.teachingEndsAt,
			startsAt: this.startsAt,
			hostId: this.hostId,
			depth: this.story.parSteps,
			players: this.players.map((p) => this.publicPlayer(p)),
			tree: this.foggedTree(),
			winnerIds: this.winnerIds,
			lastSummary: this.lastSummary,
			maxPlayers: SEAT_COUNT,
			paceScale: this.paceScale,
			locale: this.locale
		};
	}
}
