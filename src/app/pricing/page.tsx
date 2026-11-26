import Link from 'next/link';
import { SiteNav, SiteFooter } from '@/components/site';
import { PLANS } from '@/lib/billing';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Pricing',
  description: 'Simple INR plans for salons, clinics, gyms and local service businesses: Starter, Growth and Pro. 14-day trial, cancel anytime.',
  alternates: { canonical: '/pricing' },
};

export default function Pricing() {
  return (
    <><SiteNav /><main className="container section">
      <h2>Pricing that pays for itself</h2>
      <p className="sub">One recovered customer often covers the month. Prices in INR, configurable in one file.</p>
      <div className="price-grid">
        {(['starter', 'growth', 'pro'] as const).map((id) => (
          <div className={`card price-card ${id === 'growth' ? 'hot' : ''}`} key={id}>
            <div style={{ fontWeight: 800 }}>{PLANS[id].name} {id === 'growth' && <span className="pill booked">Most popular</span>}</div>
            <div className="price">₹{PLANS[id].priceInr.toLocaleString('en-IN')}<span style={{ fontSize: 14, fontWeight: 500 }}>/mo</span></div>
            <div style={{ color: 'var(--muted)', fontSize: 14 }}>{PLANS[id].tagline}</div>
            <div style={{ fontSize: 13.5, color: 'var(--muted)' }}>{PLANS[id].limits.leadsPerMonth.toLocaleString()} leads/mo · {PLANS[id].limits.seats} seats</div>
            <ul className="tick">{PLANS[id].features.map((f) => <li key={f}>{f}</li>)}</ul>
            <Link href="/signup" className="btn btn-primary">Start 14-day trial</Link>
          </div>
        ))}
      </div>
      <p className="micro" style={{ marginTop: 16 }}>No guaranteed results. Cancel anytime. Trial requires no card.</p>
    </main><SiteFooter /></>
  );
}
