'use client';
import { useEffect } from 'react';

/**
 * Global client error boundary — replaces the blank white page. Logs the
 * error (rate-limited) to /api/logs → system_logs, then offers a retry.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    fetch('/api/logs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        scope: 'client',
        level: 'error',
        message: `${error.message ?? 'Unknown error'}${error.digest ? ` [digest ${error.digest}]` : ''}`,
      }),
    }).catch(() => undefined);
  }, [error]);
  return (
    <div style={{ maxWidth: 560, margin: '64px auto', padding: '0 16px' }}>
      <div className="card pad">
        <div style={{ fontWeight: 800, fontSize: 18 }}>Something went wrong</div>
        <p style={{ color: 'var(--muted)', fontSize: 14.5 }}>
          An unexpected error occurred — it has been logged. Try again, and if it keeps
          happening the support team can look it up by time.
        </p>
        {error?.digest ? <div className="micro">Reference: {error.digest}</div> : null}
        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          <button className="btn btn-primary btn-sm" onClick={() => reset()}>Try again</button>
          <a className="btn btn-ghost btn-sm" href="/">Go home</a>
        </div>
      </div>
    </div>
  );
}
