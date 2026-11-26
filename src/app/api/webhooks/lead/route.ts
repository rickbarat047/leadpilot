import { NextRequest } from 'next/server';
import { get, run } from '@/lib/db';
import { json, guard } from '@/lib/api';
import { uid, nowIso } from '@/lib/ids';
import { leadSchema } from '@/lib/validation';
import { ensureConversation, instantReply, recordRun } from '@/lib/automation';
import { notifyOwner } from '@/lib/messaging';
import { config } from '@/lib/config';
import { rateLimit } from '@/lib/rate';
import crypto from 'node:crypto';

async function verify(req: NextRequest, raw: string): Promise<{ businessId: string } | null> {
  // Two accepted schemes: shared webhook secret (HMAC) or per-call businessId for demo.
  const sig = req.headers.get('x-leadpilot-signature') ?? '';
  const url = new URL(req.url);
  const businessId = url.searchParams.get('businessId') ?? '';
  if (config.webhookSecret && sig) {
    const expected = crypto.createHmac('sha256', config.webhookSecret).update(raw).digest('hex');
    if (sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      // business resolved by api key header
      const biz = req.headers.get('x-business-id') ?? businessId;
      if (biz) return { businessId: biz };
    }
    return null;
  }
  if (businessId) {
    const ex = await get(`SELECT id FROM businesses WHERE id=?`, businessId);
    if (ex) return { businessId };
  }
  return null;
}

export const POST = guard(async (req: NextRequest) => {
  // Rate-limit before any DB work: integrations get generous headroom (60/min).
  if (!rateLimit('webhook:lead:' + (req.headers.get('x-forwarded-for') ?? 'local'), 60, 60000)) {
    return json({ error: 'Too many requests' }, 429);
  }
  const raw = await req.text();
  let body: Record<string, unknown> = {};
  try { body = JSON.parse(raw); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const auth = await verify(req, raw);
  if (!auth) {
    await run(`INSERT INTO webhook_events (id, source, type, payload_json, status, error) VALUES (?, ?, ?, ?, ?, ?)`,
      uid('wh'), 'lead', 'lead.inbound', raw.slice(0, 3000), 'failed', 'unauthorized: pass ?businessId= (demo) or sign with WEBHOOK_SECRET');
    return json({ error: 'Unauthorized. Pass ?businessId= or HMAC signature.' }, 401);
  }
  const parsed = leadSchema.safeParse(body);
  if (!parsed.success) return json({ error: 'Invalid lead payload' }, 400);
  const { name, email, phone, source, service, message } = parsed.data;
  const id = uid('lead');
  await run(`INSERT INTO leads (id, business_id, name, email, phone, source, service, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'New', ?)`,
    id, auth.businessId, name, email ?? '', phone ?? '', String(source ?? 'webhook'), service ?? '', nowIso());
  const conv = await ensureConversation(auth.businessId, id);
  if (message) await run(`INSERT INTO messages (id, business_id, conversation_id, sender, body) VALUES (?, ?, ?, 'lead', ?)`, uid('m'), auth.businessId, conv, message);
  await run(`INSERT INTO webhook_events (id, business_id, source, type, payload_json, status) VALUES (?, ?, ?, ?, ?, ?)`,
    uid('wh'), auth.businessId, 'webhook', 'lead.created', raw.slice(0, 3000), 'ok');
  try { await instantReply(auth.businessId, id); }
  catch (e) { await recordRun(auth.businessId, '', 'Instant AI response', 'lead.created', id, [], 'failed', e instanceof Error ? e.message : 'failed'); }
  try {
    await notifyOwner(auth.businessId, `New lead: ${name || 'unnamed'}${service ? ` (${service})` : ''}`,
      `${name || 'Someone'} reached out via ${source ?? 'webhook'}.\nPhone: ${phone || '—'} | Email: ${email || '—'}${message ? `\n\n"${message.slice(0, 300)}"` : ''}\n\nOpen the CRM to view and reply.`);
  } catch (e) {
    await recordRun(auth.businessId, '', 'Owner alert', 'lead.created', id, [], 'failed', e instanceof Error ? e.message : 'failed');
  }
  return json({ ok: true, id }, 201);
});
