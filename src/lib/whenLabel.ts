export type When = 'now' | 'tonight' | 'today' | 'tomorrow';

/**
 * Plain-language day for a start time, so a time like "01:45" is never
 * ambiguous: now / tonight / today / tomorrow. Late this evening and the
 * small hours of the next morning (before 06:00) count as "tonight", seen
 * from any time of day, matching how the best-times card covers today +
 * tonight (now until 06:00).
 */
export function whenOf(start: Date, now: Date, startsNow = false): When {
  if (startsNow) return 'now';
  const sameDay = start.toDateString() === now.toDateString();
  const hour = start.getHours();
  // In the small hours (before 06:00), the rest of the night is still "tonight".
  if (sameDay) return hour >= 22 || (hour < 6 && now.getHours() < 6) ? 'tonight' : 'today';
  if (hour < 6 && isNextDay(start, now)) return 'tonight';
  return 'tomorrow';
}

function isNextDay(start: Date, now: Date): boolean {
  const next = new Date(now);
  next.setDate(next.getDate() + 1);
  return start.toDateString() === next.toDateString();
}
