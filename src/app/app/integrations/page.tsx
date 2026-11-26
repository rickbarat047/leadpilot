'use client';
import { useApi } from '@/components/api';
export default function Integrations() {
  const { data } = useApi<{ business: { id: string } }>('/api/business');
  const bizId = data?.business?.id ?? '';
  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Integrations</h2>
      <div className="grid-2">
        <div className="card pad"><b>Lead webhook</b><div className="micro">POST JSON to:</div><code style={{ fontSize: 12.5 }}>/api/webhooks/lead?businessId={bizId || '…'}</code><div className="micro" style={{ marginTop: 8 }}>Body: name, email?, phone?, service?, message?, source?. Sign with HMAC when WEBHOOK_SECRET set.</div></div>
        <div className="card pad"><b>Google Calendar</b><div className="micro">Connect via OAuth (set GOOGLE_* env). Until then the internal scheduler books + sends ICS-ready times.</div><span className="pill">disconnected</span></div>
        <div className="card pad"><b>Email (Resend)</b><div className="micro">Set RESEND_API_KEY to send live. Until then every send is logged in Automations → Runs (mock).</div></div>
        <div className="card pad"><b>Stripe</b><div className="micro">Set STRIPE_* keys for live checkout. Until then Billing runs a mock checkout that activates plans.</div></div>
      </div>
    </div>
  );
}
