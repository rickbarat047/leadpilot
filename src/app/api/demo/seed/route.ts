import { json, guard } from '@/lib/api';
import { ensureDemoBusiness } from '@/lib/demo';
import { config } from '@/lib/config';
export const POST = guard(async () => {
  if (!config.demoEnabled) return json({ error: 'Demo disabled' }, 403);
  const id = await ensureDemoBusiness();
  return json({ ok: true, businessId: id, login: { email: 'demo@leadpilot.local', password: 'demo1234' } });
});
