import Link from 'next/link';
import Log404 from '@/components/log404';

export default function NotFound() {
  return (
    <div style={{ maxWidth: 560, margin: '64px auto', padding: '0 16px' }}>
      <Log404 />
      <div className="card pad" style={{ textAlign: 'center' }}>
        <div style={{ fontFamily: 'var(--serif)', fontSize: 44, fontStyle: 'italic' }}>404</div>
        <div style={{ fontWeight: 800, fontSize: 18, marginTop: 6 }}>Page not found</div>
        <p style={{ color: 'var(--muted)', fontSize: 14.5 }}>
          The page you requested does not exist (it may have been renamed or removed).
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 14 }}>
          <Link className="btn btn-primary btn-sm" href="/">Go home</Link>
          <Link className="btn btn-ghost btn-sm" href="/app">Open app</Link>
        </div>
      </div>
    </div>
  );
}
