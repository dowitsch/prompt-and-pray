import type { DecisionMap } from './types.ts';

/**
 * Deterministic layout for a decision map.
 *
 * The surviving path (the "spine") runs straight down the centre; the fatal
 * choices at each level splay out to the left and right and terminate. The
 * layout makes no assumptions about a specific map beyond "follow the
 * continue/win edges to find the spine", so a second map lays out for free.
 */

export type LaidOutNode = {
	id: string;
	x: number;
	y: number;
	/** Distance in decisions from START. */
	level: number;
	lane: 'spine' | 'left' | 'right';
	kind: 'start' | 'path' | 'death' | 'home';
};

export type LaidOutEdge = {
	/** Unique per edge: the choice id that traverses it. */
	choiceId: string;
	label: string;
	from: string;
	to: string;
	/** SVG cubic-bezier path data. */
	d: string;
	/** Midpoint of the curve, for the choice label. */
	labelX: number;
	labelY: number;
	lethal: boolean;
};

export type TreeLayout = {
	nodes: Record<string, LaidOutNode>;
	orderedNodes: LaidOutNode[];
	edges: LaidOutEdge[];
	width: number;
	height: number;
	minX: number;
	minY: number;
};

const Y_STEP = 150;
const X_SPREAD = 210;
/** Deaths hang between their parent level and the next one. */
const DEATH_DROP = 0.66;
const PADDING = 90;

function curve(x1: number, y1: number, x2: number, y2: number): string {
	const dy = (y2 - y1) * 0.5;
	return `M ${x1} ${y1} C ${x1} ${y1 + dy}, ${x2} ${y2 - dy}, ${x2} ${y2}`;
}

export function layoutTree(map: DecisionMap): TreeLayout {
	const nodes: Record<string, LaidOutNode> = {};
	const edges: LaidOutEdge[] = [];

	let cursor: string | undefined = map.startNode;
	let level = 0;

	while (cursor) {
		const node = map.nodes[cursor];
		if (!node) break;

		nodes[cursor] = {
			id: cursor,
			x: 0,
			y: level * Y_STEP,
			level,
			lane: 'spine',
			kind: node.kind ?? (level === 0 ? 'start' : 'path')
		};

		let next: string | undefined;
		let fatalIndex = 0;

		for (const choice of node.choices) {
			const parent = nodes[cursor];

			if (choice.outcome === 'death') {
				// Alternate left / right, stepping further out for any extra deaths.
				const side = fatalIndex % 2 === 0 ? -1 : 1;
				const tier = 1 + Math.floor(fatalIndex / 2) * 0.75;
				const x = side * X_SPREAD * tier;
				const y = parent.y + Y_STEP * DEATH_DROP;
				fatalIndex++;

				nodes[choice.nextNode] = {
					id: choice.nextNode,
					x,
					y,
					level: level + 1,
					lane: side === -1 ? 'left' : 'right',
					kind: 'death'
				};
				edges.push({
					choiceId: choice.id,
					label: choice.label,
					from: cursor,
					to: choice.nextNode,
					d: curve(parent.x, parent.y, x, y),
					labelX: (parent.x + x) / 2,
					labelY: (parent.y + y) / 2,
					lethal: true
				});
				continue;
			}

			// 'continue' or 'win' — this is the spine.
			const childY = (level + 1) * Y_STEP;
			edges.push({
				choiceId: choice.id,
				label: choice.label,
				from: cursor,
				to: choice.nextNode,
				d: curve(parent.x, parent.y, 0, childY),
				labelX: 0,
				labelY: (parent.y + childY) / 2,
				lethal: false
			});
			next = choice.nextNode;
		}

		cursor = next;
		level++;
	}

	const all = Object.values(nodes);
	const xs = all.map((n) => n.x);
	const ys = all.map((n) => n.y);
	const minX = Math.min(...xs) - PADDING;
	const minY = Math.min(...ys) - PADDING;
	const maxX = Math.max(...xs) + PADDING;
	const maxY = Math.max(...ys) + PADDING;

	return {
		nodes,
		orderedNodes: all.sort((a, b) => a.y - b.y || a.x - b.x),
		edges,
		minX,
		minY,
		width: maxX - minX,
		height: maxY - minY
	};
}
