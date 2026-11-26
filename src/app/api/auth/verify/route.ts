import { NextRequest, NextResponse } from 'next/server';
import { get, run } from '@/lib/db';
import { guard } from '@/lib/api';

export const dynamic = 'force-dynamic';

export const GET = guard(async (req: NextRequest) => {
  const token = new URL(req.url).searchParams.get('token') ?? '';
  if (!token) {
    return NextResponse.redirect(new URL('/login?verify=missing', req.url));
  }
  const u = await get<{ id: string; verify_expires: string | null }>(
    `SELECT id, verify_expires FROM users WHERE verify_token=?`, token);
  if (!u) {
    return NextResponse.redirect(new URL('/login?verify=invalid', req.url));
  }
  if (u.verify_expires && new Date(u.verify_expires).getTime() < Date.now()) {
    return NextResponse.redirect(new URL('/login?verify=expired', req.url));
  }
  await run(`UPDATE users SET email_verified=1, verify_token=NULL, verify_expires=NULL WHERE id=?`, u.id);
  return NextResponse.redirect(new URL('/login?verified=1', req.url));
});
