'use client';
import { useState } from 'react';
import { SiteNav, SiteFooter } from '@/components/site';
import Link from 'next/link';

export default function Forgot() {
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMsg('');
    try {
      const r = await fetch('/api/auth/forgot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Failed');
      setMsg(j.message || 'If that email is registered, a reset link has been sent.');
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Failed'); }
    finally { setBusy(false); }
  }
  return (<><SiteNav /><main className="container section">
    <h2 style={{ textAlign: 'center' }}>Reset your password</h2>
    <p className="sub" style={{ textAlign: 'center' }}>Enter your email and we'll send a reset link.</p>
    <form onSubmit={submit} className="card pad" style={{ maxWidth: 420, margin: '0 auto' }}>
      <label className="lbl">Email</label>
      <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      {msg && <div className="alert alert-ok" style={{ marginTop: 12 }}>{msg}</div>}
      <button className="btn btn-primary" style={{ width: '100%', marginTop: 16 }} disabled={busy}>{busy ? 'Sending…' : 'Send reset link'}</button>
      <div className="micro" style={{ textAlign: 'center', marginTop: 12 }}><Link href="/login">Back to login</Link></div>
    </form>
  </main><SiteFooter /></>);
}
