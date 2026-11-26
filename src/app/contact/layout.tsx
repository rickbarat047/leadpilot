import type { Metadata } from 'next';

// The contact page itself is a client component (form state), so its metadata
// lives on this segment layout — Next only allows metadata exports from
// server components.
export const metadata: Metadata = {
  title: 'Contact',
  description: 'Questions about LeadPilot? Reach the team — we reply within one business day.',
  alternates: { canonical: '/contact' },
};

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return children;
}
