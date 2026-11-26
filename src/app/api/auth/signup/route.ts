import { NextRequest } from 'next/server';
import { signupSchema } from '@/lib/validation';
import { hashPassword, signSession, setSessionCookie, createUserWithBusiness } from '@/lib/auth';
import { get, run } from '@/lib/db';
import { json, guard } from '@/lib/api';
import { rateLimit } from '@/lib/rate';
import { config } from '@/lib/config';
import { uid } from '@/lib/ids';
import { queueEmail } from '@/lib/messaging';

export const POST = guard(async (req: NextRequest) => {
  if (rateLimit('signup:' + (req.headers.get('x-forwarded-for') ?? 'local'), 10, 60000)) {
    // fall through
  } else {
    return json({ error: 'Too many attempts. Try again shortly.' }, 429);
  }
  const body = await req.json().catch(() => ({}));
  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, 400);
  const { name, email, password, businessName } = parsed.data;
  const ex = await get(`SELECT id FROM users WHERE email=?`, email.toLowerCase());
  if (ex) return json({ error: 'An account with this email already exists.' }, 409);
  const { userId, businessId } = await createUserWithBusiness(name, email, password ? await hashPassword(password) : '', businessName ?? '');

  // Email verification (best-effort; never blocks signup).
  try {
    const token = uid('vrf');
    const expires = new Date(Date.now() + 24 * 3600000).toISOString();
    await run(`UPDATE users SET verify_token=?, verify_expires=? WHERE id=?`, token, expires, userId);
    const link = `${config.appUrl}/api/auth/verify?token=${token}`;
    await queueEmail(businessId, email.toLowerCase(),
      'Verify your LeadPilot email',
      `Hi ${name},\n\nWelcome to LeadPilot! Please verify your email by opening this link:\n${link}\n\nThe link expires in 24 hours. If you didn't sign up, ignore this email.\n\n— LeadPilot`);
  } catch { /* best effort */ }

  await run(`INSERT INTO audit_logs (id, business_id, user_id, action, detail) VALUES (?, ?, ?, ?, ?)`,
    `aud_${Date.now().toString(36)}`, businessId, userId, 'auth.signup', email);
  const token = await signSession({ id: userId, email: email.toLowerCase(), name, role: 'owner', businessId });
  await setSessionCookie(token);
  return json({ ok: true, next: '/onboarding', verifySent: true });
});
