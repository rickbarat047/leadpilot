'use client';
import { useState } from 'react';
import { useApi, api } from '@/components/api';

type Lead = {
  id: string; name: string; email: string; phone: string; source: string; service: string;
  status: string; score: number; value: number; ai_summary: string; created_at: string; next_followup_at: string | null;
};
const STATUSES = ['New', 'Contacted', 'Qualified', 'Appointment Booked', 'Completed', 'Won', 'Lost', 'No Response'];

export default function Leads() {
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const { data, error, reload } = useApi<{ leads: Lead[] }>(`/api/leads${status ? `?status=${status}` : ''}`);
  const [form, setForm] = useState({ name: '', email: '', phone: '', service: '', message: '' });
  const [msg, setMsg] = useState('');

  const leads = (data?.leads ?? []).filter((l) =>
    !q || `${l.name} ${l.email} ${l.phone} ${l.service}`.toLowerCase().includes(q.toLowerCase()));

  async function add(e: React.FormEvent) {
    e.preventDefault(); setMsg('');
    try { await api('/api/leads', { method: 'POST', body: JSON.stringify(form) }); setForm({ name: '', email: '', phone: '', service: '', message: '' }); setMsg('Lead added — AI reply sent automatically.'); reload(); }
    catch (e) { setMsg(e instanceof Error ? e.message : 'Failed'); }
  }
  async function setStatusOf(id: string, st: string) {
    await api(`/api/leads/${id}`, { method: 'PATCH', body: JSON.stringify({ status: st }) });
    reload();
  }

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Leads</h2>
      {error && <div className="alert alert-err">{error}</div>}
      {msg && <div className="alert alert-ok">{msg}</div>}
      <div className="card pad" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Add lead (instant AI reply)</div>
        <form onSubmit={add} className="form-grid">
          <input className="input" placeholder="Name *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <input className="input" placeholder="Service" value={form.service} onChange={(e) => setForm({ ...form, service: e.target.value })} />
          <input className="input" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <input className="input" placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <input className="input" placeholder="First message (optional)" style={{ gridColumn: '1/-1' }} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
          <div><button className="btn btn-primary btn-sm">Add + auto-reply</button></div>
        </form>
      </div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
        <select className="select" style={{ maxWidth: 220 }} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>{STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <input className="input flex-input" placeholder="Search name, email, phone, service…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {!data ? <div>Loading…</div> : leads.length === 0 ? (
        <div className="card pad">No leads yet. Add your first lead above, import via webhook, or <a href="/demo">load the demo business</a>.</div>
      ) : (
        <div className="card table-wrap">
          <table className="table">
            <thead><tr><th>Lead</th><th>Service</th><th>Status</th><th>Score</th><th>AI summary</th><th>Change</th></tr></thead>
            <tbody>
              {leads.map((l) => (
                <tr key={l.id}>
                  <td><b>{l.name}</b><div style={{ fontSize: 12.5, color: 'var(--muted)' }}>{[l.email, l.phone, l.source].filter(Boolean).join(' · ')}</div></td>
                  <td>{l.service}</td>
                  <td><span className="pill">{l.status}</span></td>
                  <td>{l.score}</td>
                  <td style={{ maxWidth: 280, fontSize: 13 }}>{l.ai_summary || '—'}</td>
                  <td><select className="select" value={l.status} onChange={(e) => setStatusOf(l.id, e.target.value)}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
