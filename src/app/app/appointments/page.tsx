'use client';
import { useState } from 'react';
import { useApi, api } from '@/components/api';

type Apt = { id: string; customer_name: string; service: string; starts_at: string; ends_at: string; status: string };

export default function Appointments() {
  const { data, error, reload } = useApi<{ appointments: Apt[] }>('/api/appointments');
  const [form, setForm] = useState({ customer_name: '', service: '', starts_at: '' });
  const [msg, setMsg] = useState('');

  async function add(e: React.FormEvent) {
    e.preventDefault(); setMsg('');
    try {
      await api('/api/appointments', { method: 'POST', body: JSON.stringify({ ...form, starts_at: new Date(form.starts_at).toISOString() }) });
      setMsg('Appointment booked. Reminders + review will run automatically.');
      setForm({ customer_name: '', service: '', starts_at: '' }); reload();
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Failed'); }
  }
  async function setStatus(id: string, status: string) {
    await api(`/api/appointments/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
    reload();
  }

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Appointments</h2>
      {error && <div className="alert alert-err">{error}</div>}
      {msg && <div className="alert alert-ok">{msg}</div>}
      <div className="card pad" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Book appointment</div>
        <form onSubmit={add} className="form-grid">
          <input className="input" placeholder="Customer name *" value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} required />
          <input className="input" placeholder="Service" value={form.service} onChange={(e) => setForm({ ...form, service: e.target.value })} />
          <input className="input" type="datetime-local" style={{ gridColumn: '1/-1' }} value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} required />
          <div><button className="btn btn-primary btn-sm">Book</button></div>
        </form>
      </div>
      <div className="card table-wrap">
        <table className="table">
          <thead><tr><th>Customer</th><th>Service</th><th>Starts</th><th>Status</th><th>Change</th></tr></thead>
          <tbody>
            {(data?.appointments ?? []).map((a) => (
              <tr key={a.id}>
                <td><b>{a.customer_name}</b></td><td>{a.service}</td>
                <td>{new Date(a.starts_at).toLocaleString()}</td>
                <td><span className="pill booked">{a.status}</span></td>
                <td style={{ display: 'flex', gap: 6 }}>
                  {['booked', 'completed', 'cancelled', 'no-show'].map((s) => (
                    <button key={s} className="btn btn-ghost btn-sm" onClick={() => setStatus(a.id, s)}>{s}</button>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {(data?.appointments?.length ?? 0) === 0 && <div className="pad micro">No appointments yet.</div>}
      </div>
    </div>
  );
}
