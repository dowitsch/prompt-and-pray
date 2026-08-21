import type { DecisionMap, RevealState, ChoiceOutcome } from './types.ts';
import type { TreeLayout } from './tree.ts';

/**
 * The fogged tree is the *only* view of the map a client ever receives.
 *
 * The silhouette is public — every player can see that the land is eight levels
 * deep and three ways wide. What is secret is which of the three ways at each
 * level is survivable. So geometry ships immediately, while labels and
 * lethality arrive only as agents discover them.
 *
 * Because the browser never imports the map module, the solution is not in the
 * client bundle. Peeking at devtools shows fog, same as everyone else.
 */

export type FoggedNodeKind = 'start' | 'path' | 'death' | 'home' | 'unknown';

export type FoggedNode = {
	id: string;
	x: number;
	y: number;
	level: number;
	lane: 'spine' | 'left' | 'right';
	kind: FoggedNodeKind;
	/** Null until discovered. */
	title: string | null;
	description: string | null;
	epitaph: string | null;
};

export type FoggedEdgeState = 'unknown' | 'safe' | 'lethal';

export type FoggedEdge = {
	choiceId: string;
	from: string;
	to: string;
	d: string;
	labelX: number;
	labelY: number;
	/** Null until an agent has stood at `from` and seen its options. */
	label: string | null;
	state: FoggedEdgeState;
};

export type FoggedTree = {
	mapName: string;
	tagline: string;
	depth: number;
	startNode: string;
	homeNode: string;
	nodes: FoggedNode[];
	edges: FoggedEdge[];
	viewBox: { minX: number; minY: number; width: number; height: number };
};

/** The delta emitted when an agent arrives somewhere and sees its options. */
export type ChoicesRevealed = {
	nodeId: string;
	choices: { choiceId: string; label: string }[];
};

/** The delta emitted when a choice resolves into a node. */
export type NodeRevealed = {
	choiceId: string;
	state: FoggedEdgeState;
	node: {
		id: string;
		kind: FoggedNodeKind;
		title: string;
		description: string;
		epitaph: string | null;
	};
};

function outcomeToState(outcome: ChoiceOutcome): FoggedEdgeState {
	return outcome === 'death' ? 'lethal' : 'safe';
}

/**
 * Build the client's view of the map from the authoritative map plus what has
 * been discovered so far. Used for the initial sync and for reconnects.
 */
export function buildFoggedTree(
	map: DecisionMap,
	layout: TreeLayout,
	reveal: RevealState
): FoggedTree {
	const visited = new Set(reveal.visitedNodes);
	const taken = reveal.takenChoices;

	// A node is discovered if an agent stood on it, or if a choice leading into
	// it has been taken (you learn what a place is by dying in it).
	const discovered = new Set(visited);
	for (const edge of layout.edges) {
		if (taken[edge.choiceId]) discovered.add(edge.to);
	}
	discovered.add(map.startNode);

	const nodes: FoggedNode[] = layout.orderedNodes.map((n) => {
		const source = map.nodes[n.id];
		const known = discovered.has(n.id);
		return {
			id: n.id,
			x: n.x,
			y: n.y,
			level: n.level,
			lane: n.lane,
			kind: known ? n.kind : 'unknown',
			title: known ? source.title : null,
			description: known ? source.description : null,
			epitaph: known ? (source.epitaph ?? null) : null
		};
	});

	const edges: FoggedEdge[] = layout.edges.map((e) => {
		const outcome = taken[e.choiceId];
		// Labels become visible once an agent has stood at the parent node: it
		// is looking at the same three signposts the player is.
		const labelKnown = visited.has(e.from) || Boolean(outcome);
		return {
			choiceId: e.choiceId,
			from: e.from,
			to: e.to,
			d: e.d,
			labelX: e.labelX,
			labelY: e.labelY,
			label: labelKnown ? e.label : null,
			state: outcome ? outcomeToState(outcome) : 'unknown'
		};
	});

	return {
		mapName: map.name,
		tagline: map.tagline,
		depth: map.depth,
		startNode: map.startNode,
		homeNode: map.homeNode,
		nodes,
		edges,
		viewBox: {
			minX: layout.minX,
			minY: layout.minY,
			width: layout.width,
			height: layout.height
		}
	};
}

/** Apply a `ChoicesRevealed` delta in place. Shared so client and server agree. */
export function applyChoicesRevealed(tree: FoggedTree, delta: ChoicesRevealed): void {
	for (const { choiceId, label } of delta.choices) {
		const edge = tree.edges.find((e) => e.choiceId === choiceId);
		if (edge) edge.label = label;
	}
}

/** Apply a `NodeRevealed` delta in place. */
export function applyNodeRevealed(tree: FoggedTree, delta: NodeRevealed): void {
	const edge = tree.edges.find((e) => e.choiceId === delta.choiceId);
	if (edge) {
		edge.state = delta.state;
		edge.label ??= delta.node.title;
	}
	const node = tree.nodes.find((n) => n.id === delta.node.id);
	if (node) {
		node.kind = delta.node.kind;
		node.title = delta.node.title;
		node.description = delta.node.description;
		node.epitaph = delta.node.epitaph;
	}
}
