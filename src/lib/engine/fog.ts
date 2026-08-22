import { edgeGeometry, viewBoxFor, type ViewBox } from './geometry.ts';
import type { BiomeId } from '../map/biomes.ts';
import type { ChoiceOutcome, RevealState, StoryGraph } from './types.ts';

/**
 * The fogged graph is the *only* view of the story a client ever receives.
 *
 * The silhouette is public — every player can see the shape of the land, how
 * many ways lead out of each place, and where home is. What is secret is which
 * of those ways is survivable. So geometry ships immediately, while names and
 * lethality arrive only as agents discover them.
 *
 * Because the browser never imports the story loader, the answer is not in the
 * client bundle. Peeking at devtools shows fog, same as everyone else.
 */

export type FoggedNodeKind =
	| 'start'
	| 'path'
	/** A FAILURE ending. */
	| 'death'
	/** A SUCCESS ending. */
	| 'home'
	/** A NEUTRAL ending: the road simply stops. */
	| 'end'
	| 'unknown';

export type FoggedNode = {
	id: string;
	x: number;
	y: number;
	kind: FoggedNodeKind;
	/**
	 * What the land here looks like, or null for whatever the terrain generator
	 * makes of the spot.
	 *
	 * Public, with the position, and for the same reason: the ground has to be
	 * generated before an agent has been anywhere near it, and it is drawn
	 * wherever the camera goes. Knowing there is snow over the next ridge says
	 * nothing about which road out of it kills.
	 */
	biome: BiomeId | null;
	/** Null until discovered. */
	title: string | null;
	description: string | null;
	epitaph: string | null;
	/**
	 * The glyph drawn on the place. Fogged with the title, not with the biome — a
	 * mark on an undiscovered place would be exactly the tell the fog withholds.
	 */
	sigil: string | null;
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
	/** Par for the course: the shortest route home, as a progress denominator. */
	depth: number;
	startNode: string;
	/** Every SUCCESS ending, marked from the start as HOME always was. */
	homeNodes: string[];
	nodes: FoggedNode[];
	edges: FoggedEdge[];
	viewBox: ViewBox;
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
		sigil: string | null;
	};
};

/**
 * Only a FAILURE ending marks a road lethal. Everything else — including a run
 * that merely stopped there — leaves the road honestly drawn as survivable, so
 * later rounds are not taught something untrue.
 */
export function outcomeToState(outcome: ChoiceOutcome): FoggedEdgeState {
	return outcome === 'death' ? 'lethal' : 'safe';
}

export function nodeKind(
	node: { endingType: string | null },
	isStart: boolean
): Exclude<FoggedNodeKind, 'unknown'> {
	if (node.endingType === 'SUCCESS') return 'home';
	if (node.endingType === 'FAILURE') return 'death';
	if (node.endingType === 'NEUTRAL') return 'end';
	return isStart ? 'start' : 'path';
}

/**
 * An ending node's body text *is* its epitaph — the line read out when a run
 * stops there. Anywhere else there is nothing to read out.
 */
function epitaphOf(node: { endingType: string | null; description: string }): string | null {
	return node.endingType ? node.description : null;
}

/**
 * Build the client's view of the story from the authoritative graph plus what
 * has been discovered so far. Used for the initial sync and for reconnects.
 */
export function buildFoggedTree(graph: StoryGraph, reveal: RevealState): FoggedTree {
	const visited = new Set(reveal.visitedNodes);
	const taken = reveal.takenChoices;

	const nodes = Object.values(graph.nodes);

	// A node is discovered if an agent stood on it, or if a choice leading into
	// it has been taken (you learn what a place is by dying in it). SUCCESS
	// endings are public: you can always see what you are walking towards.
	const discovered = new Set(visited);
	discovered.add(graph.startNode);
	for (const home of graph.homeNodes) discovered.add(home);

	const edges: FoggedEdge[] = [];
	for (const from of nodes) {
		for (const choice of from.choices) {
			const to = graph.nodes[choice.nextNode];
			if (!to) continue;

			const outcome = taken[choice.id];
			if (outcome) discovered.add(to.id);

			const geometry = edgeGeometry(from.x, from.y, to.x, to.y);
			edges.push({
				choiceId: choice.id,
				from: from.id,
				to: to.id,
				...geometry,
				// Labels become visible once an agent has stood at the parent node: it
				// is looking at the same signposts the player is.
				label: visited.has(from.id) || outcome ? choice.label : null,
				state: outcome ? outcomeToState(outcome) : 'unknown'
			});
		}
	}

	return {
		mapName: graph.name,
		tagline: graph.tagline,
		depth: graph.parSteps,
		startNode: graph.startNode,
		homeNodes: graph.homeNodes,
		nodes: nodes
			.map((node) => {
				const known = discovered.has(node.id);
				return {
					id: node.id,
					x: node.x,
					y: node.y,
					kind: known ? nodeKind(node, node.id === graph.startNode) : ('unknown' as FoggedNodeKind),
					biome: node.biome,
					title: known ? node.title : null,
					description: known ? node.description : null,
					epitaph: known ? epitaphOf(node) : null,
					sigil: known ? node.sigil : null
				};
			})
			// Painted top to bottom, so a node's card overlaps the one above it
			// rather than the other way round.
			.sort((a, b) => a.y - b.y || a.x - b.x),
		edges,
		viewBox: viewBoxFor(nodes)
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
		node.sigil = delta.node.sigil;
	}
}
