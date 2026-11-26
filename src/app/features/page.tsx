import { Page, SimpleList } from '@/components/page';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Features',
  description: 'Lead CRM, AI replies, automated follow-ups, booking reminders, review requests and analytics — one system for the whole lead-to-review loop.',
  alternates: { canonical: '/features' },
};

export default function Features() {
  return (
    <Page title="Features" sub="One system for the whole lead-to-review loop.">
      <SimpleList items={[
        ['Lead CRM', 'Statuses, scores, values, AI summaries, filters, owners, next follow-up.'],
        ['AI conversations', 'Guardrailed replies that cite your knowledge and escalate when unsure. Manual takeover anytime.'],
        ['Automation builder', 'Visual TRIGGER → ACTION → CONDITION → WAIT → OUTCOME rules stored as data, with run logs.'],
        ['Booking + calendar', 'Internal scheduler now, Google Calendar when you connect it. Confirmations, reminders, reschedules.'],
        ['Review automation', 'Timed requests after completed service with sent/opened/clicked/completed tracking.'],
        ['Analytics', 'Leads, qualified, booked, conversion, recovered revenue, response time, funnel.'],
        ['Knowledge base', 'FAQs, services, pricing, policies, hours, booking and cancellation rules.'],
        ['Billing + trials', 'Stripe subscriptions, trials, usage limits, invoices, portal. Mock mode when keys absent.'],
      ]} />
    </Page>
  );
}
