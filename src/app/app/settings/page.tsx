'use client';
import { useState, useEffect } from 'react';
import { api } from '@/components/api';

const NOTIF_KEYS: [string, string, string][] = [
  ['emailOwnerAlerts', 'New lead & escalation alerts', 'Email the owner when a lead arrives or the AI pauses a reply for review.'],
  ['emailBookingConfirm', 'Booking confirmations', 'Customer receives a confirmation; the owner receives an alert.'],
  ['emailFollowups', 'Follow-up emails', 'The no-reply chase (15m / 6h / 24h) is also emailed to the lead.'],
  ['emailReminders', 'Appointment reminders', 'Sent 24h and 2h before the appointment.'],
  ['emailReviews', 'Review requests', 'Sent after completed appointments (add a review link below).'],
];

export default function Settings() {
  const [form, setForm] = useState({ name: '', industry: '', phone: '', email: '', location: '', description: '' });
  const [health, setHealth] = useState<Record<string, unknown> | null>(null);
  const [notif, setNotif] = useState<Record<string, boolean>>({});
  const [reviewLink, setReviewLink] = useState('');
  const [msg, setMsg] = useState('');
  const [notifMsg, setNotifMsg] = useState('');
  useEffect(() => {
    fetch('/api/business').then((r) => r.json()).then((j) => {
      const b = j.business ?? {};
      setForm({ name: b.name ?? '', industry: b.industry ?? '', phone: b.phone ?? '', email: b.email ?? '', location: b.location ?? '', description: b.description ?? '' });
      let s: Record<string, unknown> = {};
      try { s = JSON.parse(b.settings_json || '{}'); } catch { s = {}; }
      const initial: Record<string, boolean> = {};
      for (const [k] of NOTIF_KEYS) initial[k] = s[k] !== false;
      setNotif(initial);
      setReviewLink(typeof s.reviewLink === 'string' ? s.reviewLink : '');
    }).catch(() => undefined);
    fetch('/api/health').then((r) => r.json()).then(setHealth).catch(() => undefined);
  }, []);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    try { await api('/api/business', { method: 'PUT', body: JSON.stringify(form) }); setMsg('Saved.'); }
    catch (e) { setMsg(e instanceof Error ? e.message : 'Failed'); }
  }
  async function saveNotif() {
    setNotifMsg('');
    try {
      await api('/api/business', { method: 'PUT', body: JSON.stringify({ settings: { ...notif, reviewLink: reviewLink.trim() } }) });
      setNotifMsg('Saved.');
    } catch (e) { setNotifMsg(e instanceof Error ? e.message : 'Failed'); }
  }
  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Settings</h2>
      {msg && <div className="alert alert-ok">{msg}</div>}
      <div className="grid-2">
        <form onSubmit={save} className="card pad">
          <div style={{ fontWeight: 800 }}>Business profile</div>
          {(['name', 'industry', 'phone', 'email', 'location'] as const).map((k) => (
            <div key={k}><label className="lbl">{k}</label><input className="input" value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} /></div>
          ))}
          <label className="lbl">Description</label>
          <textarea className="textarea" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <button className="btn btn-primary btn-sm" style={{ marginTop: 12 }}>Save</button>
        </form>
        <div className="card pad">
          <div style={{ fontWeight: 800 }}>System health</div>
          <pre style={{ fontSize: 12.5, background: '#f4f1ec', padding: 12, borderRadius: 8, overflow: 'auto' }}>{JSON.stringify(health, null, 2) ?? '…'}</pre>
          <div className="micro">Cron: POST /api/cron/tick every 5 min (external) + daily Vercel fallback. Webhooks + runs visible in Automations.</div>
        </div>
      </div>
      <div className="card pad" style={{ marginTop: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ fontWeight: 800 }}>Email notifications</div>
          {notifMsg && <span className="micro" style={{ color: 'var(--brand-ink)' }}>{notifMsg}</span>}
        </div>
        <div className="micro" style={{ marginBottom: 6 }}>
          Without <code>RESEND_API_KEY</code> every send is logged as <b>email (mock)</b> and shown in Automations → Runs; with it, emails go out for real.
        </div>
        {NOTIF_KEYS.map(([k, title, desc]) => (
          <label key={k} className="check-row">
            <input type="checkbox" checked={notif[k] ?? true} onChange={(e) => setNotif({ ...notif, [k]: e.target.checked })} />
            <span>
              <span className="t">{title}</span><br />
              <span className="d">{desc}</span>
            </span>
          </label>
        ))}
        <div style={{ marginTop: 10 }}>
          <label className="lbl">Review link (optional — included in review request emails)</label>
          <input className="input" placeholder="https://…" value={reviewLink} onChange={(e) => setReviewLink(e.target.value)} />
        </div>
        <button className="btn btn-primary btn-sm" style={{ marginTop: 12 }} onClick={saveNotif}>Save notifications</button>
      </div>
    </div>
  );
}
