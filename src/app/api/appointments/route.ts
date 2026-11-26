import { NextRequest } from 'next/server';
import { requireBusiness, json, guard } from '@/lib/api';
import { all, get, run } from '@/lib/db';
import { uid, nowIso } from '@/lib/ids';
import { recordRun } from '@/lib/automation';
import { queueEmail, notifyOwner, emailOn, isValidEmail, formatWhen } from '@/lib/messaging';

function first(n?: string): string {
  return (n || 'there').split(' ')[0] || 'there';
}

export const GET = guard(async (req: NextRequest) => {
  const { error, businessId } = await requireBusiness(req);
  if (error || !businessId) return error;
  return json({ appointments: await all(`SELECT * FROM appointments WHERE business_id=? ORDER BY starts_at DESC LIMIT 200`, businessId) });
});

export const POST = guard(async (req: NextRequest) => {
  const { error, businessId } = await requireBusiness(req);
  if (error || !businessId) return error;
  const body = await req.json().catch(() => ({}));
  if (!body.starts_at || !body.customer_name) return json({ error: 'customer_name and starts_at required' }, 400);
  const starts = new Date(body.starts_at);
  if (isNaN(starts.getTime())) return json({ error: 'Invalid starts_at' }, 400);
  const ends = body.ends_at ? new Date(body.ends_at) : new Date(starts.getTime() + 60 * 60000);
  const id = uid('apt');
  await run(`INSERT INTO appointments (id, business_id, lead_id, customer_name, service, starts_at, ends_at, status, source, notes) VALUES (?, ?, ?, ?, ?, ?, ?, 'booked', ?, ?)`,
    id, businessId, body.lead_id ?? null, String(body.customer_name).slice(0, 120), String(body.service ?? '').slice(0, 120),
    starts.toISOString(), ends.toISOString(), body.source ?? 'manual', String(body.notes ?? '').slice(0, 500));
  if (body.lead_id) {
    // Tenant isolation: only act on a lead that belongs to this business.
    // (Without this, any authenticated tenant could flip another tenant's lead
    // status, post into their conversation, or email their contact.)
    const lead = await get<{ id: string; email: string; name: string }>(
      `SELECT id, email, name FROM leads WHERE id=? AND business_id=?`, body.lead_id, businessId);
    if (lead) {
      await run(`UPDATE leads SET status='Appointment Booked', next_followup_at=NULL WHERE id=? AND business_id=?`, body.lead_id, businessId);
      const conv = await get<{ id: string }>(`SELECT id FROM conversations WHERE lead_id=? AND business_id=?`, body.lead_id, businessId);
      if (conv) {
        await run(`INSERT INTO messages (id, business_id, conversation_id, sender, body) VALUES (?, ?, ?, 'ai', ?)`,
          uid('m'), businessId, conv.id, `You're booked for ${body.service || 'your appointment'} on ${starts.toLocaleString()}. Reply RESCHEDULE to move it, CANCEL to release it.`);
      }
      // Email confirmation to the lead (gated by emailBookingConfirm, default on)
      try {
        const biz = await get<{ name: string; settings_json: string }>(`SELECT name, settings_json FROM businesses WHERE id=?`, businessId);
        if (isValidEmail(lead.email) && emailOn(biz?.settings_json, 'emailBookingConfirm')) {
          await queueEmail(businessId, lead.email, `Appointment confirmed — ${body.service || 'your booking'}`,
            `Hi ${first(lead.name)}, you're booked for ${body.service || 'your appointment'} on ${formatWhen(starts.toISOString())} with ${biz?.name ?? 'us'}.\n\nReply RESCHEDULE to move it, CANCEL to release the slot.`);
        }
      } catch (e) {
        await recordRun(businessId, '', 'Booking confirmation', 'appointment.created', body.lead_id, [], 'failed', e instanceof Error ? e.message : 'failed');
      }
    }
  }
  try {
    await notifyOwner(businessId, `New booking: ${String(body.customer_name).slice(0, 60)}`,
      `${String(body.customer_name)} · ${body.service || 'appointment'} · ${formatWhen(starts.toISOString())}${body.notes ? `\nNotes: ${String(body.notes).slice(0, 200)}` : ''}`);
  } catch (e) {
    await recordRun(businessId, '', 'Owner alert', 'appointment.created', id, [], 'failed', e instanceof Error ? e.message : 'failed');
  }
  void nowIso;
  return json({ ok: true, id }, 201);
});
