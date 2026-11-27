'use client';
import { WEEKDAYS, type HoursForm, type Weekday } from '@/lib/business-hours';

const LABELS: Record<Weekday, string> = {
  mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday',
  fri: 'Friday', sat: 'Saturday', sun: 'Sunday',
};
const ORDER: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

export default function HoursEditor({ value, onChange }: { value: HoursForm; onChange: (next: HoursForm) => void }) {
  const setDay = (day: Weekday, patch: Partial<HoursForm['days'][Weekday]>) =>
    onChange({ ...value, days: { ...value.days, [day]: { ...value.days[day], ...patch } } });

  return (
    <div>
      <label className="lbl">Time zone (IANA, e.g. Asia/Kolkata)</label>
      <input className="input" value={value.timezone} onChange={(e) => onChange({ ...value, timezone: e.target.value })} placeholder="Asia/Kolkata" />
      <div className="micro" style={{ margin: '6px 0 10px' }}>
        Set each day as open or closed. Closed days never produce appointment slots; times are required for open days.
      </div>
      {ORDER.map((day) => {
        const d = value.days[day];
        return (
          <div key={day} className="check-row" style={{ flexWrap: 'wrap', gap: 8 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 110 }}>
              <input type="checkbox" checked={d.open} onChange={(e) => setDay(day, { open: e.target.checked })} />
              <span>{LABELS[day]}</span>
            </label>
            {d.open && (
              <>
                <input type="time" className="input" aria-label={`${LABELS[day]} opening time`} value={d.start} onChange={(e) => setDay(day, { start: e.target.value })} style={{ width: 130 }} />
                <span className="micro">to</span>
                <input type="time" className="input" aria-label={`${LABELS[day]} closing time`} value={d.end} onChange={(e) => setDay(day, { end: e.target.value })} style={{ width: 130 }} />
              </>
            )}
          </div>
        );
      })}
      {!Object.values(value.days).some((d) => d.open) && (
        <div className="alert alert-err" style={{ marginTop: 8 }}>No opening hours configured yet. Availability will stay empty until at least one day is open.</div>
      )}
      <div className="micro" style={{ marginTop: 8 }}>Days: {WEEKDAYS.join(', ')}</div>
    </div>
  );
}
