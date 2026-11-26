import { NextRequest } from 'next/server';
import { requireBusiness, json, guard } from '@/lib/api';
import { get, run } from '@/lib/db';

export const PATCH = guard(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const { error, businessId } = await requireBusiness(req);
  if (error || !businessId) return error;
  const body = await req.json().catch(() => ({}));
  const ap = await get<{ id: string }>(`SELECT id FROM appointments WHERE id=? AND business_id=?`, params.id, businessId);
  if (!ap) return json({ error: 'Not found' }, 404);
  const allowed = ['booked', 'completed', 'cancelled', 'no-show'];
  if (body.status && !allowed.includes(body.status)) return json({ error: 'Invalid status' }, 400);
  if (body.status) await run(`UPDATE appointments SET status=? WHERE id=?`, body.status, params.id);
  if (body.starts_at) await run(`UPDATE appointments SET starts_at=? WHERE id=?`, new Date(body.starts_at).toISOString(), params.id);
  return json({ ok: true });
});
