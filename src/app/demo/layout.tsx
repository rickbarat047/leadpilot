import type { Metadata } from 'next';

// The demo page itself is a client component (interactive seed flow), so its
// metadata lives on this segment layout.
export const metadata: Metadata = {
  title: 'Live demo — try LeadPilot',
  description: 'Seed a sample salon with leads and conversations, then explore the full LeadPilot app in about a minute. No signup required.',
  alternates: { canonical: '/demo' },
};

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return children;
}
