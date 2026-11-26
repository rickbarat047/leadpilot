import { NextRequest } from 'next/server';
import { get, run } from '@/lib/db';
import { json, guard } from '@/lib/api';
import { rateLimit } from '@/lib/rate';
import { config } from '@/lib/config';
import { uid } from '@/lib/ids';
import { queueEmail } from '@/lib/messaging';

export const POST = guard(async (req: NextRequest) => {
  if (!rateLimit('forgot:' + (req.headers.get('x-forwarded-for') ?? 'local'), 5, 60000)) {
    return json({ error: 'Too many attempts. Try again shortly.' }, 429);
  }
  const body = await req.json().catch(() => ({}));
  const email = String(body.email ?? '').trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: 'Enter a valid email.' }, 400);
  }
  // Always respond ok to avoid leaking which emails are registered.
  try {
    const u = await get<{ id: string; name: string; business_id?: string }>(
      `SELECT u.id, u.name, m.business_id FROM users u LEFT JOIN memberships m ON m.user_id=u.id WHERE u.email=? LIMIT 1`, email);
    if (u) {
      const token = uid('rst');
      const expires = new Date(Date.now() + 3600000).toISOString();
      await run(`UPDATE users SET reset_token=?, reset_expires=? WHERE id=?`, token, expires, u.id);
      const link = `${config.appUrl}/reset?token=${token}`;
      const bizId = u.business_id ?? '';
      await queueEmail(bizId, email, 'Reset your LeadPilot password',
        `Hi ${u.name || 'there'},\n\nReset your password by opening this link:\n${link}\n\nThe link expires in 1 hour. If you didn't request this, ignore this email.\n\n— LeadPilot`);
    }
  } catch { /* best effort */ }
  return json({ ok: true, message: 'If that email is registered, a reset link has been sent.' });
});
