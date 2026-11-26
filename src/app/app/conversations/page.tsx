'use client';
import { useState } from 'react';
import { useApi, api } from '@/components/api';

type Conv = { id: string; lead_id: string; lead_name: string; service: string; status: string; last_body: string };
type Msg = { id: string; sender: string; body: string; created_at: string };

export default function Conversations() {
  const { data, error, reload } = useApi<{ conversations: Conv[] }>('/api/conversations');
  const [open, setOpen] = useState<Conv | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState('');
  const [note, setNote] = useState('');

  async function load(c: Conv) {
    setOpen(c); setMsgs([]);
    try {
      const r = await fetch(`/api/conversations/${c.id}/messages`).then((x) => x.json());
      setMsgs(r.messages ?? []);
    } catch { setMsgs([{ id: 'x', sender: 'system', body: 'Could not load thread.', created_at: '' }]); }
  }

  async function refresh() {
    if (!open) return;
    const r = await fetch(`/api/conversations/${open.id}/messages`).then((x) => x.json());
    setMsgs(r.messages ?? []);
    reload();
  }

  async function send(asLead: boolean) {
    if (!open || !draft.trim()) return;
    setNote('');
    try {
      await api(`/api/conversations/${open.id}/messages`, {
        method: 'POST', body: JSON.stringify({ body: draft, sender: asLead ? 'lead' : 'owner' }),
      });
      setDraft(''); await refresh();
      setNote(asLead ? 'Lead message received — AI continued automatically.' : 'Owner reply sent. AI is paused for this thread.');
    } catch (e) { setNote(e instanceof Error ? e.message : 'Failed'); }
  }

  async function setMode(mode: 'ai' | 'paused' | 'closed') {
    if (!open) return;
    await api(`/api/conversations/${open.id}/messages`, { method: 'PATCH', body: JSON.stringify(mode === 'ai' ? {} : mode === 'paused' ? { paused: true } : { closed: true }) });
    await refresh();
  }

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Conversations</h2>
      {error && <div className="alert alert-err">{error}</div>}
      {note && <div className="alert alert-ok">{note}</div>}
      <div className="grid-2">
        <div className="card" style={{ overflow: 'hidden' }}>
          {(!data || data.conversations.length === 0) && <div className="pad">No conversations yet. Add a lead to start one.</div>}
          {(data?.conversations ?? []).map((c) => (
            <button key={c.id} onClick={() => load(c)} style={{ display: 'block', width: '100%', textAlign: 'left', background: open?.id === c.id ? '#f1ede6' : '#fff', border: 0, borderBottom: '1px solid var(--line)', padding: '12px 16px', cursor: 'pointer' }}>
              <div style={{ fontWeight: 700 }}>{c.lead_name} <span className="pill" style={{ marginLeft: 6 }}>{c.status}</span></div>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>{c.service} · {(c.last_body ?? '').slice(0, 80)}</div>
            </button>
          ))}
        </div>
        <div className="card pad">
          {!open ? <div className="micro">Select a conversation. Reply as owner (pauses AI), simulate the lead, resume AI anytime.</div> : (
            <>
              <div style={{ fontWeight: 800 }}>{open.lead_name} <span className="pill">{open.status}</span></div>
              <div className="chat" style={{ margin: '14px 0' }}>
                {msgs.map((m) => (
                  <div key={m.id} className={`bubble ${m.sender === 'lead' ? 'lead' : m.sender === 'owner' ? 'owner' : 'ai'}`}>
                    <div style={{ fontSize: 11, opacity: .7, fontWeight: 800 }}>{m.sender.toUpperCase()}</div>{m.body}
                  </div>
                ))}
              </div>
              <textarea className="textarea" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Type a message…" />
              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                <button className="btn btn-primary btn-sm" onClick={() => send(false)}>Reply as owner</button>
                <button className="btn btn-ghost btn-sm" onClick={() => send(true)}>Simulate lead reply</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setMode('ai')}>Resume AI</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
