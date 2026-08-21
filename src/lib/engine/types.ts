/**
 * Core data model for HOMEWARD.
 *
 * Everything in `src/lib/engine` is pure TypeScript: no Svelte, no I/O, no
 * `Math.random`. This module is the shared vocabulary between the authoritative
 * server and the client that renders it.
 */

/** What happens when an agent takes a choice. The engine alone decides this. */
export type ChoiceOutcome = 'continue' | 'death' | 'win';

export type DecisionChoice = {
	id: string;
	label: string;
	nextNode: string;
	outcome: ChoiceOutcome;
};

export type DecisionNode = {
	id: string;
	title: string;
	description: string;
	/** Empty for terminal nodes (deaths and HOME). */
	choices: DecisionChoice[];
	/** Flavour text shown when an agent ends its run here. */
	epitaph?: string;
	kind?: 'start' | 'path' | 'death' | 'home';
};

export type DecisionMap = {
	id: string;
	name: string;
	tagline: string;
	startNode: string;
	homeNode: string;
	/** Number of correct decisions needed to get from START to HOME. */
	depth: number;
	nodes: Record<string, DecisionNode>;
};

/* ------------------------------------------------------------------ agents */

export type AgentStatus =
	/** Waiting for its player to deploy it. */
	| 'idle'
	/** Mid-run, walking the tree. */
	| 'running'
	/** Died this run; waiting to be taught and redeployed. */
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

export type RunRecord = {
	index: number;
	decisions: Decision[];
	/** 'home' if the run reached HOME, otherwise the death node id. */
	endedAt: string;
	survived: boolean;
	depthReached: number;
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

export type Player = {
	id: string;
	name: string;
	/** Seat colour index 0..3, used consistently across the whole UI. */
	seat: number;
	isBot: boolean;
	connected: boolean;
	ready: boolean;
	memory: MemoryLine[];
	agent: Agent;
	runCount: number;
	runs: RunRecord[];
	sabotageUsed: boolean;
	/** True once this player has been hit by a sabotage at least once. */
	wasSabotaged: boolean;
	/** Unspent 20-character grants. Earned by finishing a run. */
	pendingGrants: number;
};

/* ------------------------------------------------------------------- games */

export type GameStatus = 'lobby' | 'running' | 'finished';

/** What the client is allowed to know about the map: fog of war. */
export type RevealState = {
	/** Node ids whose choices are visible (an agent has stood here). */
	visitedNodes: string[];
	/** Choice ids some agent has taken, with the outcome it produced. */
	takenChoices: Record<string, ChoiceOutcome>;
};

export const MEMORY_GRANT_CHARS = 20;
export const MAX_PLAYERS = 4;
