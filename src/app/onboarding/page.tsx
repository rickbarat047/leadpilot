'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/components/api';

const INDUSTRIES = ['salon', 'barber', 'beauty clinic', 'gym', 'home cleaning', 'repair', 'photographer', 'tutor', 'dentist', 'real estate', 'wedding/events', 'other'];

export default function Onboarding() {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<Record<string, string>>({ name: '', industry: 'salon', description: '', services: 'Signature Haircut — 899\nBalayage Colour — 4999', pricing: '', hours: 'Mon–Sat 10:00–20:00', location: '', phone: '', email: '', website: '', calendar: 'internal', tone: 'friendly-professional', followup: '15m/6h/24h', reviews: '48h after visit', assistant: 'Ava' });
  const [msg, setMsg] = useState('');
  const router = useRouter();

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const steps = ['Business name', 'Industry', 'Description', 'Services', 'Pricing', 'Hours', 'Location', 'Contact', 'Calendar', 'Comms', 'Personality', 'Follow-ups', 'Reviews', 'Test'];

  async function finish(testLead: boolean) {
    setMsg('');
    try {
      const services = form.services.split('\n').map((l) => {
        const [name, price] = l.split(/[—–-]/).map((x) => (x ?? '').trim());
        return { name: name || l.trim(), price: Number((price ?? '').replace(/[^0-9]/g, '')) || 0, duration: 45 };
      }).filter((s) => s.name);
      await api('/api/business', {
        method: 'PUT',
        body: JSON.stringify({
          name: form.name, industry: form.industry, description: form.description, location: form.location,
          phone: form.phone, email: form.email, website: form.website,
          hours: { summary: form.hours },
          settings: { assistantName: form.assistant, tone: form.tone, reviewDelayH: 48, calendar: form.calendar, followup: form.followup, reviews: form.reviews, pricingNotes: form.pricing },
          services,
        }),
      });
      if (testLead) {
        await api('/api/leads', { method: 'POST', body: JSON.stringify({ name: 'Test Customer', email: '', phone: '', service: services[0]?.name ?? 'General enquiry', message: 'Hi! Do you have anything tomorrow? (onboarding test)' }) });
      }
      await fetch('/api/onboarding/done', { method: 'POST' }).catch(() => undefined);
      router.push('/app');
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Failed'); }
  }

  useEffect(() => {
    fetch('/api/business').then((r) => r.json()).then((j) => {
      if (j.business?.name) set('name', j.business.name);
    }).catch(() => undefined);
  }, []);

  const fields: Record<number, React.ReactNode> = {
    1: (<><label className="lbl">Business name *</label><input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Glow & Co." /></>),
    2: (<><label className="lbl">Industry</label><select className="select" value={form.industry} onChange={(e) => set('industry', e.target.value)}>{INDUSTRIES.map((i) => <option key={i}>{i}</option>)}</select></>),
    3: (<><label className="lbl">What do you do? (2–3 lines)</label><textarea className="textarea" value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Boutique salon: cuts, colour, facials, bridal." /></>),
    4: (<><label className="lbl">Services (one per line: Name — Price₹)</label><textarea className="textarea" value={form.services} onChange={(e) => set('services', e.target.value)} /></>),
    5: (<><label className="lbl">Pricing notes (deposits, packages, what AI must never discount)</label><textarea className="textarea" value={form.pricing} onChange={(e) => set('pricing', e.target.value)} placeholder="Bridal needs 30% advance. Never discount below listed price." /></>),
    6: (<><label className="lbl">Opening hours</label><input className="input" value={form.hours} onChange={(e) => set('hours', e.target.value)} /></>),
    7: (<><label className="lbl">Location</label><input className="input" value={form.location} onChange={(e) => set('location', e.target.value)} placeholder="Area, City" /></>),
    8: (<><label className="lbl">Phone</label><input className="input" value={form.phone} onChange={(e) => set('phone', e.target.value)} /><label className="lbl">Email</label><input className="input" value={form.email} onChange={(e) => set('email', e.target.value)} /><label className="lbl">Website (optional)</label><input className="input" value={form.website} onChange={(e) => set('website', e.target.value)} /></>),
    9: (<><label className="lbl">Calendar</label><select className="select" value={form.calendar} onChange={(e) => set('calendar', e.target.value)}><option value="internal">Built-in scheduler (works now)</option><option value="google">Google Calendar (connect in Integrations)</option></select></>),
    10: (<><label className="lbl">Communication</label><textarea className="textarea" value={form.followup} onChange={(e) => set('followup', e.target.value)} placeholder="Reply instantly; chase 15m/6h/24h; STOP always opts out." /></>),
    11: (<><label className="lbl">Assistant name</label><input className="input" value={form.assistant} onChange={(e) => set('assistant', e.target.value)} /><label className="lbl">Tone</label><select className="select" value={form.tone} onChange={(e) => set('tone', e.target.value)}><option>friendly-professional</option><option>warm-casual</option><option>formal</option></select></>),
    12: (<><label className="lbl">Follow-up preferences</label><textarea className="textarea" value={form.followup} onChange={(e) => set('followup', e.target.value)} /></>),
    13: (<><label className="lbl">Review requests</label><textarea className="textarea" value={form.reviews} onChange={(e) => set('reviews', e.target.value)} /></>),
    14: (<><div className="alert alert-ok">Ready. We will create a test lead and send the instant AI reply so you can watch the automation log.</div></>),
  };

  return (
    <main className="container section wizard">
      <span className="eyebrow">Onboarding · step {step} of 14</span>
      <h2>{steps[step - 1]}</h2>
      <div className="steps-nav">{steps.map((s, i) => <span key={s} className={i + 1 === step ? 'on' : ''}>{i + 1}</span>)}</div>
      <div className="card pad">
        {fields[step]}
        {msg && <div className="alert alert-err">{msg}</div>}
        <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'space-between' }}>
          <button className="btn btn-ghost" disabled={step === 1} onClick={() => setStep((s) => Math.max(1, s - 1))}>Back</button>
          {step < 14 ? (
            <button className="btn btn-primary" onClick={() => setStep((s) => Math.min(14, s + 1))} disabled={step === 1 && !form.name.trim()}>Continue</button>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost" onClick={() => finish(false)}>Finish without test</button>
              <button className="btn btn-primary" onClick={() => finish(true)}>Test automation →</button>
            </div>
          )}
        </div>
      </div>
      <p className="micro">Your LeadPilot system is ready after step 14. You can change everything later in Settings.</p>
    </main>
  );
}
