import { run } from './db';
import { uid } from './ids';

/** Writes an entry to automation_runs (visible in Automations → Runs). Never throws. */
export async function recordRun(
  businessId: string,
  automationId: string,
  name: string,
  trigger: string,
  leadId: string,
  steps: unknown[],
  status: string,
  error: string,
): Promise<void> {
  await run(
    `INSERT INTO automation_runs (id, business_id, automation_id, automation_name, trigger, lead_id, steps_json, status, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    uid('run'), businessId, automationId, name, trigger, leadId, JSON.stringify(steps), status, (error || '').slice(0, 1000),
  ).catch(() => undefined);
}
