import { NextRequest } from 'next/server';
import { get, run, all } from '@/lib/db';
import { json, guard } from '@/lib/api';
import { uid, nowIso } from '@/lib/ids';
import { leadSchema } from '@/lib/validation';
import { ensureConversation, instantReply, recordRun } from '@/lib/automation';
import { notifyOwner } from '@/lib/messaging';
import { sendWhatsApp } from '@/lib/whatsapp';
import { config } from '@/lib/config';
import { rateLimit } from '@/lib/rate';

async function resolveBusiness(phoneNumberId: string, qp: string | null): Promise<string | null> {
  if (qp) {
    const ex = await get(`SELECT id FROM businesses WHERE id=?`, qp);
    if (ex) return qp;
  }
  if (phoneNumberId) {
    const rows = await all<{ id: string; settings_json: string }>(`SELECT id, settings_json FROM businesses`);
    for (const r of rows) {
      try {
        const s = JSON.parse(r.settings_json || '{}');
        if (s.whatsappPhoneNumberId === phoneNumberId) return r.id;
      } catch { /* skip */ }
    }
  }
  return null;
}

export const GET = guard(async (req: NextRequest) => {
  const url = new URL(req.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');
  if (mode === 'subscribe' && token && config.whatsappVerifyToken && token === config.whatsappVerifyToken) {
    return new Response(challenge ?? '', { status: 200 });
  }
  return json({ error: 'verification failed' }, 403);
});

export const POST = guard(async (req: NextRequest) => {
  if (!rateLimit('webhook:whatsapp:' + (req.headers.get('x-forwarded-for') ?? 'local'), 60, 60000)) {
    return json({ error: 'Too many requests' }, 429);
  }
  const raw = await req.text();
  let body: any = {};
  try { body = JSON.parse(raw); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const entries = Array.isArray(body?.entry) ? body.entry : [];
  let processed = 0;
  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      const value = change?.value ?? {};
      const phoneNumberId = value?.metadata?.phone_number_id ?? '';
      const messages = Array.isArray(value?.messages) ? value.messages : [];
      const contacts = Array.isArray(value?.contacts) ? value.contacts : [];
      for (const m of messages) {
        if (m?.type !== 'text') continue;
        const from = String(m.from ?? '');
        const text = String(m?.text?.body ?? '').trim();
        if (!from || !text) continue;
        const qp = new URL(req.url).searchParams.get('businessId');
        const businessId = await resolveBusiness(phoneNumberId, qp);
        if (!businessId) continue;

        const contact = contacts.find((c: any) => c?.wa_id === from);
        const name = contact?.profile?.name ?? `WhatsApp ${from}`;
        const id = uid('lead');
        await run(`INSERT INTO leads (id, business_id, name, email, phone, source, service, status, created_at) VALUES (?, ?, ?, ?, ?, 'whatsapp', '', 'New', ?)`,
          id, businessId, name, '', from, nowIso());
        const conv = await ensureConversation(businessId, id);
        await run(`INSERT INTO messages (id, business_id, conversation_id, sender, body) VALUES (?, ?, ?, 'lead', ?)`, uid('m'), businessId, conv, text);
        try { await instantReply(businessId, id); }
        catch (e) { await recordRun(businessId, '', 'Instant AI response', 'lead.created', id, [], 'failed', e instanceof Error ? e.message : 'failed'); }
        // Mirror the AI reply back over WhatsApp.
        try {
          const last = await get<{ body: string }>(`SELECT body FROM messages WHERE conversation_id=? AND sender='ai' ORDER BY created_at DESC LIMIT 1`, conv);
          if (last?.body) await sendWhatsApp(from, last.body);
        } catch { /* best effort */ }
        try { await notifyOwner(businessId, `New WhatsApp lead: ${name}`, `${name} (${from}) via WhatsApp.\n\n"${text.slice(0, 300)}"\n\nOpen the CRM to view and reply.`); }
        catch (e) { await recordRun(businessId, '', 'Owner alert', 'lead.created', id, [], 'failed', e instanceof Error ? e.message : 'failed'); }
        processed++;
      }
    }
  }
  await run(`INSERT INTO webhook_events (id, source, type, payload_json, status) VALUES (?, ?, ?, ?, ?)`,
    uid('wh'), 'whatsapp', 'message.inbound', raw.slice(0, 3000), 'ok');
  return json({ ok: true, processed });
});
