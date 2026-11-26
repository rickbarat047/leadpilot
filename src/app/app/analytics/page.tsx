'use client';
import { useApi } from '@/components/api';
export default function Analytics() {
  const { data } = useApi<{ stats: { leadsMonth: number; qualified: number; booked: number; conversion: number; recovered: number; recoveredRevenue: number; funnel: { stage: string; count: number }[] }, series: { label: string; leads: number; booked: number }[] }>('/api/business');
  if (!data) return <div>Loading…</div>;
  const max = Math.max(1, ...data.series.map((x) => x.leads));
  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Analytics</h2>
      <div className="kpis">
        {[['Leads (mo)', data.stats.leadsMonth], ['Qualified', data.stats.qualified], ['Booked', data.stats.booked], ['Conversion', `${data.stats.conversion}%`], ['Recovered', data.stats.recovered], ['Recovered ₹', `₹${Math.round(data.stats.recoveredRevenue).toLocaleString('en-IN')}`]].map(([l, v]) => (
          <div className="card kpi" key={l as string}><div className="l">{l}</div><div className="v">{v}</div></div>
        ))}
      </div>
      <div className="card pad" style={{ marginTop: 16 }}>
        <div style={{ fontWeight: 800 }}>Daily volume</div>
        <div className="bar-chart">{data.series.map((d) => (<div key={d.label} className="bar" style={{ height: `${Math.max(6, (d.leads / max) * 120)}px` }} title={`${d.label}: ${d.leads}`} />))}</div>
      </div>
      <div className="card pad" style={{ marginTop: 16 }}>
        <div style={{ fontWeight: 800 }}>Funnel</div>
        {data.stats.funnel.map((f) => (<div key={f.stage} style={{ display: 'grid', gridTemplateColumns: '160px 1fr 40px', gap: 10, padding: '6px 0', alignItems: 'center' }}><div>{f.stage}</div><div className="funnel-bar"><div className="funnel-fill" style={{ width: `${Math.min(100, (f.count / Math.max(1, data.stats.leadsMonth || 8)) * 100)}%` }} /></div><div><b>{f.count}</b></div></div>))}
      </div>
    </div>
  );
}
