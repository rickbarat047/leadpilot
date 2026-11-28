// Temporary guard for the appointment PATCH endpoint. Rescheduling and
// reactivation are Phase 1C work; until then, only safe status transitions are
// accepted. Start-time changes are rejected because the endpoint does not
// recalculate ends_at or revalidate conflicts.

export type AppointmentPatchBody = {
  status?: unknown;
  starts_at?: unknown;
};

export type AppointmentPatchDecision =
  | { ok: true; status?: string }
  | { ok: false; reason: 'start_time_change_disabled' | 'reactivation_disabled' | 'invalid_status'; http: number };

const ALLOWED_STATUS = ['booked', 'completed', 'cancelled', 'no-show'] as const;

export function validateAppointmentPatch(
  currentStatus: string,
  body: AppointmentPatchBody,
): AppointmentPatchDecision {
  if (body.starts_at !== undefined && body.starts_at !== null && body.starts_at !== '') {
    return { ok: false, reason: 'start_time_change_disabled', http: 400 };
  }
  if (body.status === undefined || body.status === null) return { ok: true };
  if (typeof body.status !== 'string' || !ALLOWED_STATUS.includes(body.status as never)) {
    return { ok: false, reason: 'invalid_status', http: 400 };
  }
  if (body.status === 'booked' && currentStatus !== 'booked') {
    return { ok: false, reason: 'reactivation_disabled', http: 400 };
  }
  return { ok: true, status: body.status };
}
