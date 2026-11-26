'use client';
import { useState } from 'react';

export function FaqAccordion({ items }: { items: [string, string][] }) {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div>
      {items.map(([q, a], i) => (
        <div className="faq-item" key={q}>
          <button className="faq-q" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}>
            <span>{q}</span>
            <span style={{ color: 'var(--brand)', fontWeight: 800 }}>{open === i ? '−' : '+'}</span>
          </button>
          {open === i && <div className="faq-a">{a}</div>}
        </div>
      ))}
    </div>
  );
}
