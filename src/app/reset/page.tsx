'use client';
import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { SiteNav, SiteFooter } from '@/components/site';
import Link from 'next/link';

function ResetForm() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) setMsg('Missing reset token. Request a new link.');
  }, [token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMsg('');
    try {
      const r = await fetch('/api/auth/reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, password }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Failed');
      setDone(true); setMsg(j.message || 'Password updated.');
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Failed'); }
    finally { setBusy(false); }
  }

  return (
    <>
      {done ? (
        <div className="card pad" style={{ maxWidth: 420, margin: '0 auto', textAlign: 'center' }}>
          <div className="alert alert-ok">{msg}</div>
          <Link href="/login" className="btn btn-primary" style={{ marginTop: 12 }}>Log in</Link>
        </div>
      ) : (
        <form onSubmit={submit} className="card pad" style={{ maxWidth: 420, margin: '0 auto' }}>
          <label className="lbl">New password (8+ chars)</label>
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
          {msg && <div className="alert alert-err" style={{ marginTop: 12 }}>{msg}</div>}
          <button className="btn btn-primary" style={{ width: '100%', marginTop: 16 }} disabled={busy || !token}>{busy ? 'Updating…' : 'Update password'}</button>
          <div className="micro" style={{ textAlign: 'center', marginTop: 12 }}><Link href="/forgot">Request a new link</Link></div>
        </form>
      )}
    </>
  );
}

export default function Reset() {
  return (<><SiteNav /><main className="container section">
    <h2 style={{ textAlign: 'center' }}>Choose a new password</h2>
    <Suspense fallback={<div className="card pad" style={{ maxWidth: 420, margin: '0 auto', textAlign: 'center' }}>Loading…</div>}>
      <ResetForm />
    </Suspense>
  </main><SiteFooter /></>);
}
