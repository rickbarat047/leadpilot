import { clearSessionCookie } from '@/lib/auth';
import { json, guard } from '@/lib/api';
export const POST = guard(async () => {
  await clearSessionCookie();
  return json({ ok: true, next: '/' });
});
