// Billing gate (manual UPI). Local by default; QA_BASE for prod.
// Tests both modes depending on whether UPI_ID is configured on the server.
const BASE = process.env.QA_BASE || 'http://localhost:3100';

async function waitReady(url, ms = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { try { const r = await fetch(url, { redirect: 'manual' }); if (r.status) return true; } catch {} await new Promise((r) => setTimeout(r, 500)); }
  return false;
}
const checks = []; const ck = (n, ok, info = '') => checks.push([n, ok, info]);
if (!(await waitReady(`${BASE}/api/health`))) { console.error('server not ready'); process.exit(1); }

const login = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'demo@leadpilot.local', password: 'demo1234' }) });
await login.json().catch(() => null);
const cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');

const before = await fetch(`${BASE}/api/billing`, { headers: { cookie } });
const beforeJ = await before.json();
const upiConfigured = !!beforeJ.upiConfigured;
ck('billing GET 200', before.status === 200, `status ${before.status}`);
ck('upiConfigured reported', typeof beforeJ.upiConfigured === 'boolean', '');

if (upiConfigured) {
  // Pending path: checkout should NOT activate; should return UPI instructions.
  const co = await fetch(`${BASE}/api/billing`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ plan: 'growth' }) });
  const coJ = await co.json();
  ck('upi checkout 200 pending', co.status === 200 && coJ.pending === true, `status ${co.status} ${JSON.stringify(coJ).slice(0,120)}`);
  ck('upi returns upiId + amount', !!coJ.upiId && coJ.amount === 5999, '');
  ck('upi returns invoiceId', typeof coJ.invoiceId === 'string', coJ.invoiceId);
  // Subscription must stay as it was before (not auto-activated by checkout).
  const beforeSub = beforeJ.subscription;
  const after = await fetch(`${BASE}/api/billing`, { headers: { cookie } });
  const afterJ = await after.json();
  ck('subscription NOT auto-activated', afterJ.subscription?.plan === beforeSub?.plan && afterJ.subscription?.status === beforeSub?.status,
    `before ${beforeSub?.plan}/${beforeSub?.status}, after ${afterJ.subscription?.plan}/${afterJ.subscription?.status}`);
  // Pending invoice visible.
  ck('pending invoice in list', (afterJ.invoices ?? []).some((i) => i.status === 'pending_verification'),
    `${(afterJ.invoices ?? []).map((i) => i.status).join(',')}`);
  // Admin verify (login as admin) activates it.
  const adminLogin = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@leadpilot.local', password: 'LeadPilot-Admin-7913' }) });
  await adminLogin.json().catch(() => null);
  const adminCookie = (adminLogin.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
  const pendingInv = (afterJ.invoices ?? []).find((i) => i.status === 'pending_verification');
  const ver = await fetch(`${BASE}/api/admin/billing/verify`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: adminCookie }, body: JSON.stringify({ invoiceId: pendingInv.id }) });
  const verJ = await ver.json();
  ck('admin verify 200', ver.status === 200 && verJ.ok === true, `status ${ver.status} ${JSON.stringify(verJ)}`);
  // Subscription now active.
  const final = await fetch(`${BASE}/api/billing`, { headers: { cookie } });
  const finalJ = await final.json();
  ck('subscription activated after verify', finalJ.subscription?.plan === 'growth' && finalJ.subscription?.status === 'active',
    `${finalJ.subscription?.plan}/${finalJ.subscription?.status}`);
  const paidInv = (finalJ.invoices ?? []).find((i) => i.id === pendingInv.id);
  ck('invoice marked paid', paidInv?.status === 'paid', paidInv?.status);
} else {
  // Mock path: checkout activates instantly.
  const co = await fetch(`${BASE}/api/billing`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ plan: 'growth' }) });
  const coJ = await co.json();
  ck('mock checkout activates', co.status === 200 && (coJ.mock === true || coJ.ok === true), `status ${co.status} ${JSON.stringify(coJ).slice(0,120)}`);
  const after = await fetch(`${BASE}/api/billing`, { headers: { cookie } });
  const afterJ = await after.json();
  ck('subscription active after mock', afterJ.subscription?.plan === 'growth', `${afterJ.subscription?.plan}/${afterJ.subscription?.status}`);
}

let fail = 0;
for (const [n, ok, info] of checks) { console.log(`${ok ? 'PASS' : 'FAIL'} ${n}${ok ? '' : ' — ' + info}`); if (!ok) fail++; }
console.log(`${checks.length - fail}/${checks.length} billing checks (${BASE})`);
process.exitCode = fail === 0 ? 0 : 1;
