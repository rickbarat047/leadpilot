import { NextRequest } from 'next/server';
import { requireBusiness, json, guard } from '@/lib/api';
import { get, run } from '@/lib/db';
import { nowIso } from '@/lib/ids';

const STATUSES = ['New', 'Contacted', 'Qualified', 'Appointment Booked', 'Completed', 'Won', 'Lost', 'No Response'];

export const PATCH = guard(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const { error, businessId } = await requireBusiness(req);
  if (error || !businessId) return error;
  const body = await req.json().catch(() => ({}));
  const lead = await get<{ id: string }>(`SELECT id FROM leads WHERE id=? AND business_id=?`, params.id, businessId);
  if (!lead) return json({ error: 'Lead not found' }, 404);
  const updates: string[] = [];
  const vals: unknown[] = [];
  if (body.status && STATUSES.includes(body.status)) { updates.push('status=?'); vals.push(body.status); }
  if (typeof body.owner === 'string') { updates.push('owner=?'); vals.push(body.owner.slice(0, 80)); }
  if (typeof body.service === 'string') { updates.push('service=?'); vals.push(body.service.slice(0, 120)); }
  if (typeof body.score === 'number') { updates.push('score=?'); vals.push(Math.max(0, Math.min(100, body.score))); }
  if (typeof body.value === 'number') { updates.push('value=?'); vals.push(body.value); }
  if (body.next_followup_at === null) { updates.push('next_followup_at=NULL'); }
  if (typeof body.next_followup_at === 'string' && !isNaN(Date.parse(body.next_followup_at))) {
    updates.push('next_followup_at=?');
    vals.push(new Date(body.next_followup_at).toISOString());
  }
  if (!updates.length) return json({ error: 'Nothing to update' }, 400);
  updates.push('last_interaction_at=?');
  vals.push(nowIso(), params.id, businessId);
  await run(`UPDATE leads SET ${updates.join(', ')} WHERE id=? AND business_id=?`, ...vals);
  await run(`INSERT INTO audit_logs (id, business_id, action, detail) VALUES (?, ?, ?, ?)`, `aud_${Date.now().toString(36)}`, businessId, 'lead.update', params.id);
  return json({ ok: true });
});
