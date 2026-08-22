/**
 * The ground, generated off the main thread.
 *
 * `World.render` is a few hundred thousand texels of noise per section and takes
 * tens of milliseconds — on the main thread that is a visible hitch, and it would
 * land precisely when the camera is moving, because moving is what asks for new
 * sections. So the whole terrain model lives here and the main thread only ever
 * receives finished pictures.
 *
 * It answers with an `ImageBitmap`, which is transferable and needs no decode on
 * the far side: Pixi can upload it to the GPU directly. Where `OffscreenCanvas`
 * is missing the raw RGBA buffer is transferred instead and the main thread does
 * the last step itself.
 */

import { grade } from './grade';
import { loadSurfaces } from './textures';
import { TEX_H, TEX_W, World } from './terrain';

export type ToWorker =
	| { type: 'start'; seed: number }
	/** `id` is echoed back so a reply that arrives after a teardown can be dropped. */
	| { type: 'section'; id: number; sx: number; sy: number };

export type FromWorker =
	| { type: 'ready' }
	/** Surfaces have arrived; everything drawn before this was flat colour. */
	| { type: 'dressed' }
	| { type: 'section'; id: number; sx: number; sy: number; bitmap: ImageBitmap }
	| { type: 'section'; id: number; sx: number; sy: number; pixels: Uint8ClampedArray<ArrayBuffer> };

let world: World | undefined;

/**
 * Sections are answered before the textures finish downloading.
 *
 * `terrain.ts` falls back to each biome's flat tint for a surface it has not
 * got, so the first frames are a legible, correctly-shaped map in flat colour
 * rather than a blank hold. Once the textures land the main thread is told, and
 * it asks for the same sections again.
 */
async function dress(seed: number) {
	const surfaces = await loadSurfaces();
	world = new World(seed, surfaces);
	post({ type: 'dressed' });
}

function post(message: FromWorker, transfer: Transferable[] = []) {
	(self as unknown as Worker).postMessage(message, transfer);
}

self.onmessage = (event: MessageEvent<ToWorker>) => {
	const message = event.data;

	if (message.type === 'start') {
		world = new World(message.seed);
		post({ type: 'ready' });
		void dress(message.seed);
		return;
	}

	if (!world) return;

	const { id, sx, sy } = message;
	const pixels = world.render(sx, sy);
	grade(pixels);

	if (typeof OffscreenCanvas === 'undefined') {
		post({ type: 'section', id, sx, sy, pixels }, [pixels.buffer]);
		return;
	}

	const canvas = new OffscreenCanvas(TEX_W, TEX_H);
	canvas.getContext('2d')!.putImageData(new ImageData(pixels, TEX_W, TEX_H), 0, 0);
	const bitmap = canvas.transferToImageBitmap();
	post({ type: 'section', id, sx, sy, bitmap }, [bitmap]);
};
