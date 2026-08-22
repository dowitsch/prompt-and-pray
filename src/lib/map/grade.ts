/**
 * The colour grade that makes the terrain belong to this game.
 *
 * The renderer this was ported from draws pen-and-ink on warm parchment: bright
 * greens, turquoise water, white snow. Dropped straight under HOMEWARD's UI it
 * fought everything — white narration on near-white snow, a pale road invisible
 * on pale ground, and a vignette that could not be seen at all. The land has to
 * sit *under* the story, not shout over it.
 *
 * Done here on the pixel buffer rather than as a `ColorMatrixFilter` on the
 * ground container. A filter is a full-screen render pass every frame for a
 * result that never changes; this is a few multiplies per texel, once per
 * section, on a worker thread that has already done far more expensive work to
 * produce them. It also means the grade is part of what gets cached, so nothing
 * re-grades when the camera moves.
 */

/** How much of the original colour survives. 0 is greyscale. */
const SATURATION = 0.42;

/** Overall exposure. The land wants to sit well below the UI's text. */
const GAIN = 0.4;

/**
 * How far everything is pulled towards the app's own dark.
 *
 * Distinct from `GAIN`: gain alone deepens the darks but leaves bright biomes
 * (snow, sand) as glaring plates. Mixing towards a single near-black closes the
 * gap between biomes so the whole map reads as one place at one time of day.
 */
const SETTLE = 0.34;

/** `--color-dark`, so the ground and the chrome agree about what black is. */
const BASE = [0x1c, 0x1f, 0x22];

/**
 * A cool shadow and a warm highlight, which is what stops a desaturated image
 * from reading as dirty grey. Small numbers on purpose — this is a tint, not a
 * colour cast.
 */
const SHADOW = [0.94, 0.99, 1.12];
const HIGHLIGHT = [1.1, 1.02, 0.92];

/** Rec. 709 luma, the weighting that matches how bright a colour looks. */
function luma(r: number, g: number, b: number) {
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Grade an RGBA buffer in place.
 *
 * In place because the buffer is transferred to the main thread immediately
 * afterwards and nothing else will ever read the ungraded version.
 */
export function grade(pixels: Uint8ClampedArray): void {
	for (let i = 0; i < pixels.length; i += 4) {
		const r = pixels[i];
		const g = pixels[i + 1];
		const b = pixels[i + 2];

		const y = luma(r, g, b);
		// Where this texel sits between shadow and highlight, for the split tone.
		const t = y / 255;
		const cool = 1 - t;

		let nr = (y + (r - y) * SATURATION) * GAIN;
		let ng = (y + (g - y) * SATURATION) * GAIN;
		let nb = (y + (b - y) * SATURATION) * GAIN;

		nr *= SHADOW[0] * cool + HIGHLIGHT[0] * t;
		ng *= SHADOW[1] * cool + HIGHLIGHT[1] * t;
		nb *= SHADOW[2] * cool + HIGHLIGHT[2] * t;

		pixels[i] = nr + (BASE[0] - nr) * SETTLE;
		pixels[i + 1] = ng + (BASE[1] - ng) * SETTLE;
		pixels[i + 2] = nb + (BASE[2] - nb) * SETTLE;
	}
}
