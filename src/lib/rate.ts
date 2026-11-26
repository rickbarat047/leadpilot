const hits = new Map<string, { n: number; reset: number }>();

export function rateLimit(key: string, limit = 30, windowMs = 60000): boolean {
  const now = Date.now();
  const h = hits.get(key);
  if (!h || h.reset < now) {
    hits.set(key, { n: 1, reset: now + windowMs });
    return true;
  }
  h.n += 1;
  return h.n <= limit;
}
