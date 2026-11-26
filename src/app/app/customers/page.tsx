'use client';
import { useApi } from '@/components/api';
export default function Customers() {
  const { data } = useApi<{ leads: { id: string; name: string; email: string; phone: string; status: string; value: number }[] }>('/api/leads');
  const won = (data?.leads ?? []).filter((l) => ['Won', 'Completed', 'Appointment Booked'].includes(l.status));
  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Customers</h2>
      <p style={{ color: 'var(--muted)' }}>Customers are leads that booked or completed service. Opt-outs are suppressed automatically.</p>
      <div className="card table-wrap" style={{ overflowX: 'auto' }}>
        <table className="table">
          <thead><tr><th>Name</th><th>Contact</th><th>Status</th><th>Lifetime value</th></tr></thead>
          <tbody>{won.map((c) => (<tr key={c.id}><td><b>{c.name}</b></td><td>{c.email} · {c.phone}</td><td><span className="pill booked">{c.status}</span></td><td>₹{Number(c.value).toLocaleString('en-IN')}</td></tr>))}</tbody>
        </table>
        {won.length === 0 && <div className="pad micro">No customers yet — book an appointment or mark a lead Won.</div>}
      </div>
    </div>
  );
}
