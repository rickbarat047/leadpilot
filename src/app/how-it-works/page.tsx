import { Page, SimpleList } from '@/components/page';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'How it works',
  description: 'From missed lead to booked customer in five automatic steps: capture, instant AI reply, qualify, book, and follow up until they answer.',
  alternates: { canonical: '/how-it-works' },
};

export default function How() {
  return (
    <Page title="How it works" sub="From missed lead to booked customer in five automatic steps.">
      <SimpleList items={[
        ['1. Capture', 'Website form, chat widget, import, webhook/API, or missed-call event creates the lead instantly.'],
        ['2. Classify', 'AI extracts service, urgency, value, intent, preferred time, quality and conversion probability.'],
        ['3. Respond', 'Personal first reply in under a minute. Asks only what is needed to move forward.'],
        ['4. Book', 'Qualified leads see real availability, pick a slot, get confirmation + reminders.'],
        ['5. Recover', 'Silent leads enter 15-min / 6-hour / 24-hour follow-up. Replies resume the conversation; reviews follow completed visits.'],
      ]} />
    </Page>
  );
}
