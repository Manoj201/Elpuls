export interface WeatherHour {
  hour: string; // ISO string, as stored in the weather/{SE-ZONE} doc
  tempC: number;
  windMs: number;
  cloudCoverPct: number;
}

export type WeatherPrepTipType = 'coldSnap' | 'dryingWindow';

const COLD_SNAP_START_HOUR = 5;
const COLD_SNAP_END_HOUR = 9;
const COLD_SNAP_TEMP_THRESHOLD_C = 0;

const DRYING_WINDOW_START_HOUR = 12;
const DRYING_WINDOW_END_HOUR = 18;
const DRYING_WINDOW_MIN_WIND_MS = 6;
const DRYING_WINDOW_MAX_CLOUD_PCT = 40;

const stockholmDateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Stockholm' });
const stockholmHourFormatter = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Stockholm', hour: 'numeric', hourCycle: 'h23' });

function toStockholmDateKey(iso: string): string {
  return stockholmDateFormatter.format(new Date(iso));
}

function stockholmHourOf(iso: string): number {
  return Number(stockholmHourFormatter.format(new Date(iso)));
}

function average(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function filterHourRange(hours: WeatherHour[], dateKey: string, startHour: number, endHour: number): WeatherHour[] {
  return hours.filter((h) => toStockholmDateKey(h.hour) === dateKey && stockholmHourOf(h.hour) >= startHour && stockholmHourOf(h.hour) < endHour);
}

/**
 * Server-side duplicate of src/lib/weatherPrep.ts, adapted for the Firestore
 * weather doc shape (ISO-string hours) — same dual-copy precedent as
 * priceRisk.ts. Collapses the client's coldSnapEv/coldSnapGeneric into one
 * `coldSnap` type: the EV-vs-generic copy choice is resolved per-recipient
 * in dailyBriefing.ts, not here, since this runs once per zone for every
 * subscriber regardless of whether they own an EV.
 */
export function findWeatherPrepTip(hours: WeatherHour[], todayDateKey: string, tomorrowDateKey: string): WeatherPrepTipType | null {
  const morningEntries = filterHourRange(hours, tomorrowDateKey, COLD_SNAP_START_HOUR, COLD_SNAP_END_HOUR);
  if (morningEntries.length > 0 && average(morningEntries.map((h) => h.tempC)) < COLD_SNAP_TEMP_THRESHOLD_C) {
    return 'coldSnap';
  }

  const afternoonEntries = filterHourRange(hours, todayDateKey, DRYING_WINDOW_START_HOUR, DRYING_WINDOW_END_HOUR);
  if (
    afternoonEntries.length > 0 &&
    average(afternoonEntries.map((h) => h.windMs)) >= DRYING_WINDOW_MIN_WIND_MS &&
    average(afternoonEntries.map((h) => h.cloudCoverPct)) <= DRYING_WINDOW_MAX_CLOUD_PCT
  ) {
    return 'dryingWindow';
  }

  return null;
}
