/**
 * Re-export the ground textures at a size a phone can actually download.
 *
 *   npm i --no-save playwright-core
 *   node scripts/shrink-textures.mjs
 *
 * The spike in doc/testmap-main ships them as 1254x1254 PNGs — about 17 MB for
 * the set, on a game whose whole premise is that you open it on a phone from a
 * QR code. Nothing is lost by shrinking: `textures.ts` box-filtered them down by
 * two on load anyway, so 627 was always the resolution actually sampled.
 *
 * Chrome does the encoding because it is already the dev dependency this repo
 * screenshots with, and `sips` on macOS cannot write WebP.
 *
 * Tiling survives the resample — a plain box filter keeps opposite edges as
 * close as they started — and `analyseSurface` re-checks each file on load and
 * falls back to mirrored tiling if any seam has drifted, so a bad resize
 * degrades quietly instead of showing a grid.
 */
import { chromium } from 'playwright-core';
import { readdirSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { resolve, join, parse } from 'node:path';

const FROM = process.env.FROM ?? 'doc/testmap-main/src/lib/assets/textures';
const TO = process.env.TO ?? 'src/lib/assets/textures';
const SIZE = Number(process.env.SIZE ?? 640);
const QUALITY = Number(process.env.QUALITY ?? 0.82);

const mime = (file) =>
	/\.png$/i.test(file) ? 'image/png' : /\.webp$/i.test(file) ? 'image/webp' : 'image/jpeg';

mkdirSync(TO, { recursive: true });
const sources = readdirSync(FROM).filter((f) => /\.(png|jpe?g|webp)$/i.test(f));
if (!sources.length) throw new Error(`no textures in ${FROM}`);

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage();

let before = 0;
let after = 0;

for (const file of sources) {
	const src = resolve(FROM, file);
	before += statSync(src).size;

	// Handed in as a data URL: the page is about:blank, which is not allowed to
	// fetch file:// on its own.
	const inputUrl = `data:${mime(file)};base64,${readFileSync(src).toString('base64')}`;

	const dataUrl = await page.evaluate(
		async ([url, size, quality]) => {
			const bitmap = await createImageBitmap(await (await fetch(url)).blob());
			const canvas = document.createElement('canvas');
			canvas.width = size;
			canvas.height = size;
			const ctx = canvas.getContext('2d');
			ctx.imageSmoothingQuality = 'high';
			ctx.drawImage(bitmap, 0, 0, size, size);
			return canvas.toDataURL('image/webp', quality);
		},
		[inputUrl, SIZE, QUALITY]
	);

	const out = join(TO, `${parse(file).name}.webp`);
	const bytes = Buffer.from(dataUrl.split(',')[1], 'base64');
	writeFileSync(out, bytes);
	after += bytes.length;
	console.log(`  ${file} -> ${out}  ${(bytes.length / 1024).toFixed(0)} KB`);
}

await browser.close();
console.log(`\n${(before / 1048576).toFixed(1)} MB -> ${(after / 1048576).toFixed(1)} MB`);
