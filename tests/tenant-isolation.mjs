// Tenant isolation regression test (P5). Runs against a local server on :3100.
// Verifies that an authenticated tenant cannot touch another tenant's data:
//   1. POST /api/appointments with a foreign lead_id must not flip the victim's
//      lead status, inject a message into their conversation, or queue an email
//      to their contact.
//   2. PUT  /api/conversations with a foreign leadId        → 404
//   3. GET  /api/conversations/<foreign conv>/messages      → 404
//   4. PATCH /api/leads/<foreign lead>                      → 404, no change
// Cleans up the throwaway tenant B directly in sqlite afterwards.
const BASE = process.env.QA_BASE || 'http://localhost:3100';
import { DatabaseSync } from 'node:sqlite';

async function waitReady(url, ms = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { const r = await fetch(url, { redirect: 'manual' }); if (r.status) return true; } catch { /* up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

function cookieOf(res) {
  const list = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  return list.map((c) => c.split(';')[0]).join('; ');
}

async function j(method, path, cookie, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, data, cookie: cookieOf(res) || cookie };
}

if (!(await waitReady(`${BASE}/api/health`))) { console.error('server not ready'); process.exit(1); }

const checks = [];
const ck = (name, ok, info = '') => checks.push([name, ok, info]);

// --- Tenant A: the existing demo business -----------------------------------
const aLogin = await j('POST', '/api/auth/login', null, { email: 'demo@leadpilot.local', password: 'demo1234' });
const cookieA = aLogin.cookie;
ck('A login', aLogin.status === 200, `status ${aLogin.status}`);

const leadsA = await j('GET', '/api/leads', cookieA);
const victim = (leadsA.data?.leads ?? []).find((l) => l.status !== 'Appointment Booked');
ck('A has a victim lead', !!victim, JSON.stringify(leadsA.data)?.slice(0, 120));

const convsA = await j('GET', '/api/conversations', cookieA);
const victimConv = (convsA.data?.conversations ?? []).find((c) => c.lead_id === victim?.id);
ck('A has a victim conversation', !!victimConv, '');

const msgsBefore = await j('GET', `/api/conversations/${victimConv.id}/messages`, cookieA);
const msgCountBefore = (msgsBefore.data?.messages ?? []).length;
const outboxBefore = countOutbox(victim.email);

// --- Tenant B: fresh signup --------------------------------------------------
const emailB = `iso-${Date.now()}@example.com`;
const bSignup = await j('POST', '/api/auth/signup', null, {
  name: 'Iso Tester', email: emailB, password: 'Iso-Test-1234', businessName: 'Iso Corp',
});
const cookieB = bSignup.cookie;
ck('B signup', bSignup.status === 200, `status ${bSignup.status} ${JSON.stringify(bSignup.data)}`);

// --- Attack 1: book an appointment against A's lead --------------------------
const appt = await j('POST', '/api/appointments', cookieB, {
  lead_id: victim.id, customer_name: 'Cross Tenant', service: 'Hack', starts_at: new Date(Date.now() + 86400000).toISOString(),
});
ck('attack: B books with A lead_id → 201 (row lands in B\'s business)', appt.status === 201, `status ${appt.status} ${JSON.stringify(appt.data)}`);

const leadsA2 = await j('GET', '/api/leads', cookieA);
const victimAfter = (leadsA2.data?.leads ?? []).find((l) => l.id === victim.id);
ck('victim lead status unchanged', victimAfter?.status === victim.status, `was ${victim.status}, now ${victimAfter?.status}`);

const msgsAfter = await j('GET', `/api/conversations/${victimConv.id}/messages`, cookieA);
ck('no message injected into victim conversation', (msgsAfter.data?.messages ?? []).length === msgCountBefore,
  `${msgCountBefore} → ${(msgsAfter.data?.messages ?? []).length}`);

const outboxAfter = countOutbox(victim.email);
ck('no email queued to victim contact', outboxAfter === outboxBefore, `${outboxBefore} → ${outboxAfter}`);

// --- Attack 2: attach a conversation to A's lead -----------------------------
const putConv = await j('PUT', '/api/conversations', cookieB, { leadId: victim.id });
ck('attack: B PUT conversation with A leadId → 404', putConv.status === 404, `status ${putConv.status}`);

// --- Attack 3: read A's conversation messages -------------------------------
const peek = await j('GET', `/api/conversations/${victimConv.id}/messages`, cookieB);
ck('attack: B reads A conversation → 404', peek.status === 404, `status ${peek.status}`);

// --- Attack 4: mutate A's lead ----------------------------------------------
const patch = await j('PATCH', `/api/leads/${victim.id}`, cookieB, { status: 'Won' });
ck('attack: B patches A lead → 404', patch.status === 404, `status ${patch.status}`);
const leadsA3 = await j('GET', '/api/leads', cookieA);
const victimFinal = (leadsA3.data?.leads ?? []).find((l) => l.id === victim.id);
ck('victim lead still unchanged after patch attempt', victimFinal?.status === victim.status,
  `was ${victim.status}, now ${victimFinal?.status}`);

// --- Data export isolation ---------------------------------------------------
const exportA = await fetch(`${BASE}/api/business/export`, { headers: { cookie: cookieA } });
const expA = await exportA.json().catch(() => null);
ck('A export 200 + contains own lead', exportA.status === 200 && (expA?.leads ?? []).some((l) => l.id === victim.id),
  `status ${exportA.status}`);
ck('A export is a download', (exportA.headers.get('content-disposition') ?? '').includes('attachment'),
  exportA.headers.get('content-disposition') ?? 'none');

const exportB = await fetch(`${BASE}/api/business/export`, { headers: { cookie: cookieB } });
const expB = await exportB.json().catch(() => null);
const bLeads = expB?.leads ?? [];
ck('B export 200 + scoped to B', exportB.status === 200 && !!expB?.business_id && expB.business_id !== expA?.business_id,
  `status ${exportB.status}`);
ck('B export contains no foreign leads', !bLeads.some((l) => l.id === victim.id),
  `${bLeads.length} leads, foreign present: ${bLeads.some((l) => l.id === victim.id)}`);

// --- Cleanup: remove throwaway tenant B directly (local sqlite only) --------
if (process.env.QA_BASE) {
  console.log('NOTE: QA_BASE set (remote) — skipping DB cleanup of', emailB);
} else {
  await cleanupTenant(emailB);
}

let fail = 0;
for (const [name, ok, info] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ' — ' + info}`);
  if (!ok) fail += 1;
}
console.log(`${checks.length - fail}/${checks.length} tenant-isolation checks`);
process.exit(fail === 0 ? 0 : 1);

// --- helpers -----------------------------------------------------------------
function countOutbox(toAddr) {
  try {
    const db = new DatabaseSync('data/leadpilot.db');
    const row = db.prepare('SELECT COUNT(*) n FROM email_outbox WHERE to_addr=?').get(toAddr);
    db.close();
    return Number(row?.n ?? 0);
  } catch (e) {
    console.log('WARN outbox count failed:', e.message);
    return -1;
  }
}

async function cleanupTenant(email) {
  const db = new DatabaseSync('data/leadpilot.db');
  try {
    const u = db.prepare('SELECT id FROM users WHERE email=?').get(email);
    if (!u) { db.close(); return; }
    const biz = db.prepare('SELECT id FROM businesses WHERE owner_user_id=?').get(u.id);
    if (biz) {
      for (const t of ['leads', 'conversations', 'messages', 'appointments', 'services', 'automations',
        'automation_runs', 'knowledge_entries', 'subscriptions', 'invoices', 'email_outbox', 'audit_logs', 'system_logs']) {
        try { db.prepare(`DELETE FROM ${t} WHERE business_id=?`).run(biz.id); } catch { /* table may differ */ }
      }
      db.prepare('DELETE FROM memberships WHERE business_id=?').run(biz.id);
      db.prepare('DELETE FROM businesses WHERE id=?').run(biz.id);
    }
    db.prepare('DELETE FROM memberships WHERE user_id=?').run(u.id);
    db.prepare('DELETE FROM audit_logs WHERE user_id=?').run(u.id);
    db.prepare('DELETE FROM users WHERE id=?').run(u.id);
    console.log(`cleanup: removed tenant ${email}`);
  } finally {
    db.close();
  }
}
