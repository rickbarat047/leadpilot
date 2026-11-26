import { NextRequest } from 'next/server';
import { requireBusiness, json, guard } from '@/lib/api';
import { all, run } from '@/lib/db';
import { uid } from '@/lib/ids';

export const GET = guard(async (req: NextRequest) => {
  const { error, businessId } = await requireBusiness(req);
  if (error || !businessId) return error;
  return json({ entries: await all(`SELECT * FROM knowledge_entries WHERE business_id=? ORDER BY created_at DESC`, businessId) });
});

export const POST = guard(async (req: NextRequest) => {
  const { error, businessId } = await requireBusiness(req);
  if (error || !businessId) return error;
  const body = await req.json().catch(() => ({}));
  if (!body.title || !body.body) return json({ error: 'title and body required' }, 400);
  const id = uid('kn');
  await run(`INSERT INTO knowledge_entries (id, business_id, kind, title, body) VALUES (?, ?, ?, ?, ?)`,
    id, businessId, String(body.kind ?? 'faq').slice(0, 30), String(body.title).slice(0, 200), String(body.body).slice(0, 4000));
  return json({ ok: true, id }, 201);
});

export const DELETE = guard(async (req: NextRequest) => {
  const { error, businessId } = await requireBusiness(req);
  if (error || !businessId) return error;
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return json({ error: 'id required' }, 400);
  await run(`DELETE FROM knowledge_entries WHERE id=? AND business_id=?`, id, businessId);
  return json({ ok: true });
});
