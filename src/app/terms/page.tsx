import { Page } from '@/components/page';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of service',
  description: 'Simple terms for a service that earns its keep monthly: trials, billing, cancellation and acceptable use.',
  alternates: { canonical: '/terms' },
};

export default function Terms() {
  return (
    <Page title="Terms of service" sub="Simple terms for a service that earns its keep monthly.">
      <div className="card pad" style={{ display: 'grid', gap: 10 }}>
        <div><b>Trials & billing.</b> 14-day trial, then paid plans. Cancel anytime; access continues to period end.</div>
        <div><b>Fair use.</b> Plan lead/SMS limits apply; overages prompt an upgrade, never silent charges.</div>
        <div><b>No guaranteed results.</b> Faster response improves odds but outcomes depend on your offer, pricing, and market.</div>
        <div><b>Acceptable use.</b> Only message contacts with consent or legitimate interest; honor opt-outs; no spam.</div>
      </div>
    </Page>
  );
}
