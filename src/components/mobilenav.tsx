'use client';
import { useState } from 'react';
import Link from 'next/link';

const LINKS: [string, string][] = [
  ['/how-it-works', 'How it works'],
  ['/features', 'Features'],
  ['/industries', 'Industries'],
  ['/pricing', 'Pricing'],
  ['/faq', 'FAQ'],
];

export function MobileNav() {
  const [open, setOpen] = useState(false);
  return (
    <div className="mobile-nav">
      <button
        className="mobile-toggle"
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? '✕' : '☰'}
      </button>
      {open && (
        <div className="mobile-menu">
          {LINKS.map(([href, label]) => (
            <Link key={href} href={href} onClick={() => setOpen(false)}>{label}</Link>
          ))}
          <div className="mobile-menu-cta">
            <Link href="/login" className="btn btn-ghost" onClick={() => setOpen(false)}>Log in</Link>
            <Link href="/signup" className="btn btn-primary" onClick={() => setOpen(false)}>Start free trial</Link>
          </div>
        </div>
      )}
    </div>
  );
}
