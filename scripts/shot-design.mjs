/**
 * Dev-only visual check for the story designer.
 *
 *   npm run dev
 *   node scripts/shot-design.mjs
 *
 * Builds a small story through the actual UI — puts places down from the
 * palette, drags roads between them, marks an ending, renames a road — and
 * screenshots each stage. Drag gestures are the part of this app a unit test
 * cannot reach, so they are the part worth driving in a real browser.
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const OUT = 'screenshots/design';
mkdirSync(OUT, { recursive: true });

const ORIGIN = process.env.HOMEWARD_ORIGIN ?? `http://localhost:${process.env.PORT ?? 5173}`;

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1500, height: 900 }, locale: 'en-US' });

const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

const shot = async (name) => {
	await page.screenshot({ path: `${OUT}/${name}.png` });
	console.log(`  ${OUT}/${name}.png`);
};

/** Centre of a place on the canvas, found by its label. */
async function placeAt(title) {
	const handle = page.locator(`svg [aria-label="Place: ${title}"]`).first();
	await handle.waitFor({ timeout: 5000 });
	const box = await handle.boundingBox();
	return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Drag from a place's rim to another place: the gesture that lays a road. */
async function layRoad(fromTitle, toTitle) {
	const rim = page.locator(`svg [aria-label="Lay a road from ${fromTitle}"]`).first();
	const box = await rim.boundingBox();
	const to = await placeAt(toTitle);

	// Start on the rim itself, not the centre — the centre is the drag handle.
	await page.mouse.move(box.x + box.width / 2, box.y + 4);
	await page.mouse.down();
	await page.mouse.move(to.x, to.y, { steps: 12 });
	await page.mouse.up();
	await page.waitForTimeout(500);
}

await page.goto(`${ORIGIN}/design`, { waitUntil: 'networkidle' });
await shot('1-stories');

// A fresh story, so the run is repeatable and never touches the built-in ones.
const name = `Test tale ${Date.now().toString(36).slice(-5)}`;
await page.fill('input[name="name"]', name);
await page.click('button:has-text("Begin")');
await page.waitForURL('**/design/**');
await page.waitForTimeout(600);
await shot('2-new-story');

// Put three places down from the palette.
const canvas = await page.locator('main svg').boundingBox();
const drops = [
	{ template: 'Forest', x: canvas.x + canvas.width * 0.32, y: canvas.y + canvas.height * 0.55 },
	{ template: 'Volcano', x: canvas.x + canvas.width * 0.68, y: canvas.y + canvas.height * 0.55 },
	{ template: 'Gate', x: canvas.x + canvas.width * 0.5, y: canvas.y + canvas.height * 0.8 }
];
for (const drop of drops) {
	await page.click(`aside button:has-text("${drop.template}")`);
	await page.mouse.click(drop.x, drop.y);
	await page.waitForTimeout(450);
}
await shot('3-places-down');

// Roads: the opening forks two ways, and the forest carries on to the gate.
await layRoad('The beginning', 'Forest');
await layRoad('The beginning', 'Volcano');
await layRoad('Forest', 'Gate');
await shot('4-roads-laid');

// Name the roads, so no two out of one place share a word.
const rename = async (from, to, label) => {
	await page.click(`svg [aria-label="Road: ${from}"]`, { force: true }).catch(() => {});
	const field = page.locator('aside input').first();
	if (await field.isVisible().catch(() => false)) {
		await field.fill(label);
		await page.waitForTimeout(700);
	}
};
await rename('A way', null, 'Forest');
await page.waitForTimeout(400);

// Mark the gate as home and the volcano as a death.
await page.click('svg [aria-label="Place: Gate"]');
await page.waitForTimeout(300);
await page.click('button:has-text("Home")');
await page.waitForTimeout(500);
await page.click('svg [aria-label="Place: Volcano"]');
await page.waitForTimeout(300);
await page.click('button:has-text("Death")');
await page.waitForTimeout(500);
await shot('5-endings-marked');

// Tidy it, then see what the validator makes of it.
await page.click('button:has-text("Arrange")');
await page.waitForTimeout(900);
await shot('6-arranged');

const verdict = await page
	.locator('aside:last-of-type section')
	.innerText()
	.catch(() => '(no verdict)');
console.log('\n  validator says:\n' + verdict.replace(/^/gm, '    '));

console.log(
	errors.length ? `\n  console errors:\n   ${errors.join('\n   ')}` : '\n  no console errors'
);
await browser.close();
