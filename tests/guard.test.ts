import { describe, it, expect } from 'vitest';
import { guard, json } from '../src/lib/api';

describe('api guard', () => {
  it('turns a thrown error into a friendly JSON 500 (never a blank/HTML body)', async () => {
    const handler = guard(async (_req: Request) => {
      throw new Error('boom');
    });
    const res = await handler(new Request('http://localhost/api/test'));
    expect(res).toBeInstanceOf(Response);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain('logged');
  });

  it('passes through a normal return untouched', async () => {
    const handler = guard(async (_req: Request) => json({ ok: true }, 201));
    const res = await handler(new Request('http://localhost/api/test'));
    expect(res.status).toBe(201);
    expect((await res.json()).ok).toBe(true);
  });

  it('does not swallow non-Response returns (strings, objects)', async () => {
    const handler = guard(async (_req: Request) => 'plain');
    await expect(handler(new Request('http://localhost/api/test'))).resolves.toBe('plain');
  });

  it('handles non-Error throwables', async () => {
    const handler = guard(async (_req: Request) => {
      throw 'string failure';
    });
    const res = await handler(new Request('http://localhost/api/test'));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toContain('logged');
  });

  it('keeps handler arguments flowing (req + params)', async () => {
    const handler = guard(async (req: Request, ctx: { params: { id: string } }) =>
      json({ method: req.method, id: ctx.params.id }));
    const res = await handler(new Request('http://localhost/api/x', { method: 'PATCH' }), { params: { id: 'lead_1' } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ method: 'PATCH', id: 'lead_1' });
  });
});
