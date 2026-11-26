import { Page } from '@/components/page';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy policy',
  description: 'How LeadPilot handles business and customer data: tenancy isolation, retention, subprocessors and your rights.',
  alternates: { canonical: '/privacy' },
};

export default function Privacy() {
  return (
    <Page title="Privacy policy" sub="How LeadPilot handles business and customer data.">
      <div className="card pad" style={{ display: 'grid', gap: 10 }}>
        <div><b>Tenancy.</b> Every business&apos;s leads, conversations, appointments and reviews are isolated by business_id and only visible to its members (and platform admins for support).</div>
        <div><b>Messaging consent.</b> Owners configure consent requirements; STOP/UNSUBSCRIBE always opts out and suppresses future sends.</div>
        <div><b>Retention.</b> Configurable per business in Settings; deletion requests honored within 30 days.</div>
        <div><b>No spam.</b> LeadPilot is for following up with people who contacted you or gave consent — not bulk outreach.</div>
        <div><b>Subprocessors.</b> Hosting, database, Stripe (billing), email provider, AI provider — listed in deployment docs.</div>
      </div>
    </Page>
  );
}
