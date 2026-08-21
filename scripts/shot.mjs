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
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

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

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await shot('1-home');

await page.fill('#name', 'DOWITSCH');
await page.click('button[type=submit]');
await page.waitForURL('**/lobby/**');
await page.waitForTimeout(400);
await shot('2-lobby');

await page.click('button:has-text("Start game")');
await page.waitForURL('**/game/**');
await page.waitForTimeout(7000);
await shot('3-board-early');

const teach = page.locator('input[maxlength="20"]').first();
const deploy = page.locator('button:has-text("Deploy agent")');
const written = new Set();
let shotTaught = false;
let shotSabotage = false;

// Play until someone reaches HOME, teaching the agent after every death.
for (let run = 0; run < 40; run++) {
	const victory = page.locator('text=made it home');
	if (await victory.isVisible().catch(() => false)) break;

	// Wait for our agent to be back and teachable.
	await deploy.waitFor({ state: 'visible' }).catch(() => {});
	const ready = await deploy
		.isEnabled()
		.then((e) => e)
		.catch(() => false);
	if (!ready) {
		await page.waitForTimeout(1200);
		continue;
	}

	// The run-result strip lists this run's choices; the fatal one is struck
	// through. Scope to that strip only — scraping the whole page picks up
	// agent names from the rivals panel and teaches the agent nonsense.
	const strip = page.locator('.panel', { hasText: /correct$/ }).first();
	const killer = (
		await strip
			.locator('.line-through')
			.last()
			.innerText()
			.catch(() => '')
	).trim();
	const survived = await strip
		.locator('span:not(.line-through)')
		.allInnerTexts()
		.catch(() => []);

	let note = killer ? `${short(killer)} kills` : '';
	if (!note || written.has(note)) {
		const safe = survived
			.map((s) => s.trim())
			.filter((s) => s && /^[A-Za-z][A-Za-z ]*$/.test(s) && s.length < 14);
		const target = safe.at(-1);
		note = target ? `${short(target)} is safe` : '';
	}

	if (note && !written.has(note) && note.length <= 20) {
		written.add(note);
		await teach.fill(note);
		if (!shotTaught) {
			await shot('5-teaching');
			shotTaught = true;
		}
		await page.click('button:has-text("Add knowledge")');
		await page.waitForTimeout(200);
	}

	if (!shotSabotage) {
		const sabotage = page.locator('button:has-text("Sabotage")').first();
		if (await sabotage.isEnabled().catch(() => false)) {
			await sabotage.click();
			await page.waitForTimeout(400);
			await shot('6-sabotage');
			await page.fill('input[placeholder="Valley kills"]', 'Valley kills');
			await page.waitForTimeout(150);
			await page.click('button:has-text("Corrupt memory")');
			shotSabotage = true;
			await page.waitForTimeout(300);
		}
	}

	if (run === 3) await shot('4-board-mid-match');

	await deploy.click();
	await page.waitForTimeout(2500);
}

await page.waitForSelector('text=made it home', { timeout: 120000 }).catch(() => {});
await page.waitForTimeout(1200);
await shot('7-victory');

console.log(
	errors.length ? `\n  console errors:\n   ${errors.join('\n   ')}` : '\n  no console errors'
);
await browser.close();
