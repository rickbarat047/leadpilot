import { run, get, all } from './db';
import { uid } from './ids';
import { hashPassword, seedBusinessDefaults, ensureSubscription } from './auth';
import { config } from './config';

// Creates (or returns) a demo business with realistic fictional data.
export async function ensureDemoBusiness(): Promise<string> {
  const email = 'demo@leadpilot.local';
  const u = await get<{ id: string }>(`SELECT id FROM users WHERE email=?`, email);
  let userId: string;
  if (!u) {
    userId = uid('usr');
    await run(`INSERT INTO users (id, email, password_hash, name, role) VALUES (?, ?, ?, ?, 'owner')`,
      userId, email, await hashPassword('demo1234'), 'Demo Owner');
  } else userId = u.id;
  const b = await get<{ id: string }>(`SELECT id FROM businesses WHERE owner_user_id=?`, userId);
  let bizId: string;
  if (!b) {
    bizId = uid('biz');
    await run(`INSERT INTO businesses (id, owner_user_id, name, industry, description, location, phone, email, onboarding_done, onboarding_step, settings_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 14, ?)`,
      bizId, userId, 'Glow & Co. Salon (Sample)', 'salon',
      'Boutique salon offering cuts, colour, facials and bridal packages.',
      'Kolkata, India', '+91 90000 11111', 'hello@glowco.example',
      JSON.stringify({ assistantName: 'Ava', tone: 'friendly-professional', reviewDelayH: 48 }));
    await run(`INSERT INTO memberships (id, business_id, user_id, role) VALUES (?, ?, ?, 'owner')`, uid('mem'), bizId, userId);
    await seedBusinessDefaults(bizId);
    await ensureSubscription(bizId);
    await seedDemoData(bizId);
  } else {
    bizId = b.id;
    const n = await get<{ n: number }>(`SELECT COUNT(*) n FROM leads WHERE business_id=?`, bizId);
    if (Number(n?.n ?? 0) === 0) await seedDemoData(bizId);
  }
  return bizId;
}

async function seedDemoData(bizId: string): Promise<void> {
  const services: [string, number, number][] = [
    ['Signature Haircut', 899, 45], ['Balayage Colour', 4999, 150],
    ['Hydra Facial', 2499, 60], ['Bridal Package', 19999, 300], ['Beard Sculpt', 499, 25],
  ];
  for (const [name, price, dur] of services) {
    await run(`INSERT INTO services (id, business_id, name, price, duration_min) VALUES (?, ?, ?, ?, ?)`, uid('svc'), bizId, name, price, dur);
  }
  const leads: [string, string, string, string, string, number, string][] = [
    ['Priya Sharma', 'priya@example.com', '+91 98111 22222', 'Balayage Colour', 'Qualified', 82, 'website'],
    ['Rahul Verma', 'rahul@example.com', '+91 98222 33333', 'Signature Haircut', 'Appointment Booked', 78, 'instagram'],
    ['Ananya Iyer', 'ananya@example.com', '+91 98333 44444', 'Hydra Facial', 'Contacted', 64, 'website'],
    ['Kabir Mehta', 'kabir@example.com', '+91 98444 55555', 'Beard Sculpt', 'New', 48, 'missed-call'],
    ['Sneha Rao', 'sneha@example.com', '+91 98555 66666', 'Bridal Package', 'Won', 91, 'referral'],
    ['Arjun Nair', 'arjun@example.com', '+91 98666 77777', 'Signature Haircut', 'No Response', 38, 'website'],
    ['Divya Menon', 'divya@example.com', '+91 98777 88888', 'Hydra Facial', 'Contacted', 58, 'webhook'],
  ];
  const now = Date.now();
  for (let i = 0; i < leads.length; i++) {
    const [name, email, phone, service, status, score, source] = leads[i];
    const id = uid('lead');
    const created = new Date(now - (i + 1) * 5 * 3600000).toISOString();
    await run(`INSERT INTO leads (id, business_id, name, email, phone, source, service, status, score, value, ai_summary, created_at, last_interaction_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id, bizId, name, email, phone, source, service, status, score, 1500 + i * 900,
      `${name.split(' ')[0]} asked about ${service}. Intent: booking. (Sample data)`, created, created);
    const conv = uid('conv');
    await run(`INSERT INTO conversations (id, business_id, lead_id, status) VALUES (?, ?, ?, ?)`, conv, bizId, id, status === 'No Response' ? 'ai' : 'ai');
    await run(`INSERT INTO messages (id, business_id, conversation_id, sender, body) VALUES (?, ?, ?, 'lead', ?)`,
      uid('m'), bizId, conv, `Hi! I'd like to book ${service}. What slots do you have? (Sample)`);
    if (status !== 'New') {
      await run(`INSERT INTO messages (id, business_id, conversation_id, sender, body) VALUES (?, ?, ?, 'ai', ?)`,
        uid('m'), bizId, conv, `Hi ${name.split(' ')[0]} — thanks for contacting Glow & Co.! For ${service}, what date and time suit you? (Sample)`);
    }
    if (status === 'Appointment Booked' || status === 'Won') {
      const s = new Date(now + 86400000).toISOString();
      const e = new Date(now + 86400000 + 3600000).toISOString();
      await run(`INSERT INTO appointments (id, business_id, lead_id, customer_name, service, starts_at, ends_at, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        uid('apt'), bizId, id, name, service, s, e, status === 'Won' ? 'completed' : 'booked');
    }
  }
  await run(`INSERT INTO knowledge_entries (id, business_id, kind, title, body) VALUES (?, ?, 'faq', 'Do you take walk-ins?', 'Walk-ins welcome 11am–4pm; evenings by appointment. (Sample)')`, uid('kn'), bizId);
  const runs = await all<{ id: string }>(`SELECT id FROM automation_runs WHERE business_id=? LIMIT 1`, bizId);
  if (runs.length === 0) {
    await run(`INSERT INTO automation_runs (id, business_id, automation_name, trigger, lead_id, steps_json, status) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      uid('run'), bizId, 'Instant AI response (Sample)', 'lead.created', 'sample', JSON.stringify([{ reply: 'Sample run' }]), 'ok');
  }
  void config;
}
