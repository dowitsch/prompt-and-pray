/* Straight to the finish: ready up, then poll for the winner card. */
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ channel: 'chrome' });
const page = await (await browser.newContext({
	viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'de-DE'
})).newPage();
const errs = [];
page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));

await page.goto('http://localhost:5180/', { waitUntil: 'networkidle' });
await page.waitForURL('**/lobby/**', { timeout: 20000 });
await page.locator('[data-shot="qr-forward"]').click();
await page.waitForTimeout(500);
await page.locator('[data-shot="config-done"]').click();
await page.waitForTimeout(400);
await page.locator('[data-shot="ready"]').click();
await page.waitForURL('**/game/**', { timeout: 30000 });
console.log('match started at', page.url());

for (let i = 0; i < 400; i++) {
	const card = page.locator('div[role="dialog"] img[src^="/characters/"]');
	if (await card.count()) {
		await page.waitForTimeout(1000);
		await page.screenshot({ path: 'screenshots/9-end.png' });
		console.log('end card at', page.url());
		break;
	}
	if (!page.url().includes('/game/')) { console.log('left the match:', page.url()); break; }
	await page.waitForTimeout(3000);
}
console.log(errs.length ? errs.slice(0, 8).join('\n') : 'no console errors');
await browser.close();
