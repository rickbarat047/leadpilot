import { Page, SimpleList } from '@/components/page';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Built for service businesses',
  description: 'LeadPilot fits salons, dental clinics, gyms, home services, photographers, tutors, real estate and wedding businesses — same lead leak, different uniform.',
  alternates: { canonical: '/industries' },
};

export default function Industries() {
  return (
    <Page title="Built for service businesses" sub="Same leak, different uniform. LeadPilot fits each workflow.">
      <SimpleList items={[
        ['Salons & barbers', 'Colour consults, patch-test questions, chair availability, no-show reminders.'],
        ['Beauty clinics', 'Treatment suitability triage, pricing guardrails, consent-aware follow-up.'],
        ['Gyms & studios', 'Trial booking, class packs, win-back for lapsed enquiries.'],
        ['Home cleaning & repair', 'Postcode + job-size qualification, two-hour arrival windows.'],
        ['Photographers & events', 'Date-first qualification, package shortlists, wedding urgency handling.'],
        ['Tutors & dentists', 'Polite persistent chase, recall reminders, review asks after visits.'],
        ['Real estate', 'Instant response to portal leads, viewing-slot offers, long nurture.'],
      ]} />
    </Page>
  );
}
