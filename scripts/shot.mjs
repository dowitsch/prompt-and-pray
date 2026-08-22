/**
 * Dev-only visual check. Drives the app in a real browser at phone size, walks
 * a whole match through the actual UI, and screenshots every screen.
 *
 *   npm run dev            # in another terminal
 *   node scripts/shot.mjs
 *
 * Requires playwright-core (install with `npm i --no-save playwright-core`).
 *
 * Selectors are `data-shot` attributes rather than visible text: the UI is
 * bilingual and almost every control in it is an unlabelled icon, so matching on
 * words would be both language-dependent and mostly impossible.
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const OUT = 'screenshots';
mkdirSync(OUT, { recursive: true });

const PORT = process.env.PORT ?? 5173;
const ORIGIN = process.env.PP_ORIGIN ?? `http://localhost:${PORT}/`;

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({
	// The design is drawn for this. Anything else is testing the fallback.
	viewport: { width: 390, height: 844 },
	deviceScaleFactor: 2,
	locale: process.env.SHOT_LOCALE ?? 'de-DE'
});

const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

const shot = async (name) => {
	await page.screenshot({ path: `${OUT}/${name}.png` });
	console.log(`  ${OUT}/${name}.png`);
};

/**
 * Hold until the map has land under it.
 *
 * The terrain is generated in a worker and streamed in a section at a time, so
 * a fixed pause races it: on a cold cache the shot caught bare background, and
 * the reviewer could not tell a slow worker from a broken one. Waiting on the
 * canvas and then giving the first sections a beat makes the frames comparable
 * between runs. The canvas is optional on purpose — a machine with no working
 * WebGL still plays the game, and the run should say so rather than fail.
 */
const settled = async () => {
	await page
		.locator('[data-shot="map-canvas"] canvas')
		.first()
		.waitFor({ state: 'attached', timeout: 15000 })
		.catch(() => console.log('  (no map canvas — flat ground)'));
	await page.waitForTimeout(5000);
};

const tap = async (what, { optional = false } = {}) => {
	const target = page.locator(`[data-shot="${what}"]`).first();
	try {
		await target.waitFor({ state: 'visible', timeout: optional ? 2500 : 20000 });
	} catch {
		if (optional) return false;
		throw new Error(`never saw [data-shot="${what}"]`);
	}
	await target.click();
	return true;
};

await page.goto(ORIGIN, { waitUntil: 'networkidle' });

// The front door mints a round and the reducer carries us into it.
await page.waitForURL('**/lobby/**', { timeout: 20000 });
await page.waitForTimeout(600);
await shot('1-qr');

await tap('qr-forward');
await page.waitForTimeout(500);
await shot('2-config');

// Prove the colour picker actually talks to the server.
const swatch = page.locator('[data-shot="swatch"]:not([disabled])').nth(2);
if (await swatch.count()) {
	await swatch.click();
	await page.waitForTimeout(300);
}
await shot('2-config-colour');

await tap('config-done');
await page.waitForTimeout(500);
await shot('3-lobby');

// Everyone ready starts the count; the empty seats fill with simulated rivals.
await tap('ready');
await page.waitForTimeout(1200);
await shot('3-countdown');

await page.waitForURL('**/game/**', { timeout: 20000 });
await settled();
await shot('4-map');

// Wait for a clue window, then spend the ration.
const clue = page.locator('[data-shot="clue-input"]');
await clue.waitFor({ state: 'visible', timeout: 120000 });
for (let attempt = 0; attempt < 40; attempt++) {
	if (await clue.isEnabled().catch(() => false)) break;
	await page.waitForTimeout(2000);
}
if (await clue.isEnabled().catch(() => false)) {
	await clue.fill('River kills');
	await shot('5-clue');
	await tap('clue-send');
	await page.waitForTimeout(600);
}
await shot('5-map-written');

/*
 * The spotlight. While a round runs the screen must belong to whoever's turn it
 * is, not to the local player — that is the whole point of the feature, and the
 * only way to see it is to watch the panel's name change as the turns pass.
 */
const spotlight = page.locator('[data-shot="spotlight-name"]');
const mine = (await spotlight.textContent().catch(() => ''))?.trim() ?? '';
const strip = page.locator('[data-shot="turn-strip"]');
await strip.waitFor({ state: 'visible', timeout: 60000 }).catch(() => {});

const seen = new Set();
for (let i = 0; i < 40; i++) {
	if (!(await strip.isVisible().catch(() => false))) break;
	const name = (await spotlight.textContent().catch(() => ''))?.trim() ?? '';
	if (name && !seen.has(name)) {
		seen.add(name);
		await shot(`5-spotlight-${seen.size}`);
	}
	await page.waitForTimeout(1500);
}
console.log(`  spotlight  mine=${mine} saw=[${[...seen].join(', ')}]`);
if (![...seen].some((name) => name !== mine)) {
	console.log('  WARN       the spotlight never left the local player');
}

// The other side of the toggle: somebody's whole history.
await tap('toggle-view');
await page.waitForTimeout(600);
await shot('6-brain-mine');

// Switch to a rival and try to plant a line in their head.
const rival = page.locator('[data-shot="roster"] button:not([data-me])').first();
if (await rival.count()) {
	await rival.click();
	await page.waitForTimeout(600);
	await shot('6-brain-rival');

	const line = page.locator('[data-shot="clue-line"]').first();
	if (await line.count()) {
		await line.click();
		await page.waitForTimeout(300);
		const inject = page.locator('[data-shot="clue-input"]');
		if (await inject.isEnabled().catch(() => false)) {
			await inject.fill('Trust the cave');
			await shot('7-inject-typed');
			await tap('clue-send');
			await page.waitForTimeout(500);
			await shot('7-inject-confirm');
			await tap('confirm-yes', { optional: true });
			await page.waitForTimeout(800);
			await shot('7-inject-done');
		}
	}
}

// The global menu and its two double-confirms.
await tap('menu');
await page.waitForTimeout(400);
await shot('8-menu');
await tap('menu-rules');
await page.waitForTimeout(400);
await shot('8-rules');
await page.keyboard.press('Escape');
await page.waitForTimeout(300);

console.log(errors.length ? `\n  ${errors.length} console error(s):` : '\n  no console errors');
for (const error of errors.slice(0, 12)) console.log(`    ${error}`);

await browser.close();
process.exit(errors.length ? 1 : 0);
