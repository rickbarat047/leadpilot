import * as jose from 'jose';
import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
import { config } from './config';
import { get, run, all } from './db';
import { uid } from './ids';

const COOKIE = 'lp_session';
const secret = () => new TextEncoder().encode(config.jwtSecret);

export type SessionUser = { id: string; email: string; name: string; role: string; businessId: string | null };

export async function hashPassword(pw: string): Promise<string> {
  return bcrypt.hash(pw, 10);
}
export async function verifyPassword(pw: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pw, hash);
}

export async function signSession(u: SessionUser): Promise<string> {
  return new jose.SignJWT({ ...u })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('14d')
    .sign(secret());
}

export async function readSession(): Promise<SessionUser | null> {
  try {
    const c = cookies().get(COOKIE)?.value;
    if (!c) return null;
    const { payload } = await jose.jwtVerify(c, secret());
    return payload as unknown as SessionUser;
  } catch {
    return null;
  }
}

export async function setSessionCookie(token: string): Promise<void> {
  cookies().set(COOKIE, token, {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production',
    path: '/', maxAge: 60 * 60 * 24 * 14,
  });
}

export async function clearSessionCookie(): Promise<void> {
  cookies().set(COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
}

/** Resolve caller's business (first membership). Admin without business → null. */
export async function businessForUser(userId: string): Promise<string | null> {
  const m = await get<{ business_id: string }>(`SELECT business_id FROM memberships WHERE user_id=? ORDER BY created_at LIMIT 1`, userId);
  return m?.business_id ?? null;
}

export async function userBusinesses(userId: string): Promise<{ business_id: string }[]> {
  return all(`SELECT business_id FROM memberships WHERE user_id=?`, userId);
}

export async function createUserWithBusiness(name: string, email: string, passwordHash: string, businessName: string): Promise<{ userId: string; businessId: string }> {
  const userId = uid('usr');
  const businessId = uid('biz');
  await run(`INSERT INTO users (id, email, password_hash, name, role) VALUES (?, ?, ?, ?, 'owner')`, userId, email.toLowerCase(), passwordHash, name);
  await run(
    `INSERT INTO businesses (id, owner_user_id, name, settings_json) VALUES (?, ?, ?, ?)`,
    businessId, userId, businessName || `${name}'s Business`,
    JSON.stringify(defaultBusinessSettings()),
  );
  await run(`INSERT INTO memberships (id, business_id, user_id, role) VALUES (?, ?, ?, 'owner')`, uid('mem'), businessId, userId);
  await seedBusinessDefaults(businessId);
  await ensureSubscription(businessId);
  return { userId, businessId };
}

export function defaultBusinessSettings(): Record<string, unknown> {
  return {
    assistantName: 'Ava',
    tone: 'friendly-professional',
    replySpeedMin: 1,
    followups: [
      { afterMin: 15, enabled: true },
      { afterMin: 360, enabled: true },
      { afterMin: 1440, enabled: true },
    ],
    reviewDelayH: 48,
    reviewDestination: 'google',
    commsRequireConsent: false,
    bookingSlotMinutes: 30,
    currency: 'INR',
  };
}

export async function ensureSubscription(businessId: string): Promise<void> {
  const s = await get(`SELECT id FROM subscriptions WHERE business_id=?`, businessId);
  if (!s) {
    const trialEnds = new Date(Date.now() + config.trialDays * 86400000).toISOString();
    await run(
      `INSERT INTO subscriptions (id, business_id, plan, status, trial_ends_at) VALUES (?, ?, 'trial', 'trialing', ?)`,
      uid('sub'), businessId, trialEnds,
    );
  }
}

export async function seedBusinessDefaults(businessId: string): Promise<void> {
  const existing = await get(`SELECT id FROM automations WHERE business_id=? LIMIT 1`, businessId);
  if (existing) return;
  const playbooks: { name: string; trigger: string; steps: unknown[] }[] = [
    {
      name: 'Instant AI response',
      trigger: 'lead.created',
      steps: [{ type: 'ai_reply', maxDelaySec: 60 }, { type: 'log', note: 'response_time' }],
    },
    {
      name: 'No-reply chase (15m / 6h / 24h)',
      trigger: 'lead.no_reply',
      steps: [
        { type: 'wait', minutes: 15 }, { type: 'condition', if: 'no_reply', then: 'message', else: 'end' },
        { type: 'message', template: 'followup_1' },
        { type: 'wait', minutes: 360 }, { type: 'condition', if: 'no_reply', then: 'message', else: 'end' },
        { type: 'message', template: 'followup_2' },
        { type: 'wait', minutes: 1440 }, { type: 'condition', if: 'no_reply', then: 'message', else: 'end' },
        { type: 'message', template: 'followup_3' },
        { type: 'mark', status: 'No Response' },
      ],
    },
    {
      name: 'Booking + reminders + review',
      trigger: 'lead.qualified',
      steps: [
        { type: 'book_offer', slots: 3 },
        { type: 'reminder', before: '24h' }, { type: 'reminder', before: '2h' },
        { type: 'review_request', afterHours: 48 },
      ],
    },
    {
      name: 'Escalation on low confidence',
      trigger: 'message.low_confidence',
      steps: [{ type: 'escalate', pauseAiHours: 4 }, { type: 'notify_owner' }],
    },
  ];
  for (const p of playbooks) {
    await run(
      `INSERT INTO automations (id, business_id, name, trigger, steps_json, enabled) VALUES (?, ?, ?, ?, ?, 1)`,
      uid('aut'), businessId, p.name, p.trigger, JSON.stringify(p.steps),
    );
  }
  const kb = await get(`SELECT id FROM knowledge_entries WHERE business_id=? LIMIT 1`, businessId);
  if (!kb) {
    const rows: [string, string, string][] = [
      ['booking', 'How to book', 'Reply with 2–3 times that suit you and we will confirm instantly. Reschedule anytime by replying RESCHEDULE.'],
      ['faq', 'Opening hours', 'Set your real hours in Settings → Business. The AI only offers times inside those hours.'],
      ['policy', 'Cancellation', 'Free cancellation up to 12 hours before. Reply CANCEL to release your slot.'],
    ];
    for (const [kind, title, body] of rows) {
      await run(`INSERT INTO knowledge_entries (id, business_id, kind, title, body) VALUES (?, ?, ?, ?, ?)`, uid('kn'), businessId, kind, title, body);
    }
  }
  for (const provider of ['google', 'email', 'stripe']) {
    const ex = await get(`SELECT id FROM integrations WHERE business_id=? AND provider=?`, businessId, provider);
    if (!ex) await run(`INSERT INTO integrations (id, business_id, provider, status) VALUES (?, ?, ?, 'disconnected')`, uid('int'), businessId, provider);
  }
}
