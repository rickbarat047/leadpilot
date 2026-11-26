import Link from 'next/link';
import { SiteNav, SiteFooter } from '@/components/site';
import { RoiCalculator } from '@/components/roi';
import { FaqAccordion } from '@/components/faq';
import { PLANS } from '@/lib/billing';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Turn missed leads into booked customers',
  description: 'LeadPilot instantly responds to new leads, follows up automatically, qualifies prospects, and books appointments while you focus on your business.',
  alternates: { canonical: '/' },
};

const INDUSTRIES = ['Salons', 'Dental Clinics', 'Gyms & Studios', 'Home Services', 'Photographers', 'Tutors', 'Real Estate', 'Wedding & Events'];

function DashboardMock() {
  return (
    <div className="card mock-browser">
      <div className="mock-bar">
        <span className="dot" /><span className="dot" /><span className="dot" />
        <span className="mock-url">app.leadpilot.in/overview</span>
      </div>
      <div className="dash">
        <div className="dash-side">
          <div className="on">◉ Overview</div><div>◎ Leads</div><div>◎ Conversations</div><div>◎ Appointments</div><div>◎ Automations</div><div>◎ Analytics</div>
        </div>
        <div className="dash-main">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontWeight: 800, fontSize: 15 }}>Good morning, Glow & Co.</div>
            <span className="pill booked">● AI handling 3 chats</span>
          </div>
          <div className="kpis-dense" style={{ marginBottom: 12 }}>
            {[['Leads today', '14'], ['Qualified', '9'], ['Booked', '6'], ['Response', '38s']].map(([l, v]) => (
              <div className="card kpi" key={l} style={{ boxShadow: 'none' }}><div className="l">{l}</div><div className="v" style={{ fontSize: 22 }}>{v}</div></div>
            ))}
          </div>
          <div className="chat" style={{ marginBottom: 12 }}>
            <div className="bubble lead">Hi! I&apos;d like balayage pricing please</div>
            <div className="bubble ai">Hi Priya — our Balayage is ₹4,999. What date suits you?</div>
          </div>
          <table className="table">
            <thead><tr><th>Lead</th><th>Service</th><th>Status</th></tr></thead>
            <tbody>
              <tr><td><b>Priya S.</b></td><td>Balayage</td><td><span className="pill booked">Booked</span></td></tr>
              <tr><td><b>Rahul V.</b></td><td>Haircut</td><td><span className="pill warm">Qualified</span></td></tr>
              <tr><td><b>Ananya I.</b></td><td>Facial</td><td><span className="pill">Contacted</span></td></tr>
            </tbody>
          </table>
          <div style={{ marginTop: 8 }}><span className="badge-sample">Sample preview</span></div>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <>
      <SiteNav announce={<>New: UPI Autopay billing is live — <b>pay monthly with any UPI app</b></>} />
      <main>
        {/* HERO */}
        <div className="container hero">
          <span className="eyebrow rise"><span className="pulse" /> Lead recovery + booking automation</span>
          <h1 className="rise rise-1">Stop losing customers because <span className="accent">you replied too late.</span></h1>
          <p className="lede rise rise-2">
            LeadPilot instantly responds to new leads, follows up automatically, qualifies prospects,
            and books appointments — while you focus on your business.
          </p>
          <div className="hero-cta rise rise-2">
            <Link href="/signup" className="btn btn-primary btn-lg">Start 14-day free trial</Link>
            <Link href="/demo" className="btn btn-ghost btn-lg">See live demo</Link>
          </div>
          <div className="proof-row rise rise-3">
            <div className="avatars">
              <span style={{ background: '#0f766e' }}>PS</span>
              <span style={{ background: '#b98a2f' }}>RV</span>
              <span style={{ background: '#4a5d5a' }}>AI</span>
              <span style={{ background: '#14201f' }}>+</span>
            </div>
            <div style={{ textAlign: 'left' }}>
              <div className="stars">★★★★★</div>
              <div className="micro" style={{ marginTop: 2 }}>No credit card required · Set up in ~15 minutes · Cancel anytime</div>
            </div>
          </div>
          <div style={{ marginTop: 44, textAlign: 'left' }} className="rise rise-3"><DashboardMock /></div>
        </div>

        {/* LOGO STRIP */}
        <div style={{ paddingBottom: 8 }}>
          <div className="logo-caption">Purpose-built for service businesses</div>
          <div className="logo-strip" style={{ borderTop: 0 }}>
            <div className="logo-strip-inner">
              <span>{INDUSTRIES.join('   ')}</span><span>{INDUSTRIES.join('   ')}</span>
            </div>
          </div>
        </div>

        {/* STATS BAND */}
        <div className="container section-tight">
          <div className="band">
            <div className="band-grid">
              {[
                ['<em>60s</em>', 'Target first response to every lead, day or night'],
                ['<em>3-step</em>', 'Automatic chase: 15 min, 6 hours, 24 hours'],
                ['<em>24/7</em>', 'Replies, qualifies and books while you sleep'],
                ['<em>0</em>', 'Leads left waiting — every run is logged'],
              ].map(([n, t]) => (
                <div className="stat" key={t}>
                  <div className="n" dangerouslySetInnerHTML={{ __html: n }} />
                  <div className="t">{t}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* HOW IT WORKS */}
        <div className="container section">
          <div className="section-label">How it works</div>
          <h2>From missed lead to <span className="accent">booked customer</span>, automatically</h2>
          <p className="sub">Connect once. LeadPilot runs the follow-up shift you never had time for.</p>
          <div className="grid-2">
            <div className="card pad card-hover">
              <div className="flow">
                {[
                  ['Lead arrives', 'Website form, widget, import, webhook/API, or missed-call event creates the lead instantly.'],
                  ['AI classifies', 'Service, urgency, value, intent, preferred time, quality and conversion probability.'],
                  ['Instant reply', 'A personal first reply in under a minute — asking only what moves things forward.'],
                  ['Booked & reminded', 'Real availability, confirmation, T-24h/T-2h reminders, reschedules handled.'],
                  ['Recovered or reviewed', 'Silent leads enter the chase sequence; completed visits get review requests.'],
                ].map(([t, d], i) => (
                  <div key={t}>
                    <div className="flow-step">
                      <div className={`flow-dot ${i > 0 ? 'teal' : ''}`}>{i + 1}</div>
                      <div><div style={{ fontWeight: 800 }}>{t}</div><div style={{ color: 'var(--muted)', fontSize: 14.5 }}>{d}</div></div>
                    </div>
                    {i < 4 && <div className="flow-line" />}
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {[
                ['Connect in ~15 minutes', 'Business, services, pricing, hours, calendar and tone. Guided onboarding, change anything later.'],
                ['You stay in control', 'Pause AI per conversation, reply yourself, resume anytime. Every action logged — nothing silent.'],
                ['Guardrailed by design', 'The AI only uses knowledge you configure. Unsure answers escalate to you with a draft — never invented prices or promises.'],
              ].map(([t, d]) => (
                <div className="card pad card-hover" key={t}>
                  <div className="step-num">—</div>
                  <div style={{ fontWeight: 800, fontSize: 17 }}>{t}</div>
                  <div style={{ color: 'var(--muted)' }}>{d}</div>
                </div>
              ))}
              <Link href="/how-it-works" className="btn btn-ghost" style={{ alignSelf: 'flex-start' }}>See the full workflow →</Link>
            </div>
          </div>
        </div>

        {/* ROI */}
        <div className="container section" style={{ paddingTop: 0 }}>
          <div className="section-label">Return on follow-up</div>
          <h2>What could faster follow-up <span className="accent">be worth?</span></h2>
          <p className="sub">Interactive estimate. Adjust to your business.</p>
          <RoiCalculator />
        </div>

        {/* FEATURES */}
        <div className="container section" style={{ paddingTop: 0 }}>
          <div className="section-label">Everything included</div>
          <h2>One system. <span className="accent">Zero leaks.</span></h2>
          <p className="sub">Built for owners, not marketers. CRM, AI replies, sequences, calendar, reviews, reports.</p>
          <div className="grid-3">
            {[
              ['⚡ Instant response', 'Under-60-second first reply, 24/7, in your tone of voice.'],
              ['🎯 Smart qualification', 'Service, urgency, value, intent and booking time extracted automatically.'],
              ['🔁 Follow-up engine', 'Data-driven sequences that stop the moment a human replies.'],
              ['📅 Booking + reminders', 'Offers real slots, confirms, reminds, handles reschedules.'],
              ['⭐ Review requests', 'Timed asks after completed service with open/click tracking.'],
              ['📊 Owner analytics', 'Leads, conversion, recovered revenue, response time, funnel.'],
            ].map(([t, d]) => (
              <div className="card pad card-hover" key={t}>
                <div style={{ fontWeight: 800, fontSize: 16.5 }}>{t}</div>
                <div style={{ color: 'var(--muted)', fontSize: 14.5 }}>{d}</div>
              </div>
            ))}
          </div>
        </div>

        {/* COMPARISON */}
        <div className="container section" style={{ paddingTop: 0 }}>
          <div className="section-label">Why LeadPilot</div>
          <h2>Not another chatbot. <span className="accent">A bookings system.</span></h2>
          <p className="sub">Compare what actually happens to an enquiry at 11pm.</p>
          <div style={{ overflowX: 'auto' }}>
            <table className="compare">
              <thead><tr><th></th><th>Doing it manually</th><th className="hl">LeadPilot</th><th>Generic AI chatbot</th></tr></thead>
              <tbody>
                {[
                  ['First response', 'Next morning (or never)', 'Under 60 seconds, 24/7', 'Instant — but generic'],
                  ['Follow-up', 'Forgotten after day 1', 'Automatic 15m / 6h / 24h chase', 'None — waits to be asked'],
                  ['Qualification', 'Back-and-forth calls', 'AI extracts service, time, intent', 'Answers FAQs only'],
                  ['Booking', 'Phone tag', 'Real slots + reminders', 'Gives you a link'],
                  ['Proof it worked', 'Gut feeling', 'Conversion + recovered revenue reports', 'Chat transcripts'],
                ].map(([row, a, b, c]) => (
                  <tr key={row as string}>
                    <th>{row}</th><td><span className="no">✕</span> {a}</td>
                    <td className="hl"><span className="yes">✓</span> {b}</td>
                    <td><span className="no">–</span> {c}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* TESTIMONIALS */}
        <div className="container section" style={{ paddingTop: 0 }}>
          <div className="section-label">Loved by busy owners <span className="badge-sample">Sample quotes</span></div>
          <h2>Owners feel the difference <span className="accent">in week one</span></h2>
          <p className="sub">Illustrative fictional feedback — not real customers.</p>
          <div className="grid-3">
            {[
              ['We stopped losing evening enquiries. The morning calendar is just full now.', 'Sample salon owner', 'PS', '#0f766e', 'Demo quote'],
              ['Follow-ups just happen. I only step in for the tricky ones.', 'Sample clinic manager', 'DK', '#b98a2f', 'Demo quote'],
              ['The review requests alone were worth it. Bookings steady all month.', 'Sample studio founder', 'AR', '#4a5d5a', 'Demo quote'],
            ].map(([q, who, ini, col, tag]) => (
              <div className="card quote-card card-hover" key={who as string}>
                <div className="stars">★★★★★</div>
                <p>“{q}”</p>
                <div className="quote-who">
                  <div className="quote-ava" style={{ background: col as string }}>{ini}</div>
                  <div><div style={{ fontWeight: 700, fontSize: 14 }}>{who}</div><div className="micro" style={{ margin: 0 }}>{tag}</div></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* PRICING */}
        <div className="container section" style={{ paddingTop: 0 }}>
          <div className="center">
            <div className="section-label">Pricing</div>
            <h2>One recovered customer <span className="accent">pays for the month</span></h2>
            <p className="sub">Start free for 14 days. Pay monthly with UPI Autopay. Cancel anytime.</p>
          </div>
          <div className="price-grid" style={{ marginTop: 32 }}>
            {(['starter', 'growth', 'pro'] as const).map((id) => (
              <div className={`card price-card card-hover ${id === 'growth' ? 'hot' : ''}`} key={id}>
                {id === 'growth' && <div className="price-flag">Most popular</div>}
                <div style={{ fontWeight: 800, fontSize: 17 }}>{PLANS[id].name}</div>
                <div className="price">₹{PLANS[id].priceInr.toLocaleString('en-IN')}<span style={{ fontSize: 14, fontWeight: 500, color: 'var(--muted)' }}>/mo</span></div>
                <div style={{ color: 'var(--muted)', fontSize: 14 }}>{PLANS[id].tagline}</div>
                <ul className="tick">{PLANS[id].features.map((f) => <li key={f}>{f}</li>)}</ul>
                <div style={{ flex: 1 }} />
                <Link href="/signup" className={`btn ${id === 'growth' ? 'btn-primary' : 'btn-ghost'}`}>Start free trial</Link>
              </div>
            ))}
          </div>
          <p className="micro center" style={{ marginTop: 16 }}>No guaranteed results. Prices in INR, GST invoice available on request.</p>
        </div>

        {/* FAQ */}
        <div className="container-narrow section" style={{ paddingTop: 0 }}>
          <div className="center">
            <div className="section-label">FAQ</div>
            <h2>Questions, <span className="accent">answered</span></h2>
          </div>
          <div style={{ marginTop: 24 }}>
            <FaqAccordion items={[
              ['Will the AI invent prices or availability?', 'No. It only uses the services, pricing and hours you configure. Anything uncertain escalates to you with a draft reply — it never invents prices, discounts, or slots.'],
              ['What happens when a lead replies STOP?', 'All messaging to that contact stops immediately, the lead is marked accordingly, and the opt-out is logged.'],
              ['How do payments work?', 'Monthly billing via Razorpay UPI Autopay — customers approve once in their UPI app and billing runs automatically. Cards work too. Cancel anytime.'],
              ['Do I need to be technical to set it up?', 'No. The 14-step onboarding wizard walks you through business details, services, hours and preferences in about 15 minutes.'],
              ['Can I take over a conversation from the AI?', 'Yes, anytime. Pause AI on any thread, reply yourself, and resume automation when you want.'],
              ['Is my business data isolated?', 'Yes. Every business gets fully isolated leads, conversations, appointments, analytics and billing — enforced at the database level.'],
            ]} />
          </div>
        </div>

        {/* FINAL CTA */}
        <div className="container section" style={{ paddingTop: 0 }}>
          <div className="cta-band">
            <h2>Your next lead is coming. <span className="accent" style={{ color: '#7fd1c6' }}>Will you reply in time?</span></h2>
            <p className="sub" style={{ marginLeft: 'auto', marginRight: 'auto' }}>Join in 15 minutes. First 14 days free — no credit card required.</p>
            <div className="hero-cta">
              <Link href="/signup" className="btn btn-light btn-lg">Start free trial</Link>
              <Link href="/demo" className="btn btn-sm" style={{ border: '1px solid #3a4a47', color: '#fff', padding: '15px 30px', fontSize: 16 }}>See live demo</Link>
            </div>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
