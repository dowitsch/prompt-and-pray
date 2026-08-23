import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync } from 'node:fs';
const [src, out, sx, sy, sw, sh, scale] = process.argv.slice(2);
const b64 = readFileSync(src).toString('base64');
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage();
const url = await page.evaluate(async (a) => {
	const img = new Image();
	img.src = 'data:image/png;base64,' + a.b64;
	await img.decode();
	const c = document.createElement('canvas');
	c.width = a.sw * a.scale; c.height = a.sh * a.scale;
	const ctx = c.getContext('2d');
	ctx.imageSmoothingEnabled = false;
	ctx.drawImage(img, a.sx, a.sy, a.sw, a.sh, 0, 0, c.width, c.height);
	return c.toDataURL('image/png');
}, { b64, sx: +sx, sy: +sy, sw: +sw, sh: +sh, scale: +scale });
writeFileSync(out, Buffer.from(url.split(',')[1], 'base64'));
await browser.close();
