// Production smoke test: health, homepage, demo login, dashboard, key pages.
// Usage: node ./db/prod-check.mjs  (BASE=https://leadpilot-sepia-six.vercel.app)
const BASE = process.env.BASE ?? 'https://leadpilot-sepia-six.vercel.app';
const results = [];
const ok = (name, pass, extra = '') => results.push(`${pass ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`);

// 1. Health
const h = await fetch(`${BASE}/api/health`).then((r) => r.json()).catch((e) => ({ error: e.message }));
ok('health', h.ok === true && h.checks?.db?.startsWith('ok'), JSON.stringify(h.checks ?? h.error));

// 2. Public pages
for (const p of ['/', '/pricing', '/login', '/signup', '/faq']) {
  const s = await fetch(BASE + p).then((r) => r.status).catch(() => 0);
  ok(`page ${p}`, s === 200, `status=${s}`);
}

// 3. Demo login → dashboard + CRM pages
const lr = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'demo@leadpilot.local', password: 'demo1234' }),
});
const cookie = (lr.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
ok('demo login', lr.status === 200, `status=${lr.status}`);
if (cookie) {
  for (const p of ['/app', '/app/leads', '/app/automations', '/app/billing']) {
    const r = await fetch(BASE + p, { headers: { cookie } });
    ok(`authed ${p}`, r.status === 200, `status=${r.status}`);
  }
}

// 4. Admin login (credentials from .env.neon when not in environment)
import fs from 'node:fs';
const neon = fs.existsSync(new URL('../.env.neon', import.meta.url))
  ? fs.readFileSync(new URL('../.env.neon', import.meta.url), 'utf8')
  : '';
const pick = (k, fb = '') =>
  process.env[k] ??
  neon.split(/\r?\n/).find((l) => l.startsWith(k + '='))?.slice(k.length + 1).trim().replace(/^"(.*)"$/, '$1') ??
  fb;
const ar = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: pick('ADMIN_EMAIL', 'admin@leadpilot.local'), password: pick('ADMIN_PASSWORD') }),
});
ok('admin login', ar.status === 200, `status=${ar.status}`);

console.log(results.join('\n'));
process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0);
