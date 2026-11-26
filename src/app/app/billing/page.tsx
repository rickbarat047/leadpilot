'use client';
import { useState } from 'react';
import { useApi, api } from '@/components/api';
import { PLANS, PlanId } from '@/lib/billing';

export default function Billing() {
  const { data, reload } = useApi<{
    subscription: { plan: string; status: string; trial_ends_at: string };
    plan: { name: string }; stripeConfigured: boolean; provider: string; upi: boolean; live: boolean;
    upiConfigured: boolean; upiId: string; upiName: string;
    invoices: { id: string; amount: number; status: string; plan?: string; created_at: string }[];
  }>('/api/billing');
  const [msg, setMsg] = useState('');
  const [pendingPlan, setPendingPlan] = useState<PlanId | null>(null);
  const [utr, setUtr] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function checkout(plan: PlanId) {
    setMsg('');
    if (data?.upiConfigured) { setPendingPlan(plan); setUtr(''); return; }
    // No UPI configured (dev/demo) — instant mock activation.
    try {
      const r = await api('/api/billing', { method: 'POST', body: JSON.stringify({ plan }) });
      if (r.url) window.location.href = String(r.url);
      else { setMsg(String(r.message ?? 'Plan activated.')); reload(); }
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Failed'); }
  }

  async function submitProof() {
    if (!pendingPlan) return;
    setSubmitting(true); setMsg('');
    try {
      const r = await api('/api/billing', { method: 'POST', body: JSON.stringify({ plan: pendingPlan, utr }) });
      setMsg(String(r.message ?? 'Payment proof submitted. We will activate your plan once verified.'));
      setPendingPlan(null); setUtr(''); reload();
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Failed'); }
    finally { setSubmitting(false); }
  }

  const upiConfigured = !!data?.upiConfigured;
  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Billing</h2>
      {msg && <div className="alert alert-ok">{msg}</div>}
      <div className="card pad" style={{ marginBottom: 16 }}>
        <div>Current: <b>{data?.subscription?.plan ?? '…'} ({data?.subscription?.status})</b> {data?.subscription?.trial_ends_at && <span className="micro">· trial ends {new Date(data.subscription.trial_ends_at).toLocaleDateString()}</span>}</div>
        <div className="micro">Payments: UPI{upiConfigured ? '' : ' (demo mode — no UPI configured, checkout activates instantly)'} via {upiConfigured ? (data?.upiName ?? 'UPI') : (data?.provider ?? 'mock')}{data?.live ? ' (live)' : ''}</div>
      </div>

      {pendingPlan && (
        <div className="card pad" style={{ marginBottom: 16, borderColor: 'var(--accent, #4f46e5)' }}>
          <h3 style={{ marginTop: 0 }}>Pay ₹{PLANS[pendingPlan].priceInr.toLocaleString('en-IN')} for {PLANS[pendingPlan].name}</h3>
          <ol style={{ paddingLeft: 18, lineHeight: 1.7 }}>
            <li>Open any UPI app (GPay, PhonePe, Paytm, BHIM, etc.).</li>
            <li>Pay to UPI ID: <b style={{ fontFamily: 'monospace' }}>{data?.upiId}</b> (name: {data?.upiName}).</li>
            <li>Enter the 12-digit UTR / transaction reference below and submit.</li>
          </ol>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
            <input className="input" placeholder="UTR / transaction reference" value={utr} onChange={(e) => setUtr(e.target.value)} style={{ flex: 1 }} />
            <button className="btn btn-primary btn-sm" onClick={submitProof} disabled={submitting || !utr.trim()}>{submitting ? 'Submitting…' : 'I have paid'}</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setPendingPlan(null)}>Cancel</button>
          </div>
          <div className="micro" style={{ marginTop: 8 }}>Activation usually within 1 business day after verification. You'll get an email confirmation.</div>
        </div>
      )}

      <div className="price-grid">
        {(['starter', 'growth', 'pro'] as PlanId[]).map((id) => (
          <div className="card price-card" key={id}>
            <div style={{ fontWeight: 800 }}>{PLANS[id].name}</div>
            <div className="price">₹{PLANS[id].priceInr.toLocaleString('en-IN')}<span style={{ fontSize: 14 }}>/mo</span></div>
            <ul className="tick">{PLANS[id].features.map((f) => <li key={f}>{f}</li>)}</ul>
            <button className="btn btn-primary btn-sm" onClick={() => checkout(id)} disabled={pendingPlan === id}>Choose {PLANS[id].name}</button>
          </div>
        ))}
      </div>
      <h3>Invoices</h3>
      <div className="card table-wrap" style={{ overflowX: 'auto' }}>
        <table className="table"><thead><tr><th>Date</th><th>Plan</th><th>Amount</th><th>Status</th></tr></thead>
          <tbody>{(data?.invoices ?? []).map((i) => (<tr key={i.id}><td>{new Date(i.created_at).toLocaleDateString()}</td><td>{i.plan || '—'}</td><td>₹{i.amount}</td><td>{i.status}</td></tr>))}</tbody>
        </table>
        {(data?.invoices?.length ?? 0) === 0 && <div className="pad micro">No invoices yet.</div>}
      </div>
    </div>
  );
}
