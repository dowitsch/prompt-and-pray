/**
 * Dev-only visual check. Drives the app in a real browser, plays a whole match
 * through the actual UI, and screenshots each stage.
 *
 *   npm run dev            # in another terminal
 *   node scripts/shot.mjs
 *
 * Requires playwright-core (install with `npm i --no-save playwright-core`).
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const OUT = 'screenshots';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome' });
// The home page offers the language the browser asks for, and a match is told in
// whichever one it was created with. Pin it, or the selectors below are a
// coin toss on the machine running this. Set SHOT_LOCALE=de-DE for a German pass.
const page = await browser.newPage({
	viewport: { width: 1440, height: 900 },
	locale: process.env.SHOT_LOCALE ?? 'en-US'
});

const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

const shot = async (name) => {
	await page.screenshot({ path: `${OUT}/${name}.png` });
	console.log(`  ${OUT}/${name}.png`);
};

const short = (label) =>
	label
		.split(/\s+/)
		.filter((w) => w.toLowerCase() !== 'the')
		.at(-1);

await page.goto(process.env.HOMEWARD_ORIGIN ?? `http://localhost:${process.env.PORT ?? 5173}/`, {
	waitUntil: 'networkidle'
});
await shot('1-home');

await page.fill('#name', 'DOWITSCH');
await page.click('button[type=submit]');
await page.waitForURL('**/lobby/**');
await page.waitForTimeout(400);
await shot('2-lobby');

await page.click('button:has-text("Begin the tale")');
await page.waitForURL('**/game/**');

// Round one: everyone sets out together.
await page.waitForTimeout(4500);
await shot('3-round-one');

const teach = page.locator('input[maxlength="20"]').first();
const ready = page.locator('button:has-text("Send them out")');
const written = new Set();
let shotTeaching = false;
let shotSabotage = false;
let shotMidRound = false;

for (let round = 0; round < 40; round++) {
	if (
		await page
			.locator('text=And so')
			.isVisible()
			.catch(() => false)
	)
		break;

	// Wait for the teaching phase to open.
	await ready.waitFor({ state: 'visible', timeout: 90000 }).catch(() => {});
	if (!(await ready.isEnabled().catch(() => false))) {
		if (!shotMidRound) {
			await shot('4-mid-round');
			shotMidRound = true;
		}
		await page.waitForTimeout(1500);
		continue;
	}

	// The recap panel names the choice that killed each agent this round.
	const recap = page.locator('section:has-text("Round")').first();
	const mine = recap.locator('li:has-text("you")').first();
	const killer = (
		await mine
			.locator('.text-blood')
			.first()
			.innerText()
			.catch(() => '')
	).trim();

	let note = killer ? `${short(killer)} kills` : '';
	if (!note || written.has(note)) {
		// Already warned about that one — bank a step that worked instead.
		const safe = await page
			.locator('.text-ember')
			.allInnerTexts()
			.catch(() => []);
		const target = safe
			.map((s) => s.trim())
			.filter((s) => /^[A-Za-z][A-Za-z ]*$/.test(s) && s.length < 14)
			.at(-1);
		note = target ? `${short(target)} is safe` : '';
	}

	if (note && !written.has(note) && note.length <= 20) {
		written.add(note);
		await teach.fill(note);
		if (!shotTeaching) {
			await shot('5-teaching');
			shotTeaching = true;
		}
		await page.click('button:has-text("Inscribe")');
		await page.waitForTimeout(200);
	}

	if (!shotSabotage) {
		const sabotage = page.locator('button:has-text("Mislead")').first();
		if (await sabotage.isEnabled().catch(() => false)) {
			await sabotage.click();
			await page.waitForTimeout(400);
			await shot('6-sabotage');
			await page.fill('input[placeholder="The valley kills"]', 'Valley kills');
			await page.click('button:has-text("Write the lie")');
			shotSabotage = true;
			await page.waitForTimeout(300);
		}
	}

	await ready.click().catch(() => {});
	await page.waitForTimeout(3000);
}

await page.waitForSelector('text=And so', { timeout: 180000 }).catch(() => {});
await page.waitForTimeout(1200);
await shot('7-victory');

console.log(
	errors.length ? `\n  console errors:\n   ${errors.join('\n   ')}` : '\n  no console errors'
);
await browser.close();
