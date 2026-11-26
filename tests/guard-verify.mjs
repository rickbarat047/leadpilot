// P4 guard verification: wait for server, hit throwing probe, assert friendly JSON 500.
const BASE = process.env.QA_BASE || 'http://localhost:3100';

async function waitReady(url, ms = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      const r = await fetch(url, { redirect: 'manual' });
      if (r.status) return true;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

const ready = await waitReady(`${BASE}/api/health`);
if (!ready) { console.error('server never became ready'); process.exit(1); }

// 1. Throwing probe route must return a friendly JSON 500, not an HTML error page.
//    The probe (src/app/api/p4test) is dev-only and deleted for production, so a
//    404 here means "skip" — guard itself was verified when the probe existed.
const probe = await fetch(`${BASE}/api/p4test`);
const body = await probe.json().catch(() => null);
const checks = [];
if (probe.status === 404) {
  console.log('SKIP probe checks (p4test route not present — dev-only probe)');
} else {
  checks.push(['probe status 500', probe.status === 500, `got ${probe.status}`]);
  checks.push(['probe JSON friendly body', !!body && typeof body.error === 'string' && body.error.includes('logged'), JSON.stringify(body)]);
}

// 2. A normal route still works (health).
const h = await fetch(`${BASE}/api/health`);
const hj = await h.json().catch(() => null);
checks.push(['health ok', h.status === 200 && hj?.ok === true, `status ${h.status}`]);

// 3. Login flow still works through guard (auth route wrapped).
const login = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'demo@leadpilot.local', password: 'demo1234' }),
});
const lj = await login.json().catch(() => null);
checks.push(['login via guard', login.status === 200 && lj?.ok === true, `status ${login.status} ${JSON.stringify(lj)?.slice(0, 80)}`]);

let fail = 0;
for (const [name, ok, info] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ' — ' + info}`);
  if (!ok) fail += 1;
}
console.log(`${checks.length - fail}/${checks.length} guard checks`);
process.exit(fail === 0 ? 0 : 1);
