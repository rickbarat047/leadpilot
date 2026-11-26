import { NextRequest } from 'next/server';
import { requireBusiness, json, guard } from '@/lib/api';
import { get, run, all } from '@/lib/db';
import { businessSchema } from '@/lib/validation';
import { overview, seriesBookings } from '@/lib/analytics';
import { normalizeBusinessHours } from '@/lib/business-hours';

export const GET = guard(async (req: NextRequest) => {
  const { error, businessId } = await requireBusiness(req);
  if (error || !businessId) return error;
  const biz = await get(`SELECT * FROM businesses WHERE id=?`, businessId);
  const services = await all(`SELECT * FROM services WHERE business_id=? ORDER BY name`, businessId);
  const sub = await get(`SELECT * FROM subscriptions WHERE business_id=?`, businessId);
  let hours: unknown = {};
  try { hours = biz ? JSON.parse(biz.hours_json || '{}') : {}; } catch { hours = {}; }
  return json({ business: biz, businessHours: normalizeBusinessHours(hours), services, subscription: sub, stats: await overview(businessId), series: await seriesBookings(businessId) });
});

export const PUT = guard(async (req: NextRequest) => {
  const { error, businessId } = await requireBusiness(req);
  if (error || !businessId) return error;
  const body = await req.json().catch(() => ({}));
  const parsed = businessSchema.safeParse(body);
  if (!parsed.success) return json({ error: 'Invalid input' }, 400);
  const b = parsed.data;
  const cur = await get<{ settings_json: string; hours_json: string }>(`SELECT settings_json, hours_json FROM businesses WHERE id=?`, businessId);
  const settings = { ...(cur ? JSON.parse(cur.settings_json || '{}') : {}), ...(typeof b.settings === 'object' ? b.settings : {}) };
  let currentHours: unknown = {};
  try { currentHours = cur ? JSON.parse(cur.hours_json || '{}') : {}; } catch { currentHours = {}; }
  await run(`UPDATE businesses SET name=COALESCE(?, name), industry=COALESCE(?, industry), description=COALESCE(?, description),
    location=COALESCE(?, location), phone=COALESCE(?, phone), email=COALESCE(?, email), website=COALESCE(?, website),
    hours_json=?, settings_json=?, onboarding_step=GREATEST(onboarding_step, 8) WHERE id=?`,
    b.name ?? null, b.industry ?? null, b.description ?? null, b.location ?? null, b.phone ?? null, b.email ?? null, b.website ?? null,
    JSON.stringify(b.hours ?? currentHours), JSON.stringify(settings), businessId);
  if (Array.isArray((body as Record<string, unknown>).services)) {
    await run(`DELETE FROM services WHERE business_id=?`, businessId);
    const { uid } = await import('@/lib/ids');
    for (const s of (body as { services: { name: string; price: number; duration?: number }[] }).services.slice(0, 40)) {
      if (!s.name) continue;
      await run(`INSERT INTO services (id, business_id, name, price, duration_min) VALUES (?, ?, ?, ?, ?)`,
        uid('svc'), businessId, String(s.name).slice(0, 120), Number(s.price) || 0, Number(s.duration) || 30);
    }
  }
  return json({ ok: true });
});
