import { Page, SimpleList } from '@/components/page';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'FAQ',
  description: 'Straight answers about setup time, AI replies, pricing, email delivery, data isolation and cancelling LeadPilot.',
  alternates: { canonical: '/faq' },
};

export default function Faq() {
  return (
    <Page title="FAQ" sub="Straight answers.">
      <SimpleList items={[
        ['How fast does setup take?', 'Most owners finish onboarding in ~15 minutes: business, services, hours, follow-up and review preferences.'],
        ['Will AI invent answers?', 'No. Replies use only your configured knowledge. Low-confidence or out-of-scope messages escalate to you with a draft.'],
        ['What happens on STOP?', 'All messaging for that contact stops, the lead is marked, and the opt-out is logged.'],
        ['Do you support WhatsApp?', 'Not in v1. The messaging layer is abstracted so WhatsApp/Instagram/Facebook can plug in later. Email + SMS-compatible mock included.'],
        ['Can I cancel?', 'Yes, anytime from Billing. Trials simply expire without charge.'],
      ]} />
    </Page>
  );
}
