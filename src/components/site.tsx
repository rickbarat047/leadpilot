import Link from 'next/link';
import { MobileNav } from './mobilenav';

export function SiteNav({ announce }: { announce?: React.ReactNode }) {
  return (
    <>
      {announce && <div className="announce">{announce}</div>}
      <header className="topbar">
        <div className="container nav">
          <Link href="/" className="brand">
            <span className="brand-mark">L</span> LeadPilot
          </Link>
          <nav className="nav-links">
            <Link href="/how-it-works">How it works</Link>
            <Link href="/features">Features</Link>
            <Link href="/industries">Industries</Link>
            <Link href="/pricing">Pricing</Link>
            <Link href="/faq">FAQ</Link>
          </nav>
          <div className="nav-cta" style={{ display: 'flex', gap: 10 }}>
            <Link href="/login" className="btn btn-ghost btn-sm nav-login">Log in</Link>
            <Link href="/signup" className="btn btn-primary btn-sm">Start free trial</Link>
            <MobileNav />
          </div>
        </div>
      </header>
    </>
  );
}

export function SiteFooter() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          <div>
            <Link href="/" className="brand" style={{ marginBottom: 12, display: 'inline-flex' }}>
              <span className="brand-mark">L</span> LeadPilot
            </Link>
            <div style={{ maxWidth: 300, marginTop: 8 }}>Respond faster. Follow up automatically. Book more customers.</div>
            <div style={{ marginTop: 12 }}>
              <Link href="/signup" className="btn btn-primary btn-sm">Start 14-day free trial</Link>
            </div>
          </div>
          <div>
            <div style={{ fontWeight: 700, marginBottom: 10, color: 'var(--ink)' }}>Product</div>
            <div><Link href="/features">Features</Link></div>
            <div><Link href="/how-it-works">How it works</Link></div>
            <div><Link href="/pricing">Pricing</Link></div>
            <div><Link href="/demo">Live demo</Link></div>
          </div>
          <div>
            <div style={{ fontWeight: 700, marginBottom: 10, color: 'var(--ink)' }}>Company</div>
            <div><Link href="/industries">Industries</Link></div>
            <div><Link href="/contact">Contact</Link></div>
            <div><Link href="/faq">FAQ</Link></div>
          </div>
          <div>
            <div style={{ fontWeight: 700, marginBottom: 10, color: 'var(--ink)' }}>Legal</div>
            <div><Link href="/privacy">Privacy</Link></div>
            <div><Link href="/terms">Terms</Link></div>
            <div><Link href="/login">Log in</Link></div>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© 2026 LeadPilot. All sample data clearly labeled.</span>
          <span>UPI Autopay billing · Cancel anytime</span>
        </div>
      </div>
    </footer>
  );
}
