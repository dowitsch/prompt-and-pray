import {
	MAX_PLAYERS,
	MEMORY_GRANT_CHARS,
	type Agent,
	type ChoiceOutcome,
	type DecisionChoice,
	type DecisionMap,
	type DecisionNode,
	type GameStatus,
	type MemoryLine,
	type Player,
	type RevealState,
	type RunRecord
} from './types.ts';
import { layoutTree, type TreeLayout } from './tree.ts';
import {
	buildFoggedTree,
	type ChoicesRevealed,
	type FoggedTree,
	type NodeRevealed
} from './fog.ts';

/**
 * The authoritative game. This class is the only thing in the system that knows
 * which choice is correct — not the client, and emphatically not the LLM. The
 * agent picks a label; `resolveChoice` decides what that label costs.
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
	pendingGrants: number;
	lastRun: RunRecord | null;
};

export type GameSnapshot = {
	code: string;
	status: GameStatus;
	hostId: string;
	depth: number;
	players: PublicPlayer[];
	tree: FoggedTree;
	winnerId: string | null;
	maxPlayers: number;
};

export type ResolveResult = {
	choice: DecisionChoice;
	outcome: ChoiceOutcome;
	toNode: DecisionNode;
	depth: number;
	/** Present when the run ended (death or HOME). */
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

	status: GameStatus = 'lobby';
	players: Player[] = [];
	hostId = '';
	winnerId: string | null = null;
	startedAt = 0;

	private reveal: RevealState = { visitedNodes: [], takenChoices: {} };
	private memoryLineSeq = 0;

	constructor(code: string, map: DecisionMap) {
		this.code = code;
		this.map = map;
		this.layout = layoutTree(map);
	}

	/* ------------------------------------------------------------- lobby */

	addPlayer(id: string, name: string, isBot = false): Player {
		if (this.players.length >= SEAT_COUNT) {
			throw new GameError('This game is full.');
		}
		if (this.status !== 'lobby') {
			throw new GameError('This game has already started.');
		}
		if (this.players.some((p) => p.id === id)) {
			throw new GameError('You are already in this game.');
		}

		const player: Player = {
			id,
			name: name.slice(0, 18) || `Agent ${this.players.length + 1}`,
			seat: this.players.length,
			isBot,
			connected: !isBot,
			ready: isBot,
			memory: [],
			agent: this.freshAgent(),
			runCount: 0,
			runs: [],
			sabotageUsed: false,
			wasSabotaged: false,
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

	start(): void {
		if (this.status !== 'lobby') throw new GameError('Already started.');
		if (this.players.length < 2) throw new GameError('Need at least two agents.');
		this.status = 'running';
		this.startedAt = Date.now();
		// The start node is always visible: every agent begins by looking at it.
		this.markVisited(this.map.startNode);
	}

	/* --------------------------------------------------------------- runs */

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

	canDeploy(id: string): boolean {
		const player = this.getPlayer(id);
		return (
			this.status === 'running' &&
			!this.winnerId &&
			(player.agent.status === 'idle' || player.agent.status === 'dead')
		);
	}

	beginRun(id: string): number {
		const player = this.getPlayer(id);
		if (!this.canDeploy(id)) throw new GameError('That agent cannot be deployed right now.');

		player.runCount += 1;
		player.agent = {
			...this.freshAgent(),
			bestDepth: player.agent.bestDepth,
			status: 'running'
		};
		this.markVisited(this.map.startNode);
		return player.runCount;
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
	 * The LLM chose a label; this decides what happens next.
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
				index: player.runCount,
				decisions: [...player.agent.decisions],
				endedAt: toNode.id,
				survived: outcome === 'win',
				depthReached: player.agent.depth
			};
			player.runs.push(run);
			// Every completed run earns the player their 20 characters.
			if (outcome === 'death') player.pendingGrants += 1;
			if (outcome === 'win' && !this.winnerId) {
				this.winnerId = player.id;
				this.status = 'finished';
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
		if (this.status !== 'running') throw new GameError('The match is not running.');
		if (player.pendingGrants <= 0) {
			throw new GameError('No knowledge to give — finish a run first.');
		}
		if (player.agent.status === 'running') {
			throw new GameError('You cannot teach an agent mid-run.');
		}

		const text = rawText.trim();
		if (!text) throw new GameError('Write something first.');
		if (text.length > MEMORY_GRANT_CHARS) {
			throw new GameError(`Memory is limited to ${MEMORY_GRANT_CHARS} characters.`);
		}

		const line: MemoryLine = {
			id: `m${++this.memoryLineSeq}`,
			text,
			addedOnRun: player.runCount
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

		if (this.status !== 'running') throw new GameError('The match is not running.');
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
			pendingGrants: player.pendingGrants,
			lastRun: player.runs.at(-1) ?? null
		};
	}

	snapshot(): GameSnapshot {
		return {
			code: this.code,
			status: this.status,
			hostId: this.hostId,
			depth: this.map.depth,
			players: this.players.map((p) => this.publicPlayer(p)),
			tree: this.foggedTree(),
			winnerId: this.winnerId,
			maxPlayers: SEAT_COUNT
		};
	}
}
