import { NextRequest } from 'next/server';
import { json, guard } from '@/lib/api';
import { runAutomationTick } from '@/lib/automation';
import { config } from '@/lib/config';
import { rateLimit } from '@/lib/rate';
import { run } from '@/lib/db';
import { uid } from '@/lib/ids';

export const POST = guard(async (req: NextRequest) => {
  const url = new URL(req.url);
  // If CRON_SECRET is set, require it (external schedulers pass ?secret= or Bearer).
  // Otherwise allow but rate-limit: every tick action is one-shot/idempotent.
  if (config.cronSecret) {
    const auth = req.headers.get('authorization') ?? '';
    const ok = auth === `Bearer ${config.cronSecret}` || url.searchParams.get('secret') === config.cronSecret;
    if (!ok) return json({ error: 'Unauthorized' }, 401);
  } else {
    if (!rateLimit('tick:' + (req.headers.get('x-forwarded-for') ?? 'x'), 10, 60000)) {
      return json({ error: 'Too many requests' }, 429);
    }
  }
  const biz = url.searchParams.get('businessId') ?? undefined;
  const res = await runAutomationTick(biz);
  // Heartbeat: /api/health reports staleness from this row (P4).
  try {
    await run(`INSERT INTO system_logs (id, business_id, level, scope, message) VALUES (?, 'system', 'info', 'cron', ?)`,
      uid('log'), `tick${biz ? ` biz=${biz}` : ''}: processed=${res.processed} errors=${res.errors.length}${res.errors.length ? ` (${res.errors[0].slice(0, 120)})` : ''}`);
  } catch { /* heartbeat must never fail the tick */ }
  return json({ ok: true, ...res });
});

export const GET = guard(async (req: NextRequest) => {
  return POST(req);
});
