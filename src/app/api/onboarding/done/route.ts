import { NextRequest } from 'next/server';
import { requireBusiness, json, guard } from '@/lib/api';
import { run } from '@/lib/db';
export const POST = guard(async (req: NextRequest) => {
  const { error, businessId } = await requireBusiness(req);
  if (error || !businessId) return error;
  await run(`UPDATE businesses SET onboarding_done=1, onboarding_step=14 WHERE id=?`, businessId);
  return json({ ok: true });
});
