import { requireUser, guard } from '@/lib/api';
import { json } from '@/lib/api';
import { all, get } from '@/lib/db';

export const GET = guard(async () => {
  const { error, user } = await requireUser();
  if (error || !user) return error;
  if (user.role !== 'admin') return json({ error: 'Admin only' }, 403);
  const businesses = await all(`SELECT id, name, industry, created_at FROM businesses ORDER BY created_at DESC LIMIT 100`);
  const subs = await all(`SELECT plan, status, COUNT(*) n FROM subscriptions GROUP BY plan, status`);
  const counts = {
    businesses: Number((await get<{ n: number }>(`SELECT COUNT(*) n FROM businesses`))?.n ?? 0),
    leads: Number((await get<{ n: number }>(`SELECT COUNT(*) n FROM leads`))?.n ?? 0),
    appointments: Number((await get<{ n: number }>(`SELECT COUNT(*) n FROM appointments`))?.n ?? 0),
    runs: Number((await get<{ n: number }>(`SELECT COUNT(*) n FROM automation_runs`))?.n ?? 0),
    errors: Number((await get<{ n: number }>(`SELECT COUNT(*) n FROM automation_runs WHERE status='failed'`))?.n ?? 0),
    revenueMock: Number((await get<{ s: number }>(`SELECT COALESCE(SUM(amount),0) s FROM invoices WHERE status='paid'`))?.s ?? 0),
    emailPending: Number((await get<{ n: number }>(`SELECT COUNT(*) n FROM email_outbox WHERE status='pending'`))?.n ?? 0),
    emailFailed: Number((await get<{ n: number }>(`SELECT COUNT(*) n FROM email_outbox WHERE status='failed'`))?.n ?? 0),
  };
  const pendingInvoices = await all(`SELECT i.id, i.business_id, b.name AS business_name, i.amount, i.plan, i.url AS utr, i.created_at FROM invoices i LEFT JOIN businesses b ON b.id=i.business_id WHERE i.status='pending_verification' ORDER BY i.created_at DESC LIMIT 50`);
  const recentErrors = await all(`SELECT * FROM automation_runs WHERE status='failed' ORDER BY created_at DESC LIMIT 20`);
  const webhooks = await all(`SELECT source, type, status, created_at FROM webhook_events ORDER BY created_at DESC LIMIT 20`);
  return json({ businesses, subs, counts, pendingInvoices, recentErrors, webhooks });
});
