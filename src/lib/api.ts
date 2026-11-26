import { NextRequest, NextResponse } from 'next/server';
import { readSession, businessForUser } from './auth';
import { get } from './db';

export async function requireUser() {
  const s = await readSession();
  if (!s) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) as NextResponse, user: null };
  const dbUser = await get<{ id: string; email: string; name: string; role: string }>(`SELECT id, email, name, role FROM users WHERE id=?`, s.id);
  if (!dbUser) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) as NextResponse, user: null };
  return { error: null as unknown as NextResponse, user: { ...dbUser, businessId: await businessForUser(dbUser.id) } };
}

export async function requireBusiness(req: NextRequest) {
  const { error, user } = await requireUser();
  if (error || !user) return { error: error as NextResponse, businessId: null as null, user: null };
  const url = new URL(req.url);
  const asBiz = url.searchParams.get('businessId');
  let businessId = user.businessId;
  if (asBiz && user.role === 'admin') businessId = asBiz;
  if (!businessId) return { error: NextResponse.json({ error: 'No business' }, { status: 400 }) as NextResponse, businessId: null as null, user };
  return { error: null as unknown as NextResponse, businessId: businessId as string, user };
}

export function json(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

/**
 * Route handler wrapper (Next 14.2 has no onRequestError hook): unexpected
 * exceptions become a structured one-line JSON `[api-error]` log plus a friendly
 * JSON 500 — never a blank body. Expected failures must still return json(...)
 * responses; only thrown errors hit this path.
 */
export function guard<A extends unknown[], R>(
  fn: (...args: A) => Promise<R>,
): (...args: A) => Promise<R | NextResponse> {
  return async (...args: A): Promise<R | NextResponse> => {
    try {
      return await fn(...args);
    } catch (e) {
      const req = args[0] instanceof Request ? (args[0] as Request) : null;
      let path = '-';
      try { path = req ? new URL(req.url).pathname : '-'; } catch { /* keep '-' */ }
      const err = e instanceof Error ? e : new Error(String(e));
      console.error(`[api-error] ${JSON.stringify({
        evt: 'api-error',
        method: req?.method ?? '-',
        path,
        message: err.message.slice(0, 500),
        stack: (err.stack ?? '').split('\n').slice(1, 4).map((s) => s.trim()).join(' | ').slice(0, 400),
        at: new Date().toISOString(),
      })}`);
      return json({ error: 'Something went wrong. The error has been logged.' }, 500);
    }
  };
}
