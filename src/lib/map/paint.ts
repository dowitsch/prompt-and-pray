/**
 * The few textures the map draws with, painted at runtime.
 *
 * All of them are gradients a dozen lines of canvas can express exactly, and
 * shipping them as files would mean seven more requests and an art pipeline for
 * shapes nobody will ever open in an editor. They are built once per session and
 * cached; a `MeshRope` stretches the road strips along whatever path it is given,
 * so their pixel size only sets how soft the edges are, never how wide the road
 * looks on screen.
 */

const cache = new Map<string, HTMLCanvasElement>();

function paint(key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) {
	const hit = cache.get(key);
	if (hit) return hit;

	const canvas = document.createElement('canvas');
	canvas.width = w;
	canvas.height = h;
	draw(canvas.getContext('2d')!);
	cache.set(key, canvas);
	return canvas;
}

/**
 * The cross-section of a road: a dark casing, a bright core, feathered edges.
 *
 * The casing is the load-bearing part. A plain bright strip disappears wherever
 * the ground happens to be pale — and the ground is procedural, so *somewhere*
 * it always is. Baking dark kerbs into the texture gives every road an outline
 * on any terrain, at no cost: the alternative, a second wider rope underneath
 * each road, doubles the geometry to say the same thing.
 *
 * It survives tinting because tint multiplies: near-black kerbs stay near-black
 * whatever colour is applied, while the white core takes the colour in full.
 * That is what lets one texture serve the bright trail, the faint roads other
 * agents wore in, and a road that turned out to kill.
 */
export function roadStrip(): HTMLCanvasElement {
	return paint('road', 8, 32, (ctx) => {
		ctx.fillStyle = crossSection(ctx, 32);
		ctx.fillRect(0, 0, 8, 32);
	});
}

/** Shared by the plain road and the fading stub, so the two cannot drift apart. */
function crossSection(ctx: CanvasRenderingContext2D, height: number): CanvasGradient {
	const g = ctx.createLinearGradient(0, 0, 0, height);
	g.addColorStop(0, 'rgba(20,22,26,0)');
	g.addColorStop(0.14, 'rgba(20,22,26,0.8)');
	g.addColorStop(0.3, 'rgba(255,255,255,1)');
	g.addColorStop(0.5, 'rgba(255,255,255,1)');
	g.addColorStop(0.7, 'rgba(255,255,255,1)');
	g.addColorStop(0.86, 'rgba(20,22,26,0.8)');
	g.addColorStop(1, 'rgba(20,22,26,0)');
	return g;
}

/**
 * The same road, fading out along its length.
 *
 * This is what makes a choice dissolve into fog: stretched over a stub with
 * `textureScale: 0`, the far end simply stops existing. Doing it in the texture
 * rather than with a mask or a custom shader keeps the stubs in the same batch
 * as every other road.
 */
export function roadFade(): HTMLCanvasElement {
	return paint('road-fade', 64, 32, (ctx) => {
		ctx.fillStyle = crossSection(ctx, 32);
		ctx.fillRect(0, 0, 64, 32);

		// Eat the far end away. `destination-out` keeps the cross-section intact
		// where it survives, which a second opaque gradient would not.
		const along = ctx.createLinearGradient(0, 0, 64, 0);
		along.addColorStop(0, 'rgba(0,0,0,0)');
		along.addColorStop(0.45, 'rgba(0,0,0,0.15)');
		along.addColorStop(1, 'rgba(0,0,0,1)');
		ctx.globalCompositeOperation = 'destination-out';
		ctx.fillStyle = along;
		ctx.fillRect(0, 0, 64, 32);
	});
}

/** A soft round glow. Tinted for the home beacon, the thinking pulse and flashes. */
export function glow(): HTMLCanvasElement {
	return paint('glow', 128, 128, (ctx) => {
		const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
		g.addColorStop(0, 'rgba(255,255,255,1)');
		g.addColorStop(0.32, 'rgba(255,255,255,0.5)');
		g.addColorStop(0.62, 'rgba(255,255,255,0.14)');
		g.addColorStop(1, 'rgba(255,255,255,0)');
		ctx.fillStyle = g;
		ctx.fillRect(0, 0, 128, 128);
	});
}

/**
 * The vignette, drawn once at a fixed size and stretched over the viewport.
 *
 * Only the corners carry any signal, so stretching a small square costs nothing
 * and saves repainting on every resize.
 */
export function vignette(): HTMLCanvasElement {
	return paint('vignette', 256, 256, (ctx) => {
		const g = ctx.createRadialGradient(128, 128, 40, 128, 128, 168);
		g.addColorStop(0, 'rgba(0,0,0,0)');
		g.addColorStop(0.72, 'rgba(0,0,0,0.22)');
		g.addColorStop(1, 'rgba(0,0,0,0.62)');
		ctx.fillStyle = g;
		ctx.fillRect(0, 0, 256, 256);
	});
}
