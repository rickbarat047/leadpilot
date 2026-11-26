import { NextRequest } from 'next/server';
import { requireBusiness, json, guard } from '@/lib/api';
import { all, get, run } from '@/lib/db';
import { uid, nowIso } from '@/lib/ids';
import { messageSchema } from '@/lib/validation';
import { getAIProvider } from '@/lib/ai';
import { handleInboundText, recordRun } from '@/lib/automation';

export const GET = guard(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const { error, businessId } = await requireBusiness(req);
  if (error || !businessId) return error;
  const conv = await get(`SELECT c.id, c.lead_id, c.status, l.name AS lead_name, l.service FROM conversations c JOIN leads l ON l.id=c.lead_id WHERE c.id=? AND c.business_id=?`, params.id, businessId);
  if (!conv) return json({ error: 'Not found' }, 404);
  const messages = await all(`SELECT id, sender, body, created_at FROM messages WHERE conversation_id=? ORDER BY created_at ASC LIMIT 200`, params.id);
  return json({ conversation: conv, messages });
});

export const POST = guard(async (req: NextRequest, { params }: { params: { id: string } }) => {
  // POST /api/conversations/:id/messages  { body, sender: 'owner' | 'lead' }
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
      // AI continues naturally
      try {
        const lead = await get<Record<string, string>>(`SELECT * FROM leads WHERE id=?`, conv.lead_id);
        const biz = await get<{ name: string }>(`SELECT name FROM businesses WHERE id=?`, businessId);
        const services = await all<{ name: string; price: number }>(`SELECT name, price FROM services WHERE business_id=?`, businessId);
        const knowledge = await all<{ title: string; body: string }>(`SELECT title, body FROM knowledge_entries WHERE business_id=? LIMIT 20`, businessId);
        const ai = getAIProvider();
        const input = {
          name: String(lead?.name ?? ''), email: String(lead?.email ?? ''), phone: String(lead?.phone ?? ''),
          service: String(lead?.service ?? ''), message: parsed.data.body, businessName: biz?.name ?? 'our business',
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
          // Booking intent? offer slots
          const wantsBooking = /book|slot|time|date|yes|tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday/i.test(parsed.data.body);
          let replyBody = reply.body;
          if (wantsBooking) {
            try {
              const { freeSlotsForBusiness } = await import('@/lib/slots');
              const slots = await freeSlotsForBusiness(businessId, { days: 7, duration: 60 });
              const top = slots.slice(0, 3);
              if (top.length) {
                const fmt = top.map((s) => new Date(s).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })).join(' · ');
                replyBody = `${reply.body}\n\nHere are 3 available slots: ${fmt}. Reply with one (or a time that suits you) and I'll book it.`;
              } else {
                replyBody = `${reply.body}\n\nI don't see free slots in the next 7 days — I've flagged this for the owner who'll reach out with options.`;
              }
            } catch { /* keep original reply */ }
            await run(`UPDATE leads SET status='Qualified' WHERE id=?`, conv.lead_id);
            await recordRun(businessId, '', 'Booking + reminders + review', 'lead.qualified', conv.lead_id, [{ offered: 'real slots' }], 'ok', '');
          }
          await run(`INSERT INTO messages (id, business_id, conversation_id, sender, body) VALUES (?, ?, ?, 'ai', ?)`, uid('m'), businessId, conv.id, replyBody);
        }
        await run(`UPDATE conversations SET updated_at=? WHERE id=?`, nowIso(), conv.id);
      } catch (e) {
        await recordRun(businessId, '', 'AI continuation', 'message.received', conv.lead_id, [], 'failed', e instanceof Error ? e.message : 'failed');
      }
    }
    return json({ ok: true });
  }

  // owner manual reply → pauses AI unless resume flag
  await run(`INSERT INTO messages (id, business_id, conversation_id, sender, body) VALUES (?, ?, ?, 'owner', ?)`, uid('m'), businessId, conv.id, parsed.data.body);
  await run(`UPDATE conversations SET updated_at=?, status=? WHERE id=?`, nowIso(), body.resume ? 'ai' : 'paused', conv.id);
  await run(`UPDATE leads SET status='Contacted', last_interaction_at=? WHERE id=?`, nowIso(), conv.lead_id);
  return json({ ok: true });
});

// take over / resume
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
