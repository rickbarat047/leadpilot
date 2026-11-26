'use client';
import { useApi, api } from '@/components/api';

type Aut = { id: string; name: string; trigger: string; steps_json: string; enabled: number };
type Run = { id: string; automation_name: string; trigger: string; lead_id: string; steps_json: string; status: string; error: string; created_at: string };

export default function Automations() {
  const { data, reload } = useApi<{ automations: Aut[] }>('/api/automations');
  const runs = useApi<{ runs: Run[] }>('/api/automations?runs=1');

  async function toggle(a: Aut) {
    await api('/api/automations', { method: 'PUT', body: JSON.stringify({ id: a.id, enabled: a.enabled ? 0 : 1 }) });
    reload(); runs.reload();
  }
  async function tick() {
    await fetch('/api/cron/tick', { method: 'POST' });
    reload(); runs.reload();
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ marginTop: 0 }}>Automations</h2>
        <button className="btn btn-ghost btn-sm" onClick={tick}>Run tick now</button>
      </div>
      <div className="grid-2">
        {(data?.automations ?? []).map((a) => (
          <div className="card pad" key={a.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 800 }}>{a.name}</div>
              <span className="pill">{a.enabled ? 'enabled' : 'paused'}</span>
            </div>
            <div className="micro">Trigger: {a.trigger}</div>
            <div className="flow" style={{ marginTop: 10 }}>
              {(JSON.parse(a.steps_json || '[]') as { type: string; template?: string }[]).map((s, i) => (
                <div key={i}>
                  <div className="flow-step"><div className="flow-dot">{i + 1}</div><div style={{ fontSize: 13.5 }}><b>{s.type}</b>{s.template ? ` · ${s.template}` : ''}</div></div>
                  {i < (JSON.parse(a.steps_json || '[]') as unknown[]).length - 1 && <div className="flow-line" />}
                </div>
              ))}
            </div>
            <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={() => toggle(a)}>{a.enabled ? 'Pause' : 'Enable'}</button>
          </div>
        ))}
      </div>
      <h3 style={{ marginTop: 26 }}>Execution log <span className="micro">(no silent failures)</span></h3>
      <div className="card table-wrap" style={{ overflowX: 'auto' }}>
        <table className="table">
          <thead><tr><th>Time</th><th>Automation</th><th>Trigger</th><th>Status</th><th>Detail</th></tr></thead>
          <tbody>
            {(runs.data?.runs ?? []).map((r) => (
              <tr key={r.id}>
                <td style={{ fontSize: 12.5 }}>{new Date(r.created_at).toLocaleString()}</td>
                <td>{r.automation_name}</td><td>{r.trigger}</td>
                <td><span className="pill" style={r.status === 'failed' ? { background: '#fde8e4', color: '#9c241a' } : {}}>{r.status}</span></td>
                <td style={{ fontSize: 12.5, maxWidth: 360 }}>{(r.steps_json || '').slice(0, 160)}{r.error ? ` — ${r.error}` : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {(runs.data?.runs?.length ?? 0) === 0 && <div className="pad micro">No runs yet — add a lead or press “Run tick now”.</div>}
      </div>
    </div>
  );
}
