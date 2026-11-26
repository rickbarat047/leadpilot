'use client';
import { useMemo, useState } from 'react';

export function RoiCalculator() {
  const [avgValue, setAvgValue] = useState(3500);
  const [leads, setLeads] = useState(120);
  const [conv, setConv] = useState(18);
  const [missed, setMissed] = useState(35);
  const [lift, setLift] = useState(25);

  const out = useMemo(() => {
    const missedLeads = (leads * missed) / 100;
    const recovered = (missedLeads * lift) / 100;
    const monthly = recovered * avgValue;
    return { missedLeads, recovered, monthly, annual: monthly * 12 };
  }, [avgValue, leads, missed, lift]);

  const num = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 0 });

  return (
    <div className="card pad calc">
      <div>
        <label className="lbl">Average customer value (₹)</label>
        <input className="input" type="number" value={avgValue} onChange={(e) => setAvgValue(Number(e.target.value))} />
        <label className="lbl">New leads per month</label>
        <input className="input" type="number" value={leads} onChange={(e) => setLeads(Number(e.target.value))} />
        <label className="lbl">Current conversion rate (%)</label>
        <input className="input" type="number" value={conv} onChange={(e) => setConv(Number(e.target.value))} />
        <label className="lbl">Leads you miss / ignore (%)</label>
        <input className="input" type="number" value={missed} onChange={(e) => setMissed(Number(e.target.value))} />
        <label className="lbl">Expected recovery improvement (%)</label>
        <input className="input" type="number" value={lift} onChange={(e) => setLift(Number(e.target.value))} />
      </div>
      <div style={{ background: '#14201f', color: '#fff', borderRadius: 12, padding: 24 }}>
        <div style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '.08em', opacity: .7 }}>Estimated opportunity</div>
        <div style={{ fontSize: 38, fontWeight: 800, margin: '8px 0' }}>₹{num(out.monthly)}<span style={{ fontSize: 16, opacity: .7 }}>/mo</span></div>
        <div style={{ fontSize: 15, opacity: .85 }}>₹{num(out.annual)} per year · ~{out.recovered.toFixed(1)} extra customers/mo from {out.missedLeads.toFixed(0)} missed leads.</div>
        <div style={{ marginTop: 14, fontSize: 12.5, opacity: .6 }}>Estimate only, not a guarantee. Based on your inputs; actual results vary by response time, offer, and market.</div>
        <a href="/signup" className="btn btn-brand" style={{ marginTop: 16 }}>Recover these leads</a>
      </div>
    </div>
  );
}
