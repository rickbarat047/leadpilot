// P1 e2e: email outbox flow — owner alert on new lead, follow-up email on due
// tick, everything visible as automation runs (mock mode without RESEND key).
// Usage: node ./tests/email-flow.mjs   (against local server or QA_BASE)
const BASE = process.env.QA_BASE ?? 'http://localhost:3100';
const results = [];
const ok = (name, pass, extra = '') => results.push(`${pass ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`);

// login (demo)
const lr = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'demo@leadpilot.local', password: 'demo1234' }),
});
const cookie = (lr.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
ok('login', lr.status === 200 && !!cookie, `status=${lr.status}`);
if (!cookie) { console.log(results.join('\n')); process.exit(1); }
const H = { 'content-type': 'application/json', cookie };

// 1. New lead via webhook-style source → owner alert email queued+flushed (mock)
const create = await fetch(`${BASE}/api/leads`, {
  method: 'POST', headers: H,
  body: JSON.stringify({ name: 'Outbox Probe', email: 'probe@example.com', source: 'webhook', service: 'AC Repair', message: 'Need servicing' }),
});
const lead = await create.json().catch(() => ({}));
ok('lead created', create.status === 201 && !!lead.id, `status=${create.status}`);

// 2. Owner alert visible as an email run
let runs = (await fetch(`${BASE}/api/automations?runs=1`, { headers: H }).then((r) => r.json())).runs ?? [];
const emailRunsAfterCreate = runs.filter((r) => r.trigger === 'send.email' && r.status === 'ok');
ok('owner alert email run', create.status === 201 && emailRunsAfterCreate.length >= 1,
  `${emailRunsAfterCreate.length} ok send.email run(s)${emailRunsAfterCreate[0] ? ` · last=${emailRunsAfterCreate[0].automation_name}` : ''}`);

// 3. Make the follow-up due, run the tick → follow-up email sent (mock)
await fetch(`${BASE}/api/leads/${lead.id}`, {
  method: 'PATCH', headers: H,
  body: JSON.stringify({ next_followup_at: new Date(Date.now() - 60000).toISOString() }),
});
const tick = await fetch(`${BASE}/api/cron/tick`, { method: 'POST' }).then((r) => r.json()).catch(() => ({}));
ok('tick ran', tick.ok === true, JSON.stringify(tick).slice(0, 160));

runs = (await fetch(`${BASE}/api/automations?runs=1`, { headers: H }).then((r) => r.json())).runs ?? [];
// Email runs are recorded by the outbox (lead_id=''), so attribute by subject.
const followupEmail = runs.find((r) => r.trigger === 'send.email' && r.status === 'ok' && r.steps_json?.includes('quick follow-up'));
ok('follow-up email run', !!followupEmail, followupEmail ? `name=${followupEmail.automation_name}` : 'missing');

// 4. Follow-up message also landed in the conversation
const convs = await fetch(`${BASE}/api/conversations`, { headers: H }).then((r) => r.json()).catch(() => ({}));
const conv = (convs.conversations ?? []).find((c) => c.lead_id === lead.id);
let hasMsg = false;
if (conv) {
  const msgs = await fetch(`${BASE}/api/conversations/${conv.id}/messages`, { headers: H }).then((r) => r.json()).catch(() => ({}));
  hasMsg = (msgs.messages ?? []).some((m) => m.body?.includes('reply YES') || m.body?.includes('What date'));
}
ok('follow-up message in conversation', hasMsg);

// 5. Health shows outbox table live
const h = await fetch(`${BASE}/api/health`).then((r) => r.json());
ok('health outbox metric', typeof h.checks?.emailOutbox === 'string', h.checks?.emailOutbox);

// 6. Stop further follow-ups for the probe lead
await fetch(`${BASE}/api/leads/${lead.id}`, { method: 'PATCH', headers: H, body: JSON.stringify({ status: 'Lost' }) });

console.log(results.join('\n'));
process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0);
