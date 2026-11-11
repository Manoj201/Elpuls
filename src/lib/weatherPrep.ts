import type { HourlyForecast } from '../providers/types';

export interface WeatherPrepTip {
  type: 'coldSnapEv' | 'coldSnapGeneric' | 'dryingWindow';
  startHour: number;
  endHour: number;
}

const COLD_SNAP_START_HOUR = 5;
const COLD_SNAP_END_HOUR = 9;
// Same "medium" threshold as priceRisk.ts's coldSeverity — good enough to
// flag "worth preparing for", not meant to duplicate that file's whole-day
// price-risk concern.
const COLD_SNAP_TEMP_THRESHOLD_C = 0;

const DRYING_WINDOW_START_HOUR = 12;
const DRYING_WINDOW_END_HOUR = 18;
const DRYING_WINDOW_MIN_WIND_MS = 6;
const DRYING_WINDOW_MAX_CLOUD_PCT = 40;

function isSameLocalDate(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function filterHourRange(forecast: HourlyForecast[], date: Date, startHour: number, endHour: number): HourlyForecast[] {
  return forecast.filter((f) => isSameLocalDate(f.hour, date) && f.hour.getHours() >= startHour && f.hour.getHours() < endHour);
}

function average(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Early-warning action tips triggered by tomorrow's/today's weather,
 * independent of price — distinct from priceRisk.ts (which reasons about
 * price impact) and the cost-driven heating plan. Cold-snap takes priority
 * over the drying-window tip when both would apply.
 */
export function findWeatherPrepTip(forecast: HourlyForecast[], now: Date, hasEv: boolean): WeatherPrepTip | null {
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const morningEntries = filterHourRange(forecast, tomorrow, COLD_SNAP_START_HOUR, COLD_SNAP_END_HOUR);
  if (morningEntries.length > 0 && average(morningEntries.map((f) => f.tempC)) < COLD_SNAP_TEMP_THRESHOLD_C) {
    return { type: hasEv ? 'coldSnapEv' : 'coldSnapGeneric', startHour: COLD_SNAP_START_HOUR, endHour: COLD_SNAP_END_HOUR };
  }

  if (now.getHours() < DRYING_WINDOW_END_HOUR) {
    const afternoonEntries = filterHourRange(forecast, now, DRYING_WINDOW_START_HOUR, DRYING_WINDOW_END_HOUR);
    if (
      afternoonEntries.length > 0 &&
      average(afternoonEntries.map((f) => f.windMs)) >= DRYING_WINDOW_MIN_WIND_MS &&
      average(afternoonEntries.map((f) => f.cloudCoverPct)) <= DRYING_WINDOW_MAX_CLOUD_PCT
    ) {
      return { type: 'dryingWindow', startHour: DRYING_WINDOW_START_HOUR, endHour: DRYING_WINDOW_END_HOUR };
    }
  }

  return null;
}
