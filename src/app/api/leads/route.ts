import { NextRequest } from 'next/server';
import { requireBusiness, json, guard } from '@/lib/api';
import { all, get, run, sql as dbsql } from '@/lib/db';
import { uid, nowIso } from '@/lib/ids';
import { leadSchema } from '@/lib/validation';
import { planById, canAddLead } from '@/lib/billing';
import { ensureConversation, instantReply, recordRun } from '@/lib/automation';
import { notifyOwner } from '@/lib/messaging';

export const GET = guard(async (req: NextRequest) => {
  const { error, businessId } = await requireBusiness(req);
  if (error || !businessId) return error;
  const url = new URL(req.url);
  const status = url.searchParams.get('status');
  const q = url.searchParams.get('q');
  let stmt = `SELECT * FROM leads WHERE business_id=?`;
  const params: unknown[] = [businessId];
  if (status) { stmt += ` AND status=?`; params.push(status); }
  if (q) { stmt += ` AND (name LIKE ? OR email LIKE ? OR phone LIKE ? OR service LIKE ?)`; params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`); }
  stmt += ` ORDER BY created_at DESC LIMIT 200`;
  return json({ leads: await all(stmt, ...params) });
});

export const POST = guard(async (req: NextRequest) => {
  const { error, businessId } = await requireBusiness(req);
  if (error || !businessId) return error;
  const body = await req.json().catch(() => ({}));
  const parsed = leadSchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? 'Invalid lead' }, 400);

  const sub = await get<{ plan: string }>(`SELECT plan FROM subscriptions WHERE business_id=?`, businessId);
  const plan = planById(sub?.plan ?? 'trial');
  const monthCount = Number((await get<{ n: number }>(`SELECT COUNT(*) n FROM leads WHERE business_id=? AND ${dbsql.thisMonth('created_at')}`, businessId))?.n ?? 0);
  if (!canAddLead(plan, monthCount)) {
    return json({ error: `Monthly lead limit reached on ${plan.name}. Upgrade in Billing.`, upgrade: true }, 402);
  }

  const id = uid('lead');
  const { name, email, phone, source, service, message } = parsed.data;
  await run(`INSERT INTO leads (id, business_id, name, email, phone, source, service, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'New', ?)`,
    id, businessId, name, email ?? '', phone ?? '', source ?? 'manual', service ?? '', nowIso());
  const conv = await ensureConversation(businessId, id);
  if (message) {
    await run(`INSERT INTO messages (id, business_id, conversation_id, sender, body) VALUES (?, ?, ?, 'lead', ?)`, uid('m'), businessId, conv, message);
  }
  await run(`INSERT INTO webhook_events (id, business_id, source, type, payload_json, status) VALUES (?, ?, ?, ?, ?, ?)`,
    uid('wh'), businessId, source ?? 'manual', 'lead.created', JSON.stringify({ leadId: id }), 'ok');
  // Instant AI reply (async, logged; never blocks creation)
  try { await instantReply(businessId, id); }
  catch (e) { await recordRun(businessId, '', 'Instant AI response', 'lead.created', id, [], 'failed', e instanceof Error ? e.message : 'failed'); }
  // Owner alert (skipped for leads the staff entered themselves)
  if ((source ?? 'manual') !== 'manual') {
    try {
      await notifyOwner(businessId, `New lead: ${name || 'unnamed'}${service ? ` (${service})` : ''}`,
        `${name || 'Someone'} reached out via ${source}.\nPhone: ${phone || '—'} | Email: ${email || '—'}${message ? `\n\n"${message.slice(0, 300)}"` : ''}\n\nOpen the CRM to view and reply.`);
    } catch (e) {
      await recordRun(businessId, '', 'Owner alert', 'lead.created', id, [], 'failed', e instanceof Error ? e.message : 'failed');
    }
  }
  return json({ ok: true, id }, 201);
});
