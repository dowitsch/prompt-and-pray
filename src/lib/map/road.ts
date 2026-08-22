/**
 * Where the roads actually run.
 *
 * The story designer places nodes on a grid — every death at x = ±210, the main
 * road straight down in steps of 150. That is the right way to *author* a graph
 * and the wrong way to walk one: rendered literally, every journey heads due
 * south along a ruler.
 *
 * So the topology is kept and the geometry is not. Each node is displaced by a
 * hash of its own id, and the road between two nodes is a polyline that wanders
 * on its way. Both are seeded from the story, so every player at the table sees
 * the same land, and re-opening a match redraws it identically. The designer's
 * own canvas still draws from `engine/geometry.ts` and is untouched — the two
 * views agree about what connects to what, which is the part that matters.
 */

import { hashSeed } from '$lib/engine/rng';

export type Point = { x: number; y: number };

/**
 * How far a node may wander from where it was authored.
 *
 * Well under half the 150-unit step between rows: two displaced nodes can drift
 * towards each other by at most 110 units and still never trade places, so the
 * graph reads the same way round however the dice fall.
 */
const NODE_DRIFT = 55;

/** Sideways sway of a road between its endpoints, in world units. */
const ROAD_SWAY = 14;

/** Points per road. Enough that a MeshRope bends smoothly rather than in facets. */
const ROAD_STEPS = 24;

/** A stable 32-bit hash of any number of parts. */
export function hashOf(...parts: (string | number)[]): number {
	return hashSeed(parts.join('/'));
}

/** A hash in [-1, 1], stable across reloads and machines. */
function signed(text: string, salt: number): number {
	return (hashOf(text, salt) / 0xffffffff) * 2 - 1;
}

/** The seed for a whole story. Two matches on the same map look the same. */
export function seedOf(mapName: string, startNode: string): number {
	return hashOf(mapName, startNode);
}

/**
 * Authored positions in, walked positions out.
 *
 * Keyed by node id so callers can look up a place without caring that it moved.
 */
export function meander(
	nodes: readonly { id: string; x: number; y: number }[],
	seed: number
): Map<string, Point> {
	const out = new Map<string, Point>();
	for (const node of nodes) {
		const key = `${seed}:${node.id}`;
		out.set(node.id, {
			x: node.x + signed(key, 1) * NODE_DRIFT,
			y: node.y + signed(key, 2) * NODE_DRIFT
		});
	}
	return out;
}

/**
 * The line a road actually takes between two places.
 *
 * Two sine humps of hashed amplitude and phase, laid along the normal of the
 * direct line, tapered to nothing at both ends so the road meets each place
 * dead on rather than arriving at an angle. Seeded from the choice id: the road
 * from A to B is one road, drawn the same whichever agent is walking it.
 */
export function roadPolyline(from: Point, to: Point, choiceId: string): Point[] {
	const dx = to.x - from.x;
	const dy = to.y - from.y;
	const distance = Math.hypot(dx, dy) || 1;

	// Left normal of the direction of travel.
	const nx = -dy / distance;
	const ny = dx / distance;

	// Longer roads are allowed to wander further, but not without limit.
	const sway = Math.min(ROAD_SWAY, distance * 0.11);
	const a1 = signed(choiceId, 3) * sway;
	const a2 = signed(choiceId, 4) * sway * 0.6;
	const phase = signed(choiceId, 5) * Math.PI;

	const points: Point[] = [];
	for (let i = 0; i <= ROAD_STEPS; i++) {
		const t = i / ROAD_STEPS;
		// sin(pi t) is zero at both ends: the taper is the envelope, not an extra term.
		const taper = Math.sin(Math.PI * t);
		const offset = taper * (a1 * Math.sin(Math.PI * t + phase) + a2 * Math.sin(2 * Math.PI * t));
		points.push({
			x: from.x + dx * t + nx * offset,
			y: from.y + dy * t + ny * offset
		});
	}
	return points;
}

/** Total length of a polyline, and the running length at each point. */
export function measure(points: readonly Point[]): { total: number; at: number[] } {
	const at = [0];
	let total = 0;
	for (let i = 1; i < points.length; i++) {
		total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
		at.push(total);
	}
	return { total, at };
}

/**
 * The point a given fraction along a polyline, plus the heading there.
 *
 * Used both to grow a road as it is walked and to carry the token along it, so
 * the two can never disagree about where the road is.
 */
export function pointAt(
	points: readonly Point[],
	lengths: { total: number; at: number[] },
	fraction: number
): { x: number; y: number; angle: number } {
	const target = Math.max(0, Math.min(1, fraction)) * lengths.total;

	let i = 1;
	while (i < lengths.at.length - 1 && lengths.at[i] < target) i++;

	const a = points[i - 1];
	const b = points[i];
	const span = lengths.at[i] - lengths.at[i - 1] || 1;
	const t = (target - lengths.at[i - 1]) / span;

	return {
		x: a.x + (b.x - a.x) * t,
		y: a.y + (b.y - a.y) * t,
		angle: Math.atan2(b.y - a.y, b.x - a.x)
	};
}

/**
 * The first `fraction` of a polyline, as its own polyline.
 *
 * A MeshRope needs at least two points to exist at all, so a road that has only
 * just started still returns a degenerate two-point stub rather than nothing.
 */
export function prefix(
	points: readonly Point[],
	lengths: { total: number; at: number[] },
	fraction: number
): Point[] {
	if (fraction >= 1) return points.slice();

	const target = Math.max(0, fraction) * lengths.total;
	const out: Point[] = [];
	for (let i = 0; i < points.length; i++) {
		if (lengths.at[i] <= target) out.push(points[i]);
		else break;
	}

	const head = pointAt(points, lengths, fraction);
	out.push({ x: head.x, y: head.y });
	if (out.length < 2) out.unshift({ ...points[0] });
	return out;
}
