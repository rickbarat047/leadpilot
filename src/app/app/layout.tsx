import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { readSession } from '@/lib/auth';
import { get } from '@/lib/db';
import { LogoutButton } from '@/components/logout';

// Authenticated product surface — never indexed (robots.ts also disallows /app).
export const metadata: Metadata = {
  title: 'App',
  robots: { index: false, follow: false },
};

const LINKS: [string, string][] = [
  ['/app', 'Overview'], ['/app/leads', 'Leads'], ['/app/conversations', 'Conversations'],
  ['/app/appointments', 'Appointments'], ['/app/customers', 'Customers'], ['/app/automations', 'Automations'],
  ['/app/reviews', 'Reviews'], ['/app/analytics', 'Analytics'], ['/app/knowledge', 'Knowledge'],
  ['/app/integrations', 'Integrations'], ['/app/billing', 'Billing'], ['/app/settings', 'Settings'],
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await readSession();
  if (!s) redirect('/login');
  const u = await get<{ email_verified: number }>(`SELECT email_verified FROM users WHERE id=?`, s.id);
  const verified = (u?.email_verified ?? 0) === 1;
  return (
    <div>
      {!verified && (
        <div className="alert alert-warn" style={{ margin: 0, borderRadius: 0, textAlign: 'center' }}>
          Please verify your email to unlock all features. Check your inbox for the verification link.
        </div>
      )}
      <header className="topbar">
        <div className="container nav">
          <Link href="/app" className="brand"><span className="brand-mark">L</span> LeadPilot</Link>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span className="user-email" style={{ fontSize: 13, color: 'var(--muted)' }}>{s.email}</span>
            <LogoutButton />
          </div>
        </div>
      </header>
      <div className="shell">
        <aside className="side">
          {LINKS.map(([href, label]) => (
            <Link key={href} href={href}>{label}</Link>
          ))}
          <div style={{ marginTop: 12, padding: '0 12px' }}>
            <Link href="/onboarding" style={{ fontSize: 13 }}>↻ Onboarding</Link>
          </div>
        </aside>
        <div className="main">{children}</div>
      </div>
    </div>
  );
}
