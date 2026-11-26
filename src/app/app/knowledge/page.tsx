'use client';
import { useState } from 'react';
import { useApi, api } from '@/components/api';
type Entry = { id: string; kind: string; title: string; body: string };
export default function Knowledge() {
  const { data, reload } = useApi<{ entries: Entry[] }>('/api/knowledge');
  const [form, setForm] = useState({ kind: 'faq', title: '', body: '' });
  const [msg, setMsg] = useState('');
  async function add(e: React.FormEvent) {
    e.preventDefault();
    try { await api('/api/knowledge', { method: 'POST', body: JSON.stringify(form) }); setForm({ kind: 'faq', title: '', body: '' }); setMsg('Saved. AI will cite this.'); reload(); }
    catch (e) { setMsg(e instanceof Error ? e.message : 'Failed'); }
  }
  async function del(id: string, title: string) {
    if (!window.confirm(`Delete "${title}"? This cannot be undone.`)) return;
    try {
      const r = await fetch(`/api/knowledge?id=${id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error('delete failed');
      setMsg('Entry deleted.');
      reload();
    } catch {
      setMsg('Could not delete the entry.');
    }
  }
  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Knowledge</h2>
      {msg && <div className="alert alert-ok">{msg}</div>}
      <div className="card pad" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 800 }}>Add entry (AI cites only what you configure)</div>
        <form onSubmit={add}>
          <div className="form-grid">
            <select className="select" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
              {['faq', 'service', 'pricing', 'policy', 'hours', 'booking', 'other'].map((k) => <option key={k}>{k}</option>)}
            </select>
            <input className="input" placeholder="Title *" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          </div>
          <label className="lbl">Body</label>
          <textarea className="textarea" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} required />
          <button className="btn btn-primary btn-sm" style={{ marginTop: 10 }}>Save entry</button>
        </form>
      </div>
      {(data?.entries ?? []).map((k) => (
        <div className="card pad" key={k.id} style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><b>{k.title}</b><span className="pill">{k.kind}</span></div>
          <div style={{ color: 'var(--muted)', fontSize: 14 }}>{k.body}</div>
          <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => del(k.id, k.title)}>Delete</button>
        </div>
      ))}
    </div>
  );
}
