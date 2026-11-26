import { NextRequest } from 'next/server';
import { requireUser, json, guard } from '@/lib/api';
import { get, run } from '@/lib/db';
import { rateLimit } from '@/lib/rate';
import { uid } from '@/lib/ids';

export const POST = guard(async (req: NextRequest) => {
  if (!rateLimit('admin-billing:' + (req.headers.get('x-forwarded-for') ?? 'local'), 30, 60000)) {
    return json({ error: 'Too many attempts.' }, 429);
  }
  const { error, user } = await requireUser();
  if (error || !user) return error;
  if (user.role !== 'admin') return json({ error: 'Admin only' }, 403);

  const body = await req.json().catch(() => ({}));
  const invoiceId = String(body.invoiceId ?? '').trim();
  if (!invoiceId) return json({ error: 'invoiceId required' }, 400);

  const inv = await get<{ id: string; business_id: string; plan: string; amount: number; status: string }>(
    `SELECT id, business_id, plan, amount, status FROM invoices WHERE id=?`, invoiceId);
  if (!inv) return json({ error: 'Invoice not found' }, 404);
  if (inv.status === 'paid') return json({ ok: true, already: true });
  if (inv.status !== 'pending_verification') return json({ error: `Invoice status is ${inv.status}, not pending` }, 400);
  if (!inv.plan) return json({ error: 'Invoice has no plan recorded' }, 400);

  await run(`UPDATE invoices SET status='paid' WHERE id=?`, invoiceId);
  await run(`UPDATE subscriptions SET plan=?, status='active' WHERE business_id=?`, inv.plan, inv.business_id);
  await run(`INSERT INTO automation_runs (id, business_id, automation_name, trigger, steps_json, status) VALUES (?, ?, ?, ?, ?, ?)`,
    uid('run'), inv.business_id, 'billing (upi)', 'billing.upi_verified',
    JSON.stringify([{ invoiceId, plan: inv.plan, amount: inv.amount }]), 'ok');

  return json({ ok: true, invoiceId, plan: inv.plan, businessId: inv.business_id });
});
