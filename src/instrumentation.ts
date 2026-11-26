/**
 * Next.js instrumentation (requires experimental.instrumentationHook in 14.2).
 * Catches unhandled errors thrown inside API route handlers and emits a
 * structured one-line JSON log so failures are greppable in Vercel instead of
 * silent. Must never throw — and must never import db here (this file is also
 * bundled for the edge runtime, where pg's Node deps don't exist).
 */

export async function register() {
  // No per-runtime init needed yet.
}

type Loose = Record<string, unknown>;

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

export async function onRequestError(a: unknown, b: unknown, c?: unknown): Promise<void> {
  try {
    // Signature differs across Next minors (error-first vs request-first) — detect both.
    const err = (a instanceof Error ? a : b instanceof Error ? b : null) as (Error & { digest?: string }) | null;
    const other = (a instanceof Error ? b : a) as Loose | undefined;
    const ctx = (c ?? {}) as Loose;
    const reqLike = other instanceof Request ? { url: other.url, method: other.method } : (other ?? {});
    let path = str(reqLike.path) || str(ctx.routePath) || str(reqLike.url);
    if (path.startsWith('http')) {
      try { path = new URL(path).pathname; } catch { /* keep raw */ }
    }
    const method = str(reqLike.method) || 'POST';
    const line = JSON.stringify({
      evt: 'api-error',
      method,
      path: path || '(unknown path)',
      message: err?.message ?? 'unknown error',
      digest: err?.digest ?? undefined,
      at: new Date().toISOString(),
    });
    console.error(`[api-error] ${line}`);
  } catch {
    // Never propagate from the logger.
  }
}
