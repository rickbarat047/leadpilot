'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { SiteNav, SiteFooter } from '@/components/site';

function AuthForm({ mode }: { mode: 'login' | 'signup' }) {
  const [form, setForm] = useState({ name: '', email: '', password: '', businessName: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Failed');
      router.push(j.next || '/app');
    } catch (e) { setErr(e instanceof Error ? e.message : 'Failed'); }
    finally { setBusy(false); }
  }
  return (
    <form onSubmit={submit} className="card pad" style={{ maxWidth: 480, margin: '0 auto' }}>
      {mode === 'signup' && (<><label className="lbl">Your name</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></>)}
      <label className="lbl">Email</label>
      <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
      <label className="lbl">Password {mode === 'signup' && '(8+ chars)'}</label>
      <input className="input" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={mode === 'signup' ? 8 : 1} />
      {mode === 'signup' && (<><label className="lbl">Business name</label><input className="input" value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} placeholder="Glow & Co." /></>)}
      {err && <div className="alert alert-err">{err}</div>}
      <button className="btn btn-primary" style={{ width: '100%', marginTop: 16 }} disabled={busy}>{busy ? 'Please wait…' : mode === 'signup' ? 'Start free trial' : 'Log in'}</button>
      <div className="micro" style={{ textAlign: 'center', marginTop: 12 }}>
        {mode === 'signup' ? (<>Have an account? <Link href="/login">Log in</Link> · Try <Link href="/demo">demo</Link></>) : (<>New here? <Link href="/signup">Start trial</Link> · Try <Link href="/demo">demo</Link></>)}
      </div>
      {mode === 'login' && <div className="micro" style={{ textAlign: 'center' }}>Demo login: demo@leadpilot.local / demo1234 · <Link href="/forgot">Forgot password?</Link></div>}
    </form>
  );
}

export function LoginPage() {
  return (<><SiteNav /><main className="container section"><h2 style={{ textAlign: 'center' }}>Welcome back</h2><AuthForm mode="login" /></main><SiteFooter /></>);
}
export function SignupPage() {
  return (<><SiteNav /><main className="container section"><h2 style={{ textAlign: 'center' }}>Start your 14-day trial</h2><p className="sub" style={{ textAlign: 'center' }}>Full Growth features. No card required.</p><AuthForm mode="signup" /></main><SiteFooter /></>);
}
