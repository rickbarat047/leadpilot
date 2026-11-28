// Safe booking integration check. Refuses any QA_BASE that is not a local server.
// Uses seeded demo data only; never calls production, sends real messages or payments.
import { DatabaseSync } from 'node:sqlite';

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

// Non-throwing check used by the offer-classification regressions so one RED
// run reports every affected conversation path.
function checkSoft(name, condition, detail = '') {
  if (!condition) {
    console.error(`FAIL ${name}${detail ? ` — ${detail}` : ''}`);
    process.exitCode = 1;
    return false;
  }
  console.log(`PASS ${name}`);
  return true;
}

async function messagesFor(conversationId) {
  const r = await req(`/api/conversations/${conversationId}/messages`);
  return r.data?.messages || [];
}

function offerMessages(messages) {
  return messages.filter((m) => {
    try { return m.sender === 'ai' && JSON.parse(m.meta_json || '{}').type === 'slot_offer'; } catch { return false; }
  });
}

function lastAiMessage(messages) {
  return [...messages].reverse().find((m) => m.sender === 'ai');
}

// Age the newest stored offer in the local disposable SQLite DB. This only
// touches the sandbox demo database and never contacts production.
function expireLatestOffer(conversationId) {
  const db = new DatabaseSync('data/leadpilot.db');
  try {
    const rows = db.prepare(
      `SELECT id, meta_json FROM messages WHERE conversation_id=? AND sender='ai' AND meta_json LIKE '%slot_offer%' ORDER BY created_at DESC LIMIT 1`,
    ).all(conversationId);
    if (!rows.length) throw new Error(`no stored offer for ${conversationId}`);
    const offer = JSON.parse(rows[0].meta_json);
    offer.createdAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    db.prepare('UPDATE messages SET meta_json=? WHERE id=?').run(JSON.stringify(offer), rows[0].id);
  } finally {
    db.close();
  }
}

async function assertNormalAiContinuation(conversationId, label) {
  const before = await messagesFor(conversationId);
  const r = await req(`/api/conversations/${conversationId}/messages`, {
    method: 'POST',
    body: { body: label, sender: 'lead' },
  });
  const after = await messagesFor(conversationId);
  const last = lastAiMessage(after);
  const ok = r.status === 200 && !r.data?.status && r.data?.booked !== true
    && after.length === before.length + 2
    && Boolean(last)
    && !/That offer was already used|Those options expired/i.test(last?.body || '')
    && !offerMessages(after).some((m) => !offerMessages(before).some((b) => b.id === m.id));
  checkSoft(`${label} reaches normal AI conversation`, ok, `${JSON.stringify(r)} last=${JSON.stringify(last)}`);
}

async function createLead(name, email, service = 'Demo Service') {
  const r = await req('/api/leads', {
    method: 'POST',
    body: { name, email, service, source: 'manual', message: '' },
  });
  check(`create lead ${name}`, r.status === 201 && r.data?.id, JSON.stringify(r));
  const conv = await req('/api/conversations', { method: 'PUT', body: { leadId: r.data.id } });
  check(`ensure conversation for ${name}`, conv.status === 200 && Boolean(conv.data?.id), JSON.stringify(conv));
  return { leadId: r.data.id, conversationId: conv.data.id, name, email };
}

async function offerFor(conversationId, expectedDuration) {
  const r = await req(`/api/conversations/${conversationId}/messages`, { method: 'POST', body: { body: 'I want to book an appointment', sender: 'lead' } });
  check('booking enquiry accepted', r.status === 200, JSON.stringify(r));
  const list = await req(`/api/conversations/${conversationId}/messages`);
  const offerMessage = [...(list.data?.messages || [])].reverse().find((m) => {
    try { return m.sender === 'ai' && JSON.parse(m.meta_json || '{}').type === 'slot_offer'; } catch { return false; }
  });
  check('numbered slot offer persisted', Boolean(offerMessage), JSON.stringify(list).slice(0, 500));
  const offer = JSON.parse(offerMessage.meta_json);
  check('offer carries configured service duration', offer.durationMin === expectedDuration, JSON.stringify(offer));
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
const services = [
  { name: 'Demo Service', price: 1000, duration: 90 },
  { name: 'Quick Service', price: 500, duration: 45 },
];
const put = await req('/api/business', { method: 'PUT', body: { hours, services } });
check('business hours and service durations saved', put.status === 200, JSON.stringify(put));

const lead = await createLead('QA Booking Customer', 'qa-customer@example.invalid');
const offer = await offerFor(lead.conversationId, 90);
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

// Repeating the original selection, or choosing another option from the same
// consumed offer, must not create a second appointment.
const repeat = await req(`/api/conversations/${lead.conversationId}/messages`, { method: 'POST', body: { body: '1', sender: 'lead' } });
check('repeat selection marked offer consumed', repeat.status === 200 && repeat.data?.status === 'offer_consumed', JSON.stringify(repeat));
const replay = await req(`/api/conversations/${lead.conversationId}/messages`, { method: 'POST', body: { body: '2', sender: 'lead' } });
check('different option from consumed offer rejected', replay.status === 200 && replay.data?.status === 'offer_consumed', JSON.stringify(replay));
appointments = await req('/api/appointments');
check('no duplicate appointment after retry', (appointments.data?.appointments || []).filter((a) => a.lead_id === lead.leadId).length === 1);

// Concurrent selections of different options from one offer: one booking only.
const raceOfferLead = await createLead('QA Offer Race', 'qa-offer-race@example.invalid');
const raceOffer = await offerFor(raceOfferLead.conversationId, 90);
const [o1, o2] = await Promise.all(['1', '2'].map((body) => req(`/api/conversations/${raceOfferLead.conversationId}/messages`, {
  method: 'POST',
  body: { body, sender: 'lead' },
})));
check('concurrent offer selections have exactly one booking', [o1, o2].filter((r) => r.data?.booked === true).length === 1, `${JSON.stringify(o1)} / ${JSON.stringify(o2)}`);
check('concurrent offer loser sees consumed offer', [o1, o2].some((r) => r.data?.status === 'offer_consumed'), `${JSON.stringify(o1)} / ${JSON.stringify(o2)}`);
appointments = await req('/api/appointments');
check('concurrent offer creates one appointment', (appointments.data?.appointments || []).filter((a) => a.lead_id === raceOfferLead.leadId).length === 1);

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

// PATCH cannot bypass booking conflict protection until rescheduling exists.
const winner = (appointments.data?.appointments || []).find((a) => a.lead_id === c1.leadId || a.lead_id === c2.leadId);
check('race winner available for PATCH guard', Boolean(winner), JSON.stringify(winner));
const patchStart = await req(`/api/appointments/${winner.id}`, { method: 'PATCH', body: { starts_at: new Date(Date.now() + 86400000).toISOString() } });
check('PATCH start-time change rejected', patchStart.status === 400 && patchStart.data?.error === 'start_time_change_disabled', JSON.stringify(patchStart));
const cancel = await req(`/api/appointments/${winner.id}`, { method: 'PATCH', body: { status: 'cancelled' } });
check('safe cancellation transition preserved', cancel.status === 200, JSON.stringify(cancel));
const reactivate = await req(`/api/appointments/${winner.id}`, { method: 'PATCH', body: { status: 'booked' } });
check('PATCH reactivation rejected', reactivate.status === 400 && reactivate.data?.error === 'reactivation_disabled', JSON.stringify(reactivate));

// A 45-minute service must be offered and booked with its own duration.
const quick = await createLead('QA 45 Minute Customer', 'qa-45@example.invalid', 'Quick Service');
const quickOffer = await offerFor(quick.conversationId, 45);
const quickSelect = await req(`/api/conversations/${quick.conversationId}/messages`, { method: 'POST', body: { body: '1', sender: 'lead' } });
check('45-minute selection booked', quickSelect.status === 200 && quickSelect.data?.booked === true, JSON.stringify(quickSelect));
appointments = await req('/api/appointments');
const quickApt = (appointments.data?.appointments || []).find((a) => a.lead_id === quick.leadId);
check('45-minute appointment duration', quickApt?.ends_at === new Date(new Date(quickOffer.options[0].startsAt).getTime() + 45 * 60000).toISOString(), `${quickApt?.ends_at}`);

// Offer reply classification regressions: stale offer state must not capture
// ordinary conversation, and only genuine selections may book or re-offer.
await assertNormalAiContinuation(lead.conversationId, 'What is your business address?');

const active = await createLead('QA Selection Intent', 'qa-selection@example.invalid');
await offerFor(active.conversationId, 90);
const ambiguous = await req(`/api/conversations/${active.conversationId}/messages`, {
  method: 'POST',
  body: { body: '2 or 3', sender: 'lead' },
});
checkSoft('ambiguous selection asks for one choice', ambiguous.status === 200 && ambiguous.data?.status === 'invalid_selection', JSON.stringify(ambiguous));
await assertNormalAiContinuation(active.conversationId, 'I have 2 questions about pricing');

const noOffer = await createLead('QA No Offer', 'qa-no-offer@example.invalid');
const noOfferReply = await req(`/api/conversations/${noOffer.conversationId}/messages`, {
  method: 'POST',
  body: { body: '1', sender: 'lead' },
});
checkSoft('bare number without an offer never books', noOfferReply.status === 200 && !noOfferReply.data?.booked, JSON.stringify(noOfferReply));
appointments = await req('/api/appointments');
checkSoft('no appointment from bare number without offer', (appointments.data?.appointments || []).filter((a) => a.lead_id === noOffer.leadId).length === 0);

const expired = await createLead('QA Expired Offer', 'qa-expired@example.invalid');
await offerFor(expired.conversationId, 90);
expireLatestOffer(expired.conversationId);
await assertNormalAiContinuation(expired.conversationId, 'What are your working hours?');

expireLatestOffer(expired.conversationId);
const beforeExpiredOffers = offerMessages(await messagesFor(expired.conversationId)).length;
const expiredSelect = await req(`/api/conversations/${expired.conversationId}/messages`, {
  method: 'POST',
  body: { body: 'option 2', sender: 'lead' },
});
const afterExpiredOffers = offerMessages(await messagesFor(expired.conversationId)).length;
checkSoft(
  'expired genuine selection offers fresh slots',
  expiredSelect.status === 200 && expiredSelect.data?.status === 'offer_expired' && afterExpiredOffers === beforeExpiredOffers + 1,
  `${JSON.stringify(expiredSelect)} offers ${beforeExpiredOffers}->${afterExpiredOffers}`,
);

expireLatestOffer(expired.conversationId);
await assertNormalAiContinuation(expired.conversationId, 'yes please');

if (process.exitCode) console.error('BOOKING E2E FAILED');
else console.log('BOOKING E2E PASSED');
