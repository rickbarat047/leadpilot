import { NextRequest } from 'next/server';
import { get, run } from '@/lib/db';
import { json, guard } from '@/lib/api';
import { rateLimit } from '@/lib/rate';
import { hashPassword } from '@/lib/auth';

export const POST = guard(async (req: NextRequest) => {
  if (!rateLimit('reset:' + (req.headers.get('x-forwarded-for') ?? 'local'), 10, 60000)) {
    return json({ error: 'Too many attempts. Try again shortly.' }, 429);
  }
  const body = await req.json().catch(() => ({}));
  const token = String(body.token ?? '').trim();
  const password = String(body.password ?? '');
  if (!token) return json({ error: 'Reset token required.' }, 400);
  if (password.length < 8) return json({ error: 'Password must be at least 8 characters.' }, 400);

  const u = await get<{ id: string; reset_expires: string | null }>(
    `SELECT id, reset_expires FROM users WHERE reset_token=?`, token);
  if (!u) return json({ error: 'Invalid or expired reset link.' }, 400);
  if (u.reset_expires && new Date(u.reset_expires).getTime() < Date.now()) {
    return json({ error: 'Reset link expired. Request a new one.' }, 400);
  }
  await run(`UPDATE users SET password_hash=?, reset_token=NULL, reset_expires=NULL WHERE id=?`,
    await hashPassword(password), u.id);
  return json({ ok: true, message: 'Password updated. You can now log in.' });
});
