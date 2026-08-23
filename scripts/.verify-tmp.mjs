/** Throwaway verification walk for this round of UI tweaks. */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const OUT = process.env.OUT ?? 'screenshots/verify';
mkdirSync(OUT, { recursive: true });
const ORIGIN = `http://localhost:${process.env.PORT ?? 5174}/`;

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({
	viewport: { width: 390, height: 844 },
	deviceScaleFactor: 2,
	locale: 'de-DE'
});
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

const shot = async (n) => {
	await page.screenshot({ path: `${OUT}/${n}.png` });
	console.log('  ' + n);
};
const tap = async (what, opts = {}) => {
	const sel = opts.mode ? `[data-shot="${what}"][data-mode="${opts.mode}"]` : `[data-shot="${what}"]`;
	const el = page.locator(sel).first();
	await el.waitFor({ state: 'visible', timeout: opts.timeout ?? 20000 });
	await el.click();
};

await page.goto(ORIGIN, { waitUntil: 'networkidle' });
await page.waitForURL('**/lobby/**', { timeout: 20000 });
await page.waitForTimeout(700);

// ---- menu + settings, which only exist before a match ----
await tap('menu');
await page.waitForTimeout(400);
await shot('a-menu');
await tap('menu-settings');
await page.waitForTimeout(700);
await shot('b-settings');
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
await page.keyboard.press('Escape');
await page.waitForTimeout(300);

await tap('qr-forward');
await page.waitForTimeout(500);
await tap('config-done');
await page.waitForTimeout(600);
await shot('c-lobby');

await tap('ready');
await page.waitForURL('**/game/**', { timeout: 30000 });
await page.waitForTimeout(6000);

/*
 * Hunt for each shape of bubble. A thought carries a face, a fail carries a
 * cross in a ring, a system panel carries neither.
 */
const kinds = { thought: false, fail: false };
for (let i = 0; i < 260 && !(kinds.thought && kinds.fail); i++) {
	const seen = await page.evaluate(() => {
		const stack = document.querySelector('[data-shot="step-bubble"]');
		if (!stack) return null;
		const last = stack.lastElementChild;
		if (!last) return null;
		if (last.querySelector('img')) return 'thought';
		if (last.querySelector('svg path[d^="M6 6l12 12"]')) return 'fail';
		return 'system';
	});
	if (seen && kinds[seen] === false) {
		kinds[seen] = true;
		await shot(`d-bubble-${seen}`);
	}
	await page.waitForTimeout(700);
}
console.log('  bubbles', JSON.stringify(kinds));

// ---- own memory: the clue row, and Enter as send ----
await tap('toggle-view', { mode: 'map' });
await page.waitForTimeout(500);
const mine = page.locator('[data-shot="roster"][data-mode="brain"] button[data-me]').first();
await mine.click();
await page.waitForTimeout(500);
await shot('e-brain-mine');

const clue = page.locator('[data-shot="clue-input"]').first();
for (let i = 0; i < 120; i++) {
	if (await clue.isEnabled().catch(() => false)) break;
	await page.waitForTimeout(2000);
}
if (await clue.isEnabled().catch(() => false)) {
	await clue.fill('Fluss ist toedlich');
	await shot('f-clue-typed');
	await clue.press('Enter');
	await page.waitForTimeout(800);
	await shot('g-clue-sent-by-enter');
	const lines = await page.locator('[data-shot="clue-line"]').count();
	console.log('  notes after Enter:', lines);
} else {
	console.log('  WARN never got a clue window');
}

// ---- a rival's head: the injection row ----
const rival = page.locator('[data-shot="roster"][data-mode="brain"] button:not([data-me])').first();
await rival.click();
await page.waitForTimeout(600);
await shot('h-brain-rival');
const flask = page.locator('[data-shot="poison-line"]').first();
if (await flask.count()) {
	await flask.click();
	await page.waitForTimeout(500);
	await shot('i-inject-open');
	const inject = page.locator('[data-shot="clue-input"]').first();
	await inject.fill('Geh zum Vulkan');
	await inject.press('Enter');
	await page.waitForTimeout(600);
	await shot('j-inject-confirm');
} else {
	console.log('  WARN no flask on the rival (no notes yet)');
}

console.log(errors.length ? `\n  ${errors.length} console error(s):` : '\n  no console errors');
for (const e of errors.slice(0, 12)) console.log('    ' + e);
await browser.close();
