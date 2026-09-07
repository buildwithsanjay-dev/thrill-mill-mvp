// Small formatting helpers only — never used to decide business logic
// (availability, cancellation eligibility, pricing). The backend is always
// authoritative for those, using server time.

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function addDaysIso(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// "14:00:00" -> "2:00 PM"
export function formatSlotTime(time: string): string {
  const [hourStr, minuteStr] = time.split(':');
  let hour = parseInt(hourStr, 10);
  const minute = minuteStr ?? '00';
  const period = hour >= 12 ? 'PM' : 'AM';
  if (hour === 0) hour = 12;
  else if (hour > 12) hour -= 12;
  else if (hour === 24) hour = 12;
  return `${hour}:${minute} ${period}`;
}

// "2026-08-29" -> "Sat, 29 Aug"
export function formatBookingDate(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00`);
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' });
}

export function formatDayLabel(isoDate: string): { weekday: string; day: string } {
  const d = new Date(`${isoDate}T00:00:00`);
  return {
    weekday: d.toLocaleDateString('en-IN', { weekday: 'short' }).toUpperCase(),
    day: d.toLocaleDateString('en-IN', { day: '2-digit' }),
  };
}
