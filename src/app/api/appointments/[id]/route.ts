import { NextRequest } from 'next/server';
import { requireBusiness, json, guard } from '@/lib/api';
import { get, run } from '@/lib/db';
import { validateAppointmentPatch } from '@/lib/appointment-patch';

export const PATCH = guard(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const { error, businessId } = await requireBusiness(req);
  if (error || !businessId) return error;
  const body = await req.json().catch(() => ({}));
  const ap = await get<{ id: string; status: string }>(
    `SELECT id, status FROM appointments WHERE id=? AND business_id=?`,
    params.id,
    businessId,
  );
  if (!ap) return json({ error: 'Not found' }, 404);
  const decision = validateAppointmentPatch(ap.status, {
    status: body.status,
    starts_at: body.starts_at,
  });
  if (!decision.ok) {
    return json({ error: decision.reason }, decision.http);
  }
  if (decision.status) {
    await run(`UPDATE appointments SET status=? WHERE id=? AND business_id=?`, decision.status, params.id, businessId);
  }
  return json({ ok: true });
});
