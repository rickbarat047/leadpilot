import { config } from './config';
import { all, get, run } from './db';
import { uid, nowIso } from './ids';
import { recordRun } from './runs';
import { isOptOut } from './text';
export { isOptOut };

// ---------------------------------------------------------------------------
// Email delivery — outbox with immediate attempt + bounded retries on flush.
//
// With RESEND_API_KEY set (and EMAIL_PROVIDER != 'mock') messages go out for
// real via Resend. Without it every send is recorded to automation_runs as
// `email (mock)` so the product is fully demonstrable with zero credentials.
//
// Every queue → attempt → outcome is visible in Automations → Runs. Nothing
// fails silently: invalid recipients, provider errors and retry state are all
// stored (email_outbox.last_error / automation_runs.error).
// ---------------------------------------------------------------------------

export type SendResult = { ok: boolean; mock: boolean; id: string; error?: string };

type OutboxRow = {
  id: string; business_id: string; to_addr: string; subject: string; body: string;
  status: string; attempts: number;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_ATTEMPTS = 3;

export function isValidEmail(v: string): boolean {
  return EMAIL_RE.test((v ?? '').trim());
}

/**
 * Feature gate from business settings_json. Keys default to ON so existing
 * businesses keep working before the settings UI is ever opened.
 */
export function emailOn(settingsJson: string | null | undefined, key: string): boolean {
  try {
    const s = JSON.parse(settingsJson || '{}');
    return s[key] !== false;
  } catch {
    return true;
  }
}

/** Indian-format local time for appointment emails (product is India-first). */
export function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) + ' IST';
}

async function flushRow(row: OutboxRow): Promise<SendResult> {
  const attempts = Number(row.attempts ?? 0) + 1;
  const steps: Record<string, unknown>[] = [{ to: row.to_addr, subject: row.subject }];

  if (config.resendKey && config.emailProvider !== 'mock') {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.resendKey}` },
        body: JSON.stringify({ from: config.emailFrom, to: row.to_addr, subject: row.subject, text: row.body }),
      });
      if (!res.ok) throw new Error(`resend ${res.status}`);
      const j = (await res.json().catch(() => ({}))) as { id?: string };
      await run(
        `UPDATE email_outbox SET status='sent', attempts=?, provider_id=?, sent_at=?, last_error='' WHERE id=?`,
        attempts, String(j.id ?? ''), nowIso(), row.id,
      );
      await recordRun(row.business_id, '', 'Email delivered', 'send.email', '', [...steps, { providerId: j.id ?? '' }], 'ok', '');
      return { ok: true, mock: false, id: row.id };
    } catch (e) {
      const err = (e instanceof Error ? e.message : 'email failed').slice(0, 500);
      const final = attempts >= MAX_ATTEMPTS;
      await run(`UPDATE email_outbox SET status=?, attempts=?, last_error=? WHERE id=?`,
        final ? 'failed' : 'pending', attempts, err, row.id).catch(() => undefined);
      await recordRun(row.business_id, '', 'Email delivery', 'send.email', '', steps, 'failed', `${err} (attempt ${attempts}/${MAX_ATTEMPTS})`);
      return { ok: false, mock: false, id: row.id, error: err };
    }
  }

  // Mock mode (no credentials): logged + marked as mock-delivered.
  await run(`UPDATE email_outbox SET status='mock', attempts=?, sent_at=?, last_error='' WHERE id=?`,
    attempts, nowIso(), row.id).catch(() => undefined);
  await recordRun(row.business_id, '', 'email (mock)', 'send.email', '', [...steps, { body: row.body.slice(0, 500) }], 'ok', '');
  return { ok: true, mock: true, id: row.id };
}

/** Queue an email. Attempts delivery immediately; failures retry on the next flush. */
export async function queueEmail(businessId: string, to: string, subject: string, body: string): Promise<SendResult> {
  const id = uid('out');
  const dest = (to ?? '').trim();
  if (!isValidEmail(dest)) {
    await recordRun(businessId, '', 'Email queued', 'send.email', '',
      [{ to: dest || '(missing)', subject }], 'failed', 'invalid recipient address');
    return { ok: false, mock: false, id, error: 'invalid recipient address' };
  }
  await run(
    `INSERT INTO email_outbox (id, business_id, to_addr, subject, body, status, attempts, created_at) VALUES (?, ?, ?, ?, ?, 'pending', 0, ?)`,
    id, businessId, dest, subject.slice(0, 200), body.slice(0, 4000), nowIso(),
  );
  const row = await get<OutboxRow>(`SELECT * FROM email_outbox WHERE id=?`, id);
  if (!row) return { ok: false, mock: false, id, error: 'outbox insert failed' };
  return flushRow(row);
}

/** Retry pass for pending emails (called at the end of every automation tick). */
export async function flushEmailOutbox(limit = 10): Promise<{ sent: number; failed: number }> {
  const rows = await all<OutboxRow>(
    `SELECT * FROM email_outbox WHERE status='pending' AND attempts < ? ORDER BY created_at LIMIT ?`,
    MAX_ATTEMPTS, limit,
  );
  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    const r = await flushRow(row);
    if (r.ok) sent += 1;
    else failed += 1;
  }
  return { sent, failed };
}

/**
 * Email the business owner (falls back from businesses.email to the owner's
 * account email). Gated by the `emailOwnerAlerts` setting (default on).
 */
export async function notifyOwner(businessId: string, subject: string, body: string): Promise<SendResult | null> {
  const biz = await get<{ email: string; owner_user_id: string; settings_json: string }>(
    `SELECT email, owner_user_id, settings_json FROM businesses WHERE id=?`, businessId);
  if (!biz || !emailOn(biz.settings_json, 'emailOwnerAlerts')) return null;
  let to = (biz.email ?? '').trim();
  if (!isValidEmail(to)) {
    const u = await get<{ email: string }>(`SELECT email FROM users WHERE id=?`, biz.owner_user_id);
    to = (u?.email ?? '').trim();
  }
  if (!isValidEmail(to)) return null;
  return queueEmail(businessId, to, subject, body);
}

/** SMS is intentionally a logged stub until a provider (Twilio/MessageCentral) is configured. */
export async function sendSms(businessId: string, to: string, body: string): Promise<SendResult> {
  const id = uid('sms');
  await run(
    `INSERT INTO automation_runs (id, business_id, automation_name, trigger, steps_json, status) VALUES (?, ?, ?, ?, ?, ?)`,
    id, businessId, 'sms (mock)', 'send.sms',
    JSON.stringify([{ to, body: body.slice(0, 300) }]), 'ok',
  );
  return { ok: true, mock: true, id };
}
