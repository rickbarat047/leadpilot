import { get, isPostgres } from '@/lib/db';
import { json, guard } from '@/lib/api';
import { config } from '@/lib/config';

// Must be dynamic — otherwise Next prerenders this GET handler at build time
// and freezes every check (heartbeat/queue depth would go stale forever).
export const dynamic = 'force-dynamic';

export const GET = guard(async () => {
  const checks: Record<string, string> = {};
  try { await get(`SELECT 1 AS ok`); checks.db = isPostgres() ? 'ok (postgres)' : 'ok (sqlite)'; } catch { checks.db = 'fail'; }
  checks.ai = config.aiApiKey && config.aiProvider !== 'mock' ? 'live' : 'mock';
  checks.email = config.resendKey && config.emailProvider !== 'mock' ? 'live' : 'mock';
  checks.stripe = config.stripeKey ? 'live' : 'mock';
  try {
    const o = await get<{ n: number }>(`SELECT COUNT(*) n FROM email_outbox WHERE status='pending'`);
    checks.emailOutbox = `${Number(o?.n ?? 0)} pending`;
  } catch {
    checks.emailOutbox = 'unavailable';
  }
  // Cron heartbeat (written by /api/cron/tick) — warns when the scheduler dies.
  try {
    const hb = await get<{ t: string | null }>(`SELECT MAX(created_at) t FROM system_logs WHERE scope='cron'`);
    const ageMin = hb?.t ? Math.round((Date.now() - Date.parse(hb.t)) / 60000) : null;
    checks.cron = ageMin === null || Number.isNaN(ageMin)
      ? 'no heartbeat yet'
      : ageMin <= 15
        ? `ok (${ageMin}m ago)`
        : `STALE (${ageMin}m ago)`;
  } catch {
    checks.cron = 'unavailable';
  }
  const ok = checks.db !== 'fail';
  return json({ ok, app: 'LeadPilot', time: new Date().toISOString(), checks }, ok ? 200 : 500);
});
