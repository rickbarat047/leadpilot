'use client';
import Link from 'next/link';
import { useApi } from '@/components/api';

type Stats = {
  business: { name: string }; stats: {
    leadsToday: number; leadsMonth: number; qualified: number; booked: number;
    conversion: number; avgResponseSec: number; recovered: number; recoveredRevenue: number;
    followupDue: number; reviewsSent: number;
    funnel: { stage: string; count: number }[];
  };
  series: { label: string; leads: number; booked: number }[];
};

export default function Overview() {
  const { data, error } = useApi<Stats>('/api/business');
  if (error) return <div className="alert alert-err">{error}</div>;
  if (!data) return <div>Loading overview…</div>;
  const s = data.stats;
  const max = Math.max(1, ...data.series.map((x) => x.leads));
  return (
    <div>
      <h2 style={{ margin: '0 0 4px' }}>{data.business?.name ?? 'Overview'}</h2>
      <p style={{ color: 'var(--muted)', marginTop: 0 }}>Respond faster. Follow up automatically. Book more customers.</p>
      <div className="kpis">
        {[
          ['Leads today', s.leadsToday], ['Leads this month', s.leadsMonth], ['Qualified', s.qualified],
          ['Booked', s.booked], ['Conversion', `${s.conversion}%`], ['Avg response', `${s.avgResponseSec}s`],
          ['Recovered', s.recovered], ['Recovered ₹', `₹${Math.round(s.recoveredRevenue).toLocaleString('en-IN')}`],
        ].map(([l, v]) => (
          <div className="card kpi" key={l as string}><div className="l">{l}</div><div className="v">{v}</div></div>
        ))}
      </div>
      <div className="grid-2" style={{ marginTop: 16 }}>
        <div className="card pad">
          <div style={{ fontWeight: 800, marginBottom: 8 }}>Leads vs bookings (14 days)</div>
          <div className="bar-chart">
            {data.series.map((d) => (
              <div key={d.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                <div className="bar" style={{ height: `${Math.max(6, (d.leads / max) * 120)}px`, width: '100%' }} title={`${d.label}: ${d.leads} leads`} />
                <div className="bar dim" style={{ height: `${Math.max(4, (d.booked / max) * 120)}px`, width: '100%' }} title={`${d.label}: ${d.booked} booked`} />
                <div style={{ fontSize: 10, color: 'var(--muted)' }}>{d.label.slice(3)}</div>
              </div>
            ))}
          </div>
          <div className="micro">Teal = leads · Grey = booked</div>
        </div>
        <div className="card pad">
          <div style={{ fontWeight: 800, marginBottom: 8 }}>Acquisition funnel</div>
          {s.funnel.map((f) => (
            <div key={f.stage} style={{ display: 'grid', gridTemplateColumns: '140px 1fr 40px', gap: 10, alignItems: 'center', padding: '6px 0' }}>
              <div style={{ fontSize: 13.5 }}>{f.stage}</div>
              <div className="funnel-bar"><div className="funnel-fill" style={{ width: `${Math.min(100, (f.count / Math.max(1, s.leadsMonth || 8)) * 100)}%` }} /></div>
              <div style={{ fontWeight: 700 }}>{f.count}</div>
            </div>
          ))}
          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <Link href="/app/leads" className="btn btn-ghost btn-sm">Open CRM</Link>
            <Link href="/app/analytics" className="btn btn-ghost btn-sm">Full analytics</Link>
          </div>
        </div>
      </div>
      <div className="grid-2" style={{ marginTop: 16 }}>
        <div className="card pad"><div style={{ fontWeight: 800 }}>Follow-ups due: {s.followupDue}</div><div className="micro">Automation handles these every minute via /api/cron/tick. Check Automations → Runs for the log.</div></div>
        <div className="card pad"><div style={{ fontWeight: 800 }}>Review requests sent: {s.reviewsSent}</div><div className="micro">Timed asks after completed service. Configure in Onboarding step 13 or Settings.</div></div>
      </div>
    </div>
  );
}
