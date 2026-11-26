import { requireUser, guard } from '@/lib/api';
import { get } from '@/lib/db';
import { json } from '@/lib/api';
export const GET = guard(async () => {
  const { error, user } = await requireUser();
  if (error || !user) return error;
  const biz = user.businessId ? await get(`SELECT id, name, onboarding_done, industry FROM businesses WHERE id=?`, user.businessId) : null;
  return json({ user: { id: user.id, email: user.email, name: user.name, role: user.role }, businessId: user.businessId, business: biz });
});
