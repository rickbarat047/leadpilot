'use client';
import { useEffect, useState } from 'react';
export default function Admin() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    fetch('/api/admin/overview').then(async (r) => {
      const j = await r.json();
      if (!r.ok) setErr(j.error || 'Admin only — log in as the admin user.');
      else setData(j);
    }).catch((e) => setErr(e.message));
  }, []);
  const [verifying, setVerifying] = useState<string | null>(null);
  const verify = async (invoiceId: string) => {
    setVerifying(invoiceId);
    try {
      const r = await fetch('/api/admin/billing/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ invoiceId }) });
      const j = await r.json();
      if (!r.ok) alert(j.error || 'Verify failed');
      else { alert(`Activated ${j.plan} for business ${j.businessId}`); window.location.reload(); }
    } catch (e) { alert(e instanceof Error ? e.message : 'Failed'); }
    finally { setVerifying(null); }
  };
  if (!data) return <main className="container section"><h2>Admin</h2><div>Loading…</div></main>;
  const counts = data.counts as Record<string, number>;
  return (
    <main className="container section">
      <h2>Admin — system overview</h2>
      <div className="kpis">
        {Object.entries(counts ?? {}).map(([k, v]) => (<div className="card kpi" key={k}><div className="l">{k}</div><div className="v">{v}</div></div>))}
      </div>
      <div className="grid-2" style={{ marginTop: 16 }}>
        <div className="card pad"><b>Subscriptions</b><pre style={{ fontSize: 12 }}>{JSON.stringify(data.subs, null, 2)}</pre></div>
        <div className="card pad"><b>Recent errors</b><pre style={{ fontSize: 12, maxHeight: 300, overflow: 'auto' }}>{JSON.stringify((data.recentErrors as unknown[]).slice(0, 5), null, 2)}</pre></div>
      </div>
      <div className="card pad" style={{ marginTop: 16 }}>
        <b>Pending UPI payments</b>
        {(Array.isArray(data.pendingInvoices) && data.pendingInvoices.length > 0) ? (
          <table className="table" style={{ marginTop: 8 }}><thead><tr><th>Business</th><th>Plan</th><th>Amount</th><th>UTR</th><th>Date</th><th></th></tr></thead>
            <tbody>{(data.pendingInvoices as { id: string; business_name: string; plan: string; amount: number; utr: string; created_at: string }[]).map((i) => (
              <tr key={i.id}><td>{i.business_name}</td><td>{i.plan}</td><td>₹{i.amount}</td><td style={{ fontFamily: 'monospace', fontSize: 12 }}>{i.utr || '—'}</td><td>{new Date(i.created_at).toLocaleDateString()}</td>
                <td><button className="btn btn-primary btn-sm" disabled={verifying === i.id} onClick={() => verify(i.id)}>{verifying === i.id ? 'Verifying…' : 'Mark paid'}</button></td></tr>
            ))}</tbody></table>
        ) : <div className="pad micro">No pending UPI payments.</div>}
      </div>
    </main>
  );
}
