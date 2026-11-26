'use client';
import { useEffect } from 'react';

/** Reports the 404 path to /api/logs (rate-limited server-side). Render-only — no UI. */
export default function Log404() {
  useEffect(() => {
    fetch('/api/logs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ scope: 'notfound', level: 'warn', message: `404 ${window.location.pathname}` }),
    }).catch(() => undefined);
  }, []);
  return null;
}
