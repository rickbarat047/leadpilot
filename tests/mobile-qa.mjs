// Mobile QA: 390px screenshots + overflow + hamburger checks. Usage: node ./tests/mobile-qa.mjs
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const BASE = process.env.QA_BASE ?? 'http://localhost:3100';
const shots = path.resolve('shots');
fs.mkdirSync(shots, { recursive: true });
const shot = (n) => path.join(shots, `${n}.png`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true });
const results = [];
const overflowNow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

async function snap(name, route) {
  await page.goto(BASE + route, { waitUntil: 'networkidle' });
  await page.screenshot({ path: shot(name), fullPage: true });
  results.push(`${await overflowNow() <= 0 ? 'PASS' : 'FAIL'} ${name} overflow=${await overflowNow()}px`);
}

// home top (fold) + full
await page.goto(BASE + '/', { waitUntil: 'networkidle' });
await page.screenshot({ path: shot('m-home-top') });
results.push(`${await overflowNow() <= 0 ? 'PASS' : 'FAIL'} m-home-top overflow=${await overflowNow()}px`);
await page.screenshot({ path: shot('m-home-full'), fullPage: true });

// hamburger
const toggleVisible = await page.locator('.mobile-toggle').isVisible();
await page.locator('.mobile-toggle').click();
const menuVisible = await page.locator('.mobile-menu').isVisible();
results.push(`${toggleVisible && menuVisible ? 'PASS' : 'FAIL'} hamburger toggle=${toggleVisible} menu=${menuVisible}`);
await page.locator('.mobile-menu a').first().click();
await page.waitForURL('**/how-it-works', { timeout: 8000 }).catch(() => undefined);
results.push(`${page.url().includes('how-it-works') ? 'PASS' : 'FAIL'} hamburger-nav url=${page.url()}`);

await snap('m-pricing', '/pricing');
await snap('m-login', '/login');

// authed dashboard (demo owner)
await page.goto(BASE + '/login', { waitUntil: 'networkidle' });
const inputs = page.locator('form input');
await inputs.nth(0).fill('demo@leadpilot.local');
await inputs.nth(1).fill('demo1234');
await page.getByRole('button', { name: 'Log in' }).click();
await page.waitForURL('**/app', { timeout: 15000 });
await page.screenshot({ path: shot('m-app') });
results.push(`${await overflowNow() <= 0 ? 'PASS' : 'FAIL'} m-app overflow=${await overflowNow()}px`);
await snap('m-leads', '/app/leads');
await snap('m-automations', '/app/automations');
await snap('m-conversations', '/app/conversations');
await snap('m-onboarding', '/onboarding');

await browser.close();
console.log(results.join('\n'));
process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0);
