export type When = 'now' | 'tonight' | 'today' | 'tomorrow';

/**
 * Plain-language day for a start time, so a time like "01:45" is never
 * ambiguous: now / tonight / today / tomorrow. Early tomorrow morning, seen
 * from the afternoon or evening, counts as "tonight".
 */
export function whenOf(start: Date, now: Date, startsNow = false): When {
  if (startsNow) return 'now';
  const sameDay = start.toDateString() === now.toDateString();
  const hour = start.getHours();
  if (sameDay) return hour >= 22 ? 'tonight' : 'today';
  if (hour < 7 && now.getHours() >= 15) return 'tonight';
  return 'tomorrow';
}
