'use client';
import { useApi } from '@/components/api';
export default function Reviews() {
  const { data } = useApi<{ business: { settings_json: string } }>('/api/business');
  const settings = (() => { try { return JSON.parse(data?.business?.settings_json ?? '{}'); } catch { return {}; } })();
  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Reviews</h2>
      <div className="card pad">
        <div style={{ fontWeight: 800 }}>Automatic review requests</div>
        <div className="micro">Sent after completed appointments · delay {settings.reviewDelayH ?? 48}h · destination {settings.reviewDestination ?? 'google'} · includes business name + opt-out line.</div>
        <div className="micro" style={{ marginTop: 8 }}>Tracking columns (sent / opened / clicked / completed) are stored per request. v1 sends via email/SMS mock and logs to Automations → Runs.</div>
      </div>
      <div className="card pad" style={{ marginTop: 12 }}>
        <div style={{ fontWeight: 800 }}>Review link template</div>
        <div className="micro">Hi {'{name}'} — thanks for visiting {'{business}'}! A 30-second review helps us enormously: {'{review_link}'}. Reply STOP to opt out.</div>
      </div>
    </div>
  );
}
