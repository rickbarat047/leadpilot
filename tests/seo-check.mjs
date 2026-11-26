// P6 SEO gate: robots.txt, sitemap.xml, canonical + title tags per page.
// Local by default; QA_BASE for production.
const BASE = process.env.QA_BASE || 'http://localhost:3100';
// Canonicals and sitemap always point at the public site origin (metadataBase),
// even when the checks run against localhost.
const ORIGIN = process.env.QA_BASE || 'https://leadpilot-sepia-six.vercel.app';

async function waitReady(url, ms = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { const r = await fetch(url, { redirect: 'manual' }); if (r.status) return true; } catch { /* up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

const checks = [];
const ck = (n, ok, info = '') => checks.push([n, ok, info]);

if (!(await waitReady(`${BASE}/api/health`))) { console.error('server not ready'); process.exit(1); }

// --- robots.txt ---------------------------------------------------------------
const robots = await fetch(`${BASE}/robots.txt`);
const robotsTxt = await robots.text();
ck('robots 200', robots.status === 200, `status ${robots.status}`);
ck('robots allows /', robotsTxt.includes('Allow: /'), robotsTxt.slice(0, 200));
ck('robots disallows /app', robotsTxt.includes('Disallow: /app'), '');
ck('robots disallows /admin', robotsTxt.includes('Disallow: /admin'), '');
ck('robots disallows /api', robotsTxt.includes('Disallow: /api'), '');
ck('robots points at sitemap', robotsTxt.includes('Sitemap:'), robotsTxt.split('\n').find((l) => l.includes('Sitemap')) ?? '');

// --- sitemap.xml ---------------------------------------------------------------
const smRes = await fetch(`${BASE}/sitemap.xml`);
const smXml = await smRes.text();
ck('sitemap 200 + xml', smRes.status === 200 && smXml.includes('<urlset'), `status ${smRes.status}`);
ck('sitemap has absolute urls', smXml.includes(`<loc>${ORIGIN}`), smXml.slice(0, 120));
const locs = [...smXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
ck('sitemap lists 10 marketing pages', locs.length === 10, `${locs.length}: ${locs.map((u) => u.split('/').pop() || 'home').join(', ')}`);
ck('sitemap excludes app/admin/login', !locs.some((u) => /\/(app|admin|login|signup|api)/.test(u)), '');
ck('sitemap priority numbers', smXml.includes('<priority>1</priority>') && !/<priority>[a-z]/.test(smXml), '');

// --- canonical + title per page -------------------------------------------------
const pages = [
  ['/', 'Turn missed leads into booked customers'],
  ['/pricing', 'Pricing | LeadPilot'],
  ['/features', 'Features | LeadPilot'],
  ['/how-it-works', 'How it works | LeadPilot'],
  ['/industries', 'Built for service businesses | LeadPilot'],
  ['/faq', 'FAQ | LeadPilot'],
  ['/contact', 'Contact | LeadPilot'],
  ['/demo', 'Live demo — try LeadPilot | LeadPilot'],
  ['/privacy', 'Privacy policy | LeadPilot'],
  ['/terms', 'Terms of service | LeadPilot'],
];
for (const [path, wantTitle] of pages) {
  const res = await fetch(`${BASE}${path}`);
  const html = await res.text();
  const canon = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1] ?? '';
  const title = html.match(/<title>([^<]+)<\/title>/)?.[1] ?? '';
  // Next normalizes the root canonical to the bare origin (no trailing slash).
  const wantCanon = path === '/' ? ORIGIN : `${ORIGIN}${path}`;
  ck(`${path} canonical`, canon === wantCanon, `got "${canon}"`);
  ck(`${path} title`, title === wantTitle, `got "${title}"`);
}

// --- auth surface noindex --------------------------------------------------------
const appRes = await fetch(`${BASE}/login`);
const appHtml = await appRes.text();
ck('/login not indexable', appHtml.includes('Disallow: /login') || /robots[^>]*noindex/.test(appHtml) || robotsTxt.includes('Disallow: /login'),
  'disallowed in robots.txt');

let fail = 0;
for (const [n, ok, info] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${n}${ok ? '' : ' — ' + info}`);
  if (!ok) fail += 1;
}
console.log(`${checks.length - fail}/${checks.length} seo checks (${BASE})`);
process.exit(fail === 0 ? 0 : 1);
