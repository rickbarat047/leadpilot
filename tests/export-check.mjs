// Data-export gate: works against local (default) or prod (QA_BASE).
// Logs in as demo, fetches /api/business/export, asserts 200 + download header
// + expected sections + non-empty leads.
const BASE = process.env.QA_BASE || 'http://localhost:3100';

const login = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'demo@leadpilot.local', password: 'demo1234' }),
});
// Always consume the body — an unread response keeps the socket mid-read and
// trips a libuv teardown assertion on Windows at process exit.
await login.json().catch(() => null);
const cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');

const res = await fetch(`${BASE}/api/business/export`, { headers: { cookie } });
const body = await res.json().catch(() => null);

const checks = [];
const ck = (n, ok, info = '') => checks.push([n, ok, info]);

ck('export 200', res.status === 200, `status ${res.status}`);
ck('attachment header', (res.headers.get('content-disposition') ?? '').includes('attachment'),
  res.headers.get('content-disposition') ?? 'none');
ck('business row present', !!body?.business?.id, '');
ck('leads present', Array.isArray(body?.leads) && body.leads.length > 0, `${body?.leads?.length} leads`);
ck('conversations + messages present', Array.isArray(body?.conversations) && Array.isArray(body?.messages),
  `convs ${body?.conversations?.length}, msgs ${body?.messages?.length}`);
ck('services + knowledge present', Array.isArray(body?.services) && Array.isArray(body?.knowledge_entries), '');
ck('export_version + counts', body?.export_version === 1 && typeof body?._counts?.leads === 'number',
  JSON.stringify(body?._counts));
ck('business_id set', typeof body?.business_id === 'string' && body.business_id.length > 0, body?.business_id);

let fail = 0;
for (const [n, ok, info] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${n}${ok ? '' : ' — ' + info}`);
  if (!ok) fail += 1;
}
console.log(`${checks.length - fail}/${checks.length} export checks (${BASE})`);
// Natural exit (no process.exit): forcing exit while fetch sockets are still
// closing trips a libuv teardown assertion on Windows (0xC0000409).
process.exitCode = fail === 0 ? 0 : 1;
