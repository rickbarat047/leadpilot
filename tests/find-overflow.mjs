// Finds elements wider than the viewport. Usage: node ./tests/find-overflow.mjs <path>
import { chromium } from 'playwright';
const BASE = process.env.QA_BASE ?? 'http://localhost:3100';
const route = process.argv[2] ?? '/app/leads';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
await page.goto(BASE + route, { waitUntil: 'networkidle' });
if (page.url().includes('/login')) {
  const inputs = page.locator('form input');
  await inputs.nth(0).fill('demo@leadpilot.local');
  await inputs.nth(1).fill('demo1234');
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.waitForURL('**/app', { timeout: 15000 });
  await page.goto(BASE + route, { waitUntil: 'networkidle' });
}
const bad = await page.evaluate(() => {
  const out = [];
  document.querySelectorAll('*').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width > 391 && r.width < 3000) {
      const cls = el.className && el.className.baseVal !== undefined ? '' : String(el.className || '');
      out.push(`${el.tagName}.${cls.split(' ').slice(0, 3).join('.')} w=${Math.round(r.width)}`);
    }
  });
  return [...new Set(out)].slice(0, 15);
});
console.log('OVERFLOWERS:\n' + bad.join('\n'));
const tableInfo = await page.evaluate(() => {
  const t = document.querySelector('.table');
  if (!t) return 'no .table';
  const cs = getComputedStyle(t);
  return `table min-width=${cs.minWidth} width=${cs.width} | wrap classes=${t.parentElement?.className}`;
});
console.log(tableInfo);
await browser.close();
