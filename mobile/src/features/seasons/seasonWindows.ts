// Which festival (if any) is active on a given date, independent of the
// user's own on/off preference — SeasonProvider combines the two. Dates are
// MM-DD, inclusive, compared in the device's local time zone (festival UI is
// a cosmetic convenience, not a financial cutoff, so local time is fine —
// contrast with booking/cancellation eligibility, which CLAUDE.md requires
// to use server time).
export type SeasonId = 'base' | 'halloween';

type SeasonWindow = {
  id: Exclude<SeasonId, 'base'>;
  startMonthDay: `${number}-${number}`; // MM-DD
  endMonthDay: `${number}-${number}`;
};

// Add further festivals here as their asset packs are built (Navratri,
// Diwali, ...) — each gets one entry; getCalendarSeason returns the first
// window that contains today.
const SEASON_WINDOWS: SeasonWindow[] = [{ id: 'halloween', startMonthDay: '10-15', endMonthDay: '11-02' }];

function toMonthDayNumber(monthDay: string): number {
  const [month, day] = monthDay.split('-').map(Number);
  return month * 100 + day;
}

export function getCalendarSeason(date: Date = new Date()): SeasonId {
  const todayNumber = (date.getMonth() + 1) * 100 + date.getDate();
  const active = SEASON_WINDOWS.find((w) => {
    const start = toMonthDayNumber(w.startMonthDay);
    const end = toMonthDayNumber(w.endMonthDay);
    return start <= end ? todayNumber >= start && todayNumber <= end : todayNumber >= start || todayNumber <= end;
  });
  return active?.id ?? 'base';
}
