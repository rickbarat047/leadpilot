import { NextRequest } from 'next/server';
import { requireBusiness, json, guard } from '@/lib/api';
import { all, get, run } from '@/lib/db';
import { uid, nowIso } from '@/lib/ids';
import { messageSchema } from '@/lib/validation';
import { getAIProvider } from '@/lib/ai';
import { handleInboundText, recordRun } from '@/lib/automation';
import {
  buildSlotOffer,
  formatSlotOffers,
  parseSlotOffer,
  parseSlotSelection,
  slotOfferExpired,
} from '@/lib/booking-core';
import { createBooking } from '@/lib/booking';

type LeadRow = { id: string; name: string; email: string; phone: string; service: string };

/** Most recent still-valid slot offer stored on an AI message in this conversation. */
async function latestSlotOffer(conversationId: string) {
  const row = await get<{ meta_json: string }>(
    `SELECT meta_json FROM messages WHERE conversation_id=? AND sender='ai' AND meta_json LIKE '%slot_offer%' ORDER BY created_at DESC LIMIT 1`,
    conversationId,
  );
  if (!row) return null;
  const offer = parseSlotOffer(row.meta_json);
  return offer && !slotOfferExpired(offer, new Date()) ? { raw: row.meta_json, offer } : null;
}

/** Build and persist a fresh three-slot offer for a booking enquiry. */
async function offerSlots(businessId: string, lead: LeadRow | null, note: string) {
  const { freeSlotsForBusiness } = await import('@/lib/slots');
  const top = (await freeSlotsForBusiness(businessId, { days: 7, duration: 60 })).slice(0, 3);
  if (!top.length) return `I don't see free slots in the next 7 days — I've flagged this for the owner.`;
  const biz = await get<{ hours_json: string }>('SELECT hours_json FROM businesses WHERE id=?', businessId);
  let timezone = 'Asia/Kolkata';
  try { timezone = JSON.parse(biz?.hours_json ?? '{}').timezone || timezone; } catch { /* keep default */ }
  const offer = buildSlotOffer({
    createdAt: nowIso(),
    timezone,
    durationMin: 60,
    serviceName: lead?.service || '',
    options: top.map((startsAt) => ({
      startsAt,
      label: new Date(startsAt).toLocaleString('en-IN', {
        timeZone: timezone, weekday: 'long', hour: 'numeric', minute: '2-digit',
      }),
    })),
  });
  return `${note}\n${formatSlotOffers(offer)}\nReply with 1, 2 or 3 to confirm.`;
}

export const GET = guard(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const { error, businessId } = await requireBusiness(req);
  if (error || !businessId) return error;
  const conv = await get(`SELECT c.id, c.lead_id, c.status, l.name AS lead_name, l.service FROM conversations c JOIN leads l ON l.id=c.lead_id WHERE c.id=? AND c.business_id=?`, params.id, businessId);
  if (!conv) return json({ error: 'Not found' }, 404);
  const messages = await all(`SELECT id, sender, body, meta_json, created_at FROM messages WHERE conversation_id=? ORDER BY created_at ASC LIMIT 200`, params.id);
  return json({ conversation: conv, messages });
});

export const POST = guard(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const { error, businessId } = await requireBusiness(req);
  if (error || !businessId) return error;
  const conv = await get<{ id: string; lead_id: string; status: string }>(`SELECT id, lead_id, status FROM conversations WHERE id=? AND business_id=?`, params.id, businessId);
  if (!conv) return json({ error: 'Conversation not found' }, 404);
  const body = await req.json().catch(() => ({}));
  const parsed = messageSchema.safeParse(body);
  if (!parsed.success) return json({ error: 'Message required' }, 400);
  const sender = body.sender === 'lead' ? 'lead' : 'owner';

  if (sender === 'lead') {
    const { optedOut } = await handleInboundText(businessId, conv.lead_id, parsed.data.body);
    await run(`INSERT INTO messages (id, business_id, conversation_id, sender, body) VALUES (?, ?, ?, 'lead', ?)`, uid('m'), businessId, conv.id, parsed.data.body);
    await run(`UPDATE leads SET last_interaction_at=?, next_followup_at=? WHERE id=?`, nowIso(), optedOut ? null : new Date(Date.now() + 15 * 60000).toISOString(), conv.lead_id);
    await run(`UPDATE conversations SET updated_at=?, status=? WHERE id=?`, nowIso(), optedOut ? 'closed' : 'ai', conv.id);
    if (!optedOut) {
      const lead = await get<LeadRow>(`SELECT id, name, email, phone, service FROM leads WHERE id=? AND business_id=?`, conv.lead_id, businessId);
      if (!lead) return json({ error: 'Lead not found' }, 404);

      // A reply against an outstanding slot offer is deterministic: never guess.
      const outstanding = await latestSlotOffer(conv.id);
      if (outstanding) {
        const selectedIndex = parseSlotSelection(parsed.data.body, outstanding.offer);
        if (selectedIndex) {
          const result = await createBooking({
            businessId,
            leadId: conv.lead_id,
            conversationId: conv.id,
            customerName: lead.name,
            service: lead.service,
            startsAt: outstanding.offer.options.find((o) => o.index === selectedIndex)?.startsAt,
            source: 'customer',
            offerMeta: outstanding.raw,
            selectedIndex,
          });
          if (result.status === 'created') {
            await recordRun(businessId, '', 'Customer booking', 'booking.created', conv.lead_id, [{ appointmentId: result.appointmentId }], 'ok', '');
            return json({ ok: true, booked: true, appointmentId: result.appointmentId });
          }
          const text = result.status === 'slot_unavailable'
            ? 'That slot is no longer available. Here are fresh options:'
            : result.message ?? 'I could not complete that booking.';
          const reply = result.status === 'slot_unavailable' ? await offerSlots(businessId, lead, text) : text;
          await run(`INSERT INTO messages (id, business_id, conversation_id, sender, body) VALUES (?, ?, ?, 'ai', ?)`, uid('m'), businessId, conv.id, reply);
          return json({ ok: false, status: result.status });
        }
        if (/^(1|2|3|option|choice|slot|first|second|third)/i.test(parsed.data.body.trim())) {
          await run(`INSERT INTO messages (id, business_id, conversation_id, sender, body) VALUES (?, ?, ?, 'ai', ?)`, uid('m'), businessId, conv.id, 'Please reply with one option number: 1, 2 or 3.');
          return json({ ok: false, status: 'invalid_selection' });
        }
      }

      // Otherwise continue the normal AI conversation.
      try {
        const biz = await get<{ name: string }>(`SELECT name FROM businesses WHERE id=?`, businessId);
        const services = await all<{ name: string; price: number }>(`SELECT name, price FROM services WHERE business_id=?`, businessId);
        const knowledge = await all<{ title: string; body: string }>(`SELECT title, body FROM knowledge_entries WHERE business_id=? LIMIT 20`, businessId);
        const ai = getAIProvider();
        const input = {
          name: lead.name, email: lead.email, phone: lead.phone,
          service: lead.service, message: parsed.data.body, businessName: biz?.name ?? 'our business',
          services: services.map((s) => ({ name: s.name, price: Number(s.price) })), knowledge: knowledge.map((k) => ({ title: k.title, body: k.body })),
        };
        const c = await ai.classify(input);
        const reply = await ai.draftReply(input, c);
        if (c.outOfScope || reply.confidence < 0.4) {
          await run(`UPDATE conversations SET status='paused' WHERE id=?`, conv.id);
          await run(`INSERT INTO messages (id, business_id, conversation_id, sender, body, meta_json) VALUES (?, ?, ?, 'system', ?, ?)`,
            uid('m'), businessId, conv.id, `Escalated to owner (low confidence). Draft: ${reply.body}`, JSON.stringify({ draft: true }));
          await recordRun(businessId, '', 'Escalation on low confidence', 'message.low_confidence', conv.lead_id, [{ draft: reply.body }], 'ok', '');
        } else {
          const wantsBooking = /book|slot|time|date|tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday/i.test(parsed.data.body);
          let replyBody = reply.body;
          if (wantsBooking) {
            replyBody = await offerSlots(businessId, lead, reply.body);
            await run(`UPDATE leads SET status='Qualified' WHERE id=?`, conv.lead_id);
            await recordRun(businessId, '', 'Booking + reminders + review', 'lead.qualified', conv.lead_id, [{ offered: 'real slots' }], 'ok', '');
          }
          await run(`INSERT INTO messages (id, business_id, conversation_id, sender, body, meta_json) VALUES (?, ?, ?, 'ai', ?, ?)`,
            uid('m'), businessId, conv.id, replyBody, wantsBooking ? (await latestSlotOffer(conv.id))?.raw ?? '{}' : '{}');
        }
        await run(`UPDATE conversations SET updated_at=? WHERE id=?`, nowIso(), conv.id);
      } catch (e) {
        await recordRun(businessId, '', 'AI continuation', 'message.received', conv.lead_id, [], 'failed', e instanceof Error ? e.message : 'failed');
      }
    }
    return json({ ok: true });
  }

  await run(`INSERT INTO messages (id, business_id, conversation_id, sender, body) VALUES (?, ?, ?, 'owner', ?)`, uid('m'), businessId, conv.id, parsed.data.body);
  await run(`UPDATE conversations SET updated_at=?, status=? WHERE id=?`, nowIso(), body.resume ? 'ai' : 'paused', conv.id);
  await run(`UPDATE leads SET status='Contacted', last_interaction_at=? WHERE id=?`, nowIso(), conv.lead_id);
  return json({ ok: true });
});

export const PATCH = guard(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const { error, businessId } = await requireBusiness(req);
  if (error || !businessId) return error;
  const body = await req.json().catch(() => ({}));
  const conv = await get(`SELECT id FROM conversations WHERE id=? AND business_id=?`, params.id, businessId);
  if (!conv) return json({ error: 'Not found' }, 404);
  const status = body.paused === true ? 'paused' : body.closed === true ? 'closed' : 'ai';
  await run(`UPDATE conversations SET status=? WHERE id=?`, status, params.id);
  return json({ ok: true, status });
});
