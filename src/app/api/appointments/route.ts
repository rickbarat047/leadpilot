import { NextRequest } from 'next/server';
import { requireBusiness, json, guard } from '@/lib/api';
import { all, get } from '@/lib/db';
import { createBooking, findConversationForLead } from '@/lib/booking';

function first<T>(value: T | T[] | undefined | null): T | undefined {
  return Array.isArray(value) ? value[0] : (value ?? undefined);
}

export const GET = guard(async (req: NextRequest) => {
  const { error, businessId } = await requireBusiness(req);
  if (error || !businessId) return error;
  const appointments = await all(`SELECT * FROM appointments WHERE business_id=? ORDER BY starts_at DESC LIMIT 200`, businessId);
  return json({ appointments });
});

/** Owner-facing manual booking. All writes go through the central booking service. */
export const POST = guard(async (req: NextRequest) => {
  const { error, businessId } = await requireBusiness(req);
  if (error || !businessId) return error;
  const body = await req.json().catch(() => ({}));
  const customerName = String(body.customer_name ?? body.name ?? '').trim();
  const startsAt = String(body.starts_at ?? '').trim();
  if (!customerName || !startsAt || Number.isNaN(new Date(startsAt).getTime())) {
    return json({ error: 'customer_name and a valid starts_at are required' }, 400);
  }

  let leadId: string | undefined;
  if (body.lead_id) {
    const lead = await get<{ id: string }>(`SELECT id FROM leads WHERE id=? AND business_id=?`, String(body.lead_id), businessId);
    if (!lead) return json({ error: 'Lead not found' }, 404);
    leadId = lead.id;
  }

  const conversationId = leadId ? await findConversationForLead(businessId, leadId) : undefined;
  const result = await createBooking({
    businessId,
    leadId,
    conversationId,
    customerName,
    service: body.service ? String(body.service) : undefined,
    startsAt,
    endsAt: body.ends_at ? String(body.ends_at) : undefined,
    source: 'manual',
    ownerOverrideHours: true,
  });

  const status = result.status === 'created' ? 201
    : result.status === 'slot_unavailable' || result.status === 'already_booked' ? 409
    : result.status === 'lead_not_found' || result.status === 'business_not_found' ? 404
    : 400;
  return json({
    ok: status === 201,
    status: result.status,
    appointmentId: result.appointmentId,
    message: result.message ?? undefined,
  }, status);
});
