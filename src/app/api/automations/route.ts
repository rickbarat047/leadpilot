import { NextRequest } from 'next/server';
import { requireBusiness, json, guard } from '@/lib/api';
import { all, run, get } from '@/lib/db';
import { nowIso } from '@/lib/ids';

export const GET = guard(async (req: NextRequest) => {
  const { error, businessId } = await requireBusiness(req);
  if (error || !businessId) return error;
  const url = new URL(req.url);
  if (url.searchParams.get('runs') === '1') {
    return json({ runs: await all(`SELECT * FROM automation_runs WHERE business_id=? ORDER BY created_at DESC LIMIT 100`, businessId) });
  }
  return json({ automations: await all(`SELECT * FROM automations WHERE business_id=? ORDER BY name`, businessId) });
});

export const PUT = guard(async (req: NextRequest) => {
  const { error, businessId } = await requireBusiness(req);
  if (error || !businessId) return error;
  const body = await req.json().catch(() => ({}));
  if (!body.id) return json({ error: 'id required' }, 400);
  const ex = await get(`SELECT id FROM automations WHERE id=? AND business_id=?`, body.id, businessId);
  if (!ex) return json({ error: 'Not found' }, 404);
  if (typeof body.enabled === 'number') await run(`UPDATE automations SET enabled=?, updated_at=? WHERE id=?`, body.enabled ? 1 : 0, nowIso(), body.id);
  if (typeof body.steps_json === 'string') await run(`UPDATE automations SET steps_json=?, updated_at=? WHERE id=?`, body.steps_json.slice(0, 20000), nowIso(), body.id);
  return json({ ok: true });
});
