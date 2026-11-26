'use client';
import { useState } from 'react';
import { SiteNav, SiteFooter } from '@/components/site';
export default function Contact() {
  const [sent, setSent] = useState(false);
  return (
    <><SiteNav /><main className="container section" style={{ maxWidth: 720 }}>
      <h2>Contact</h2>
      <p className="sub">Questions about fit, pricing, or migration? We reply within one business day.</p>
      {sent ? <div className="alert alert-ok">Thanks — logged. We will reply shortly. (Demo form, no email sent.)</div> : (
        <form onSubmit={(e) => { e.preventDefault(); setSent(true); }}>
          <label className="lbl">Name</label><input className="input" required />
          <label className="lbl">Work email</label><input className="input" type="email" required />
          <label className="lbl">Message</label><textarea className="textarea" required />
          <button className="btn btn-primary" style={{ marginTop: 14 }}>Send message</button>
        </form>
      )}
    </main><SiteFooter /></>
  );
}
