import {
	MAX_PLAYERS,
	MEMORY_GRANT_CHARS,
	TEACHING_SECONDS,
	type Agent,
	type ChoiceOutcome,
	type DecisionChoice,
	type DecisionMap,
	type DecisionNode,
	type GamePhase,
	type MemoryLine,
	type Player,
	type RevealState,
	type RoundOutcome,
	type RoundSummary,
	type RunRecord
} from './types.ts';
import { layoutTree, type TreeLayout } from './tree.ts';
import { fmt, strings, type Locale } from '../i18n/index.ts';
import {
	buildFoggedTree,
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
	choice: DecisionChoice;
	outcome: ChoiceOutcome;
	toNode: DecisionNode;
	depth: number;
	run: RunRecord | null;
	revealed: NodeRevealed;
};

export class GameError extends Error {}

const SEAT_COUNT = MAX_PLAYERS;

export class Game {
	readonly code: string;
	readonly map: DecisionMap;
	readonly layout: TreeLayout;
	readonly createdAt = Date.now();

	phase: GamePhase = 'lobby';
	round = 0;
	teachingEndsAt = 0;
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
		map: DecisionMap,
		/** Every player in a match reads and writes the same language. */
		readonly locale: Locale
	) {
		this.code = code;
		this.map = map;
		this.layout = layoutTree(map);
	}

	/* ------------------------------------------------------------- lobby */

	addPlayer(id: string, name: string, isBot = false): Player {
		if (this.players.length >= SEAT_COUNT) throw new GameError('This game is full.');
		if (this.phase !== 'lobby') throw new GameError('This game has already started.');
		if (this.players.some((p) => p.id === id)) throw new GameError('You are already in this game.');

		const player: Player = {
			id,
			name: name.slice(0, 18) || `Agent ${this.players.length + 1}`,
			seat: this.players.length,
			isBot,
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
		this.markVisited(this.map.startNode);
	}

	/* -------------------------------------------------------------- rounds */

	private freshAgent(): Agent {
		return {
			currentNode: this.map.startNode,
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

		this.markVisited(this.map.startNode);
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
			const fatal = run && !run.survived ? (run.decisions.at(-1) ?? null) : null;
			const deathNode = run && !run.survived ? run.endedAt : null;

			return {
				playerId: player.id,
				name: player.name,
				seat: player.seat,
				isBot: player.isBot,
				depth: player.agent.depth,
				survived: player.agent.status === 'home',
				killedBy: fatal?.choiceLabel ?? null,
				epitaph: deathNode ? (this.map.nodes[deathNode]?.epitaph ?? null) : null,
				repeatedMistake: Boolean(deathNode && this.previousDeaths.get(player.id) === deathNode),
				wasSabotaged: player.sabotagedThisRound
			};
		});

		for (const player of this.players) {
			const run = player.runs.at(-1);
			if (run && !run.survived) this.previousDeaths.set(player.id, run.endedAt);
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

	nodeFor(id: string): DecisionNode {
		return this.map.nodes[this.getPlayer(id).agent.currentNode];
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
	 * The single source of truth for correct / wrong / dead / continue / HOME.
	 * The LLM chose a label; this decides what that label costs.
	 */
	resolveChoice(id: string, choiceId: string, reasoning: string): ResolveResult {
		const player = this.getPlayer(id);
		const node = this.nodeFor(id);
		const choice = node.choices.find((c) => c.id === choiceId);
		if (!choice) throw new GameError(`No such choice "${choiceId}" at ${node.id}.`);

		const toNode = this.map.nodes[choice.nextNode];
		const outcome = choice.outcome;

		player.agent.decisions.push({
			nodeId: node.id,
			nodeTitle: node.title,
			choiceId: choice.id,
			choiceLabel: choice.label,
			reasoning,
			outcome,
			at: Date.now() - this.startedAt
		});

		this.reveal.takenChoices[choice.id] = outcome;
		player.agent.currentNode = toNode.id;

		if (outcome !== 'death') {
			player.agent.depth += 1;
			player.agent.bestDepth = Math.max(player.agent.bestDepth, player.agent.depth);
		}

		let run: RunRecord | null = null;

		if (outcome === 'death' || outcome === 'win') {
			player.agent.status = outcome === 'win' ? 'home' : 'dead';
			player.agent.thinking = false;
			run = {
				index: this.round,
				decisions: [...player.agent.decisions],
				endedAt: toNode.id,
				survived: outcome === 'win',
				depthReached: player.agent.depth
			};
			player.runs.push(run);
			// Several agents can arrive in the same step; they all win.
			if (outcome === 'win' && !this.winnerIds.includes(player.id)) {
				this.winnerIds.push(player.id);
			}
		} else {
			this.markVisited(toNode.id);
		}

		return {
			choice,
			outcome,
			toNode,
			depth: player.agent.depth,
			run,
			revealed: {
				choiceId: choice.id,
				state: outcome === 'death' ? 'lethal' : 'safe',
				node: {
					id: toNode.id,
					kind: toNode.kind ?? 'path',
					title: toNode.title,
					description: toNode.description,
					epitaph: toNode.epitaph ?? null
				}
			}
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
		line.text = text || '…';
		line.sabotagedBy = actor.name;
		actor.sabotageUsed = true;
		target.wasSabotaged = true;
		target.sabotagedThisRound = true;

		return { target, before, after: line.text, lineIndex };
	}

	/* --------------------------------------------------------- snapshots */

	private markVisited(nodeId: string): void {
		if (!this.reveal.visitedNodes.includes(nodeId)) {
			this.reveal.visitedNodes.push(nodeId);
		}
	}

	foggedTree(): FoggedTree {
		return buildFoggedTree(this.map, this.layout, this.reveal);
	}

	publicPlayer(player: Player): PublicPlayer {
		return {
			id: player.id,
			name: player.name,
			seat: player.seat,
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
			hostId: this.hostId,
			depth: this.map.depth,
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
