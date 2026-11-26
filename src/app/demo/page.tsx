'use client';
import { useState } from 'react';
import Link from 'next/link';
import { SiteNav, SiteFooter } from '@/components/site';

export default function Demo() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  async function seed() {
    setBusy(true); setMsg('');
    try {
      await fetch('/api/demo/seed', { method: 'POST' });
      setMsg('Sample business ready. Log in with demo@leadpilot.local / demo1234 to explore.');
    } catch { setMsg('Could not seed demo.'); }
    setBusy(false);
  }
  return (
    <><SiteNav /><main className="container section">
      <span className="badge-sample">Fictional sample data</span>
      <h2>Explore a live salon, already running</h2>
      <p className="sub">Glow & Co. (Sample) comes with realistic fictional leads, conversations, appointments, automations and analytics. Nothing here is a real business.</p>
      <div className="grid-2">
        <div className="card pad">
          <div style={{ fontWeight: 800 }}>Try the demo in 2 clicks</div>
          <div className="micro">1. Seed the sample business · 2. Log in as the demo owner.</div>
          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            <button className="btn btn-primary btn-sm" onClick={seed} disabled={busy}>{busy ? 'Seeding…' : 'Seed demo data'}</button>
            <Link href="/login" className="btn btn-ghost btn-sm">Go to login</Link>
          </div>
          {msg && <div className="alert alert-ok">{msg}</div>}
          <div className="micro">Credentials: demo@leadpilot.local / demo1234</div>
        </div>
        <div className="card pad">
          <div style={{ fontWeight: 800 }}>What you will see</div>
          <ul className="tick">
            <li>7 sample leads across every status</li>
            <li>AI-classified services + instant replies</li>
            <li>Booked + completed appointments with reminders</li>
            <li>Follow-up + escalation playbooks with run logs</li>
          </ul>
        </div>
      </div>
    </main><SiteFooter /></>
  );
}
