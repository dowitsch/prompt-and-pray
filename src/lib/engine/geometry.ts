/**
 * Edge geometry for an arbitrary story graph.
 *
 * The old `layoutTree` both *placed* nodes and drew the curves between them. It
 * could only ever draw one shape: a spine with deaths hanging off it. Now that
 * positions are authored and persisted, placement is gone and only the drawing
 * is left — but it has to cope with what a graph can actually contain:
 *
 *  - a road that runs downhill (the common case, drawn as it always was);
 *  - a road that runs sideways or *back uphill*, where reconvergence and
 *    setbacks lead;
 *  - a road that returns to where it started.
 *
 * Both this module and the designer's canvas draw from it, so a story looks the
 * same while it is being built as it does while it is being played.
 */

export type EdgeGeometry = {
	/** SVG path data. */
	d: string;
	/** A point on the curve, for the choice label. */
	labelX: number;
	labelY: number;
};

/** Radius of the lobe drawn for a node that leads back to itself. */
const SELF_LOOP_R = 30;

/**
 * How far a sideways or uphill edge bows away from the straight line.
 *
 * The bow is taken along the *left* normal of the direction of travel, which
 * flips when the direction does. So `A → B` and `B → A` bow to opposite sides
 * and a two-node cycle reads as two distinct roads rather than one road drawn
 * twice.
 */
const MAX_BOW = 78;

/**
 * Below this, an edge is drawn as a downhill road with vertical tangents; above
 * it, as a bow. Measured as |dx| against dy, so a road that drops a long way
 * while drifting sideways still reads as going downhill.
 */
const DOWNHILL_RATIO = 0.4;

export function edgeGeometry(x1: number, y1: number, x2: number, y2: number): EdgeGeometry {
	const dx = x2 - x1;
	const dy = y2 - y1;
	const distance = Math.hypot(dx, dy);

	// Leads back to itself: a lobe off the right-hand side.
	if (distance < 1) {
		const r = SELF_LOOP_R;
		return {
			d: `M ${x1} ${y1} C ${x1 + r * 2} ${y1 - r}, ${x1 + r * 2} ${y1 + r}, ${x1} ${y1}`,
			labelX: x1 + r * 1.6,
			labelY: y1
		};
	}

	// Downhill: the shape the board has always had.
	if (dy > Math.abs(dx) * DOWNHILL_RATIO) {
		const k = dy * 0.5;
		return {
			d: `M ${x1} ${y1} C ${x1} ${y1 + k}, ${x2} ${y2 - k}, ${x2} ${y2}`,
			// A cubic with symmetric vertical tangents passes through the midpoint.
			labelX: (x1 + x2) / 2,
			labelY: (y1 + y2) / 2
		};
	}

	// Sideways or uphill: bow along the left normal.
	const nx = -dy / distance;
	const ny = dx / distance;
	const bow = Math.min(MAX_BOW, distance * 0.35);
	const cx = (x1 + x2) / 2 + nx * bow;
	const cy = (y1 + y2) / 2 + ny * bow;

	return {
		d: `M ${x1} ${y1} Q ${cx} ${cy}, ${x2} ${y2}`,
		// The midpoint of a quadratic at t = 0.5.
		labelX: 0.25 * x1 + 0.5 * cx + 0.25 * x2,
		labelY: 0.25 * y1 + 0.5 * cy + 0.25 * y2
	};
}

/** Padding around the outermost nodes, in map units. */
const PADDING = 100;

/**
 * Smallest window the map is ever shown through.
 *
 * Without a floor, a story of four places fits in a few hundred map units and
 * gets scaled up until each place fills the screen and every label collides.
 * A node is drawn at a fixed radius in map units, so the window has to stay big
 * enough for that radius to look like a place rather than a planet. Roughly four
 * rows of the layout, which is what the board was tuned against.
 */
const MIN_WIDTH = 900;
const MIN_HEIGHT = 700;

export type ViewBox = { minX: number; minY: number; width: number; height: number };

/** Widen a span to at least `least`, keeping whatever it held in the middle. */
function atLeast(min: number, size: number, least: number): [number, number] {
	if (size >= least) return [min, size];
	return [min - (least - size) / 2, least];
}

export function viewBoxFor(nodes: { x: number; y: number }[]): ViewBox {
	if (!nodes.length) {
		return { minX: -MIN_WIDTH / 2, minY: -MIN_HEIGHT / 2, width: MIN_WIDTH, height: MIN_HEIGHT };
	}

	const xs = nodes.map((n) => n.x);
	const ys = nodes.map((n) => n.y);
	const left = Math.min(...xs) - PADDING;
	const top = Math.min(...ys) - PADDING;

	const [minX, width] = atLeast(left, Math.max(...xs) + PADDING - left, MIN_WIDTH);
	const [minY, height] = atLeast(top, Math.max(...ys) + PADDING - top, MIN_HEIGHT);

	return { minX, minY, width, height };
}
