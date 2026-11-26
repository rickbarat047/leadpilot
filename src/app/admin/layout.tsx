import type { Metadata } from 'next';

// Admin console — never indexed (robots.ts also disallows /admin).
export const metadata: Metadata = {
  title: 'Admin',
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
