import { NextRequest } from 'next/server';
import { requireBusiness, json, guard } from '@/lib/api';
import { freeSlotsForBusiness } from '@/lib/slots';

export const GET = guard(async (req: NextRequest) => {
  const { error, businessId } = await requireBusiness(req);
  if (error || !businessId) return error;
  const url = new URL(req.url);
  const days = Math.min(14, Math.max(1, Number(url.searchParams.get('days') ?? 7)));
  const duration = Math.min(240, Math.max(15, Number(url.searchParams.get('duration') ?? 60)));
  const slots = await freeSlotsForBusiness(businessId, { days, duration });
  // Return a compact, human-readable subset for the picker (first 12).
  return json({ slots: slots.slice(0, 12), total: slots.length, days, duration });
});
