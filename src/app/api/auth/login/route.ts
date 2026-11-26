import { NextRequest } from 'next/server';
import { loginSchema } from '@/lib/validation';
import { verifyPassword, signSession, setSessionCookie, businessForUser, ensureSubscription, seedBusinessDefaults } from '@/lib/auth';
import { get, run } from '@/lib/db';
import { ensureDemoBusiness } from '@/lib/demo';
import { config } from '@/lib/config';
import { json, guard } from '@/lib/api';
import { rateLimit } from '@/lib/rate';

export const POST = guard(async (req: NextRequest) => {
  if (!rateLimit('login:' + (req.headers.get('x-forwarded-for') ?? 'local'), 20, 60000)) {
    return json({ error: 'Too many attempts.' }, 429);
  }
  const body = await req.json().catch(() => ({}));
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) return json({ error: 'Enter a valid email and password.' }, 400);
  const { email, password } = parsed.data;

  // Demo login (seeded fictional business)
  if (email.toLowerCase() === 'demo@leadpilot.local' && password === 'demo1234' && config.demoEnabled) {
    const bizId = await ensureDemoBusiness();
    const u = await get<{ id: string; name: string }>(`SELECT id, name FROM users WHERE email=?`, email.toLowerCase());
    const token = await signSession({ id: u!.id, email: email.toLowerCase(), name: u!.name, role: 'owner', businessId: bizId });
    await setSessionCookie(token);
    return json({ ok: true, next: '/app', demo: true });
  }
  // Admin login
  if (email.toLowerCase() === config.adminEmail.toLowerCase() && password === config.adminPassword) {
    let u = await get<{ id: string }>(`SELECT id FROM users WHERE email=?`, email.toLowerCase());
    if (!u) {
      const id = `usr_admin`;
      const { hashPassword } = await import('@/lib/auth');
      await run(`INSERT INTO users (id, email, password_hash, name, role) VALUES (?, ?, ?, ?, 'admin')`, id, email.toLowerCase(), await hashPassword(password), 'Admin');
      u = { id };
    }
    const token = await signSession({ id: u.id, email: email.toLowerCase(), name: 'Admin', role: 'admin', businessId: null });
    await setSessionCookie(token);
    return json({ ok: true, next: '/admin' });
  }

  const u = await get<{ id: string; password_hash: string; name: string; role: string }>(`SELECT id, password_hash, name, role FROM users WHERE email=?`, email.toLowerCase());
  if (!u || !(await verifyPassword(password, u.password_hash))) {
    return json({ error: 'Incorrect email or password.' }, 401);
  }
  const businessId = await businessForUser(u.id);
  if (businessId) { await seedBusinessDefaults(businessId); await ensureSubscription(businessId); }
  const biz = businessId ? await get<{ onboarding_done: number }>(`SELECT onboarding_done FROM businesses WHERE id=?`, businessId) : null;
  const token = await signSession({ id: u.id, email: email.toLowerCase(), name: u.name, role: u.role, businessId });
  await setSessionCookie(token);
  const next = u.role === 'admin' && !businessId ? '/admin' : biz && !biz.onboarding_done ? '/onboarding' : '/app';
  return json({ ok: true, next });
});
