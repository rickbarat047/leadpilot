import { NextRequest } from 'next/server';
import { requireBusiness, json, guard } from '@/lib/api';
import { all, get } from '@/lib/db';
import { ensureConversation } from '@/lib/automation';
export const GET = guard(async (req: NextRequest) => {
  const { error, businessId } = await requireBusiness(req);
  if (error || !businessId) return error;
  const convs = await all<{
    id: string; lead_id: string; status: string; updated_at: string; lead_name: string; service: string;
  }>(`
    SELECT c.id, c.lead_id, c.status, c.updated_at, l.name AS lead_name, l.service
    FROM conversations c JOIN leads l ON l.id=c.lead_id
    WHERE c.business_id=? ORDER BY c.updated_at DESC LIMIT 100`, businessId);
  // Last message per conversation (two portable queries instead of a correlated subquery)
  let lastByConv: Record<string, string> = {};
  if (convs.length) {
    const marks = convs.map(() => '?').join(',');
    const ids = convs.map((c) => c.id);
    const rows = await all<{ conversation_id: string; body: string }>(
      `SELECT conversation_id, body FROM messages WHERE conversation_id IN (${marks}) ORDER BY created_at DESC`, ...ids);
    for (const r of rows) {
      if (!(r.conversation_id in lastByConv)) lastByConv[r.conversation_id] = r.body;
    }
  }
  return json({ conversations: convs.map((c) => ({ ...c, last_body: lastByConv[c.id] ?? '' })) });
});

// create/find conversation for a lead: PUT /api/conversations { leadId }
// (Tenant-scoped: a leadId from another business → 404, never a cross-tenant link.)
export const PUT = guard(async (req: NextRequest) => {
  const { error, businessId } = await requireBusiness(req);
  if (error || !businessId) return error;
  const body = await req.json().catch(() => ({}));
  if (!body.leadId) return json({ error: 'leadId required' }, 400);
  const lead = await get(`SELECT id FROM leads WHERE id=? AND business_id=?`, String(body.leadId), businessId);
  if (!lead) return json({ error: 'Lead not found' }, 404);
  const id = await ensureConversation(businessId, String(body.leadId));
  return json({ ok: true, id });
});
