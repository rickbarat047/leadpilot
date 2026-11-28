// Safe booking integration check. Refuses any QA_BASE that is not a local server.
// Uses seeded demo data only; never calls production, sends real messages or payments.
const base = (process.env.QA_BASE || '').replace(/\/+$/, '');
if (!/^http:\/\/(localhost|127\.0\.0\.1):3100$/.test(base)) {
  console.error('REFUSED: QA_BASE must be http://localhost:3100 or http://127.0.0.1:3100');
  process.exit(2);
}

let cookie = '';
async function req(path, { method = 'GET', body, auth = true } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(auth && cookie ? { cookie } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  return { status: res.status, data };
}

function check(name, condition, detail = '') {
  if (!condition) {
    console.error(`FAIL ${name}${detail ? ` — ${detail}` : ''}`);
    process.exitCode = 1;
    throw new Error(name);
  }
  console.log(`PASS ${name}`);
}

async function createLead(name, email) {
  const r = await req('/api/leads', {
    method: 'POST',
    body: { name, email, service: 'Demo Service', source: 'manual', message: '' },
  });
  check(`create lead ${name}`, r.status === 201 && r.data?.id, JSON.stringify(r));
  const conv = await req('/api/conversations', { method: 'PUT', body: { leadId: r.data.id } });
  check(`ensure conversation for ${name}`, conv.status === 200 && Boolean(conv.data?.id), JSON.stringify(conv));
  return { leadId: r.data.id, conversationId: conv.data.id, name, email };
}

async function offerFor(conversationId) {
  const r = await req(`/api/conversations/${conversationId}/messages`, { method: 'POST', body: { body: 'I want to book an appointment', sender: 'lead' } });
  check('booking enquiry accepted', r.status === 200, JSON.stringify(r));
  const list = await req(`/api/conversations/${conversationId}/messages`);
  const offerMessage = [...(list.data?.messages || [])].reverse().find((m) => {
    try { return m.sender === 'ai' && JSON.parse(m.meta_json || '{}').type === 'slot_offer'; } catch { return false; }
  });
  check('numbered slot offer persisted', Boolean(offerMessage), JSON.stringify(list).slice(0, 500));
  const offer = JSON.parse(offerMessage.meta_json);
  check('exactly three options', offer.options?.length === 3, JSON.stringify(offer));
  for (let i = 1; i <= 3; i += 1) {
    check(`option ${i} label present`, offerMessage.body.includes(`${i}. ${offer.options[i - 1].label}`), offerMessage.body);
  }
  return offer;
}

const seed = await req('/api/demo/seed', { method: 'POST', auth: false });
check('local demo seeded', seed.status === 200 && seed.data?.businessId, JSON.stringify(seed));

const login = await req('/api/auth/login', {
  method: 'POST',
  auth: false,
  body: { email: seed.data.login.email, password: seed.data.login.password },
});
check('demo login', login.status === 200 && cookie.startsWith('lp_session='), JSON.stringify(login));

const now = new Date();
const days = {};
for (const key of ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']) days[key] = { open: true, start: '10:00', end: '20:00' };
const hours = { version: 1, timezone: 'Asia/Kolkata', status: 'configured', days };
const put = await req('/api/business', { method: 'PUT', body: { hours } });
check('business hours saved', put.status === 200, JSON.stringify(put));

const lead = await createLead('QA Booking Customer', 'qa-customer@example.invalid');
const offer = await offerFor(lead.conversationId);
const selected = offer.options[0];

const select = await req(`/api/conversations/${lead.conversationId}/messages`, { method: 'POST', body: { body: '1', sender: 'lead' } });
check('slot selection accepted', select.status === 200, JSON.stringify(select));

let list = await req(`/api/conversations/${lead.conversationId}/messages`);
const confirmation = [...(list.data?.messages || [])].reverse().find((m) => /booked|confirmed/i.test(m.body || '') && m.sender === 'ai');
check('conversation confirmation inserted', Boolean(confirmation), JSON.stringify(list).slice(0, 800));

let appointments = await req('/api/appointments');
const booked = (appointments.data?.appointments || []).filter((a) => a.lead_id === lead.leadId);
check('exactly one appointment created', booked.length === 1, JSON.stringify(booked));
check('appointment start matches offered slot', booked[0]?.starts_at === selected.startsAt, `${booked[0]?.starts_at} vs ${selected.startsAt}`);
check('appointment end respects server duration', booked[0]?.ends_at === new Date(new Date(selected.startsAt).getTime() + offer.durationMin * 60000).toISOString(), `${booked[0]?.ends_at}`);

const leads = await req('/api/leads');
const leadRow = (leads.data?.leads || []).find((l) => l.id === lead.leadId);
check('lead status updated', leadRow?.status === 'Appointment Booked', JSON.stringify(leadRow));
check('follow-up cleared', !leadRow?.next_followup_at, JSON.stringify(leadRow));

// A second lead cannot take the same slot through the manual API.
const other = await createLead('QA Conflict Customer', 'qa-conflict@example.invalid');
const conflict = await req('/api/appointments', {
  method: 'POST',
  body: { customer_name: other.name, lead_id: other.leadId, service: 'Demo Service', starts_at: selected.startsAt },
});
check('overlapping booking rejected', conflict.status === 409, JSON.stringify(conflict));

// Concurrent attempts for the same slot: exactly one succeeds.
const c1 = await createLead('QA Race One', 'qa-race1@example.invalid');
const c2 = await createLead('QA Race Two', 'qa-race2@example.invalid');
const raceStart = offer.options[1].startsAt;
const [r1, r2] = await Promise.all([c1, c2].map((c) => req('/api/appointments', {
  method: 'POST',
  body: { customer_name: c.name, lead_id: c.leadId, service: 'Demo Service', starts_at: raceStart },
})));
check('concurrent race has exactly one winner', [r1.status, r2.status].filter((s) => s === 201).length === 1, `${r1.status}/${r2.status}`);
check('concurrent loser rejected as conflict', [r1.status, r2.status].includes(409), `${r1.status}/${r2.status}`);

// Repeating the original selection must not create a duplicate appointment.
const repeat = await req(`/api/conversations/${lead.conversationId}/messages`, { method: 'POST', body: { body: '1', sender: 'lead' } });
check('repeat selection handled', repeat.status === 200, JSON.stringify(repeat));
appointments = await req('/api/appointments');
check('no duplicate appointment after retry', (appointments.data?.appointments || []).filter((a) => a.lead_id === lead.leadId).length === 1);

// Manual API validation paths.
const overlap = await req('/api/appointments', {
  method: 'POST',
  body: { customer_name: 'QA Overlap', service: 'Demo Service', starts_at: new Date(new Date(selected.startsAt).getTime() + 30 * 60000).toISOString() },
});
check('manual overlap rejected', overlap.status === 409, JSON.stringify(overlap));
const past = await req('/api/appointments', {
  method: 'POST',
  body: { customer_name: 'QA Past', service: 'Demo Service', starts_at: new Date(Date.now() - 86400000).toISOString() },
});
check('past appointment rejected', past.status === 400, JSON.stringify(past));

if (process.exitCode) console.error('BOOKING E2E FAILED');
else console.log('BOOKING E2E PASSED');
