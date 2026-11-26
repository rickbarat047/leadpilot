import { NextRequest } from 'next/server';
import { json, guard } from '@/lib/api';
import { run } from '@/lib/db';
import { uid } from '@/lib/ids';
import { rateLimit } from '@/lib/rate';

/**
 * Lightweight client-side error log sink (used by error.tsx / 404 page).
 * Rate-limited per IP; messages capped — this must never be a spam vector.
 */
export const POST = guard(async (req: NextRequest) => {
  if (!rateLimit('logs:' + (req.headers.get('x-forwarded-for') ?? 'local'), 20, 60000)) {
    return json({ ok: false, error: 'rate limited' }, 429);
  }
  const body = await req.json().catch(() => ({}));
  const level = ['error', 'warn', 'info'].includes(String(body.level)) ? String(body.level) : 'error';
  const scope = String(body.scope ?? 'client').slice(0, 40);
  const message = String(body.message ?? '').slice(0, 1000) || 'client error';
  await run(
    `INSERT INTO system_logs (id, business_id, level, scope, message) VALUES (?, 'system', ?, ?, ?)`,
    uid('log'), level, scope, message,
  ).catch(() => undefined);
  return json({ ok: true });
});
