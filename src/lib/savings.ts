import type { AppliancePreset } from '../config/appliances';
import type { HourlyPrice } from '../providers/types';
import { matchPresetId } from './applianceDisplay';
import { findCheapestWindow } from './priceUtils';

/**
 * "Möjlig besparing": what a household could save in a day by running its
 * shiftable appliances in the day's cheapest window instead of the evening
 * peak (17–20), the same comparison the smart pushes use
 * (functions/src/smartPushes.ts). An estimate, never a measurement: Elpuls
 * can't see when anything actually ran, so the card always says so.
 *
 * Only the spot price moves with time; grid fee, energy tax and markup are
 * the same per kWh at any hour, so the difference is spot × VAT.
 */

const VAT = 1.25;
export const EVENING_PEAK_START = 17;
export const EVENING_PEAK_END = 20;
/** Appliances that may run overnight (delayed start / plug in the car), as in Din plan. */
const NIGHT_FRIENDLY = new Set(['ev', 'dishwasher', 'washing_machine', 'dryer', 'pool_heater']);
/** Others only between these hours, as in Din plan. */
const AWAKE_START = 7;
const AWAKE_END = 22;

/**
 * How often a typical Swedish household runs each one, per week. Plain
 * assumptions, shown to the user under "Så räknar vi".
 * EV: 10 one-hour sessions at 3.6 kW ≈ 36 kWh/week ≈ 10 000 km a year.
 */
export const USES_PER_WEEK: Record<string, number> = {
  dishwasher: 5,
  washing_machine: 4,
  dryer: 3,
  ev: 10,
  sauna: 1,
  pool_heater: 7,
};
const UNKNOWN_USES_PER_WEEK = 3;

const stockholmHour = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Stockholm', hour: 'numeric', hourCycle: 'h23' });
const stockholmDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Stockholm' });

function hourOf(d: Date): number {
  return Number(stockholmHour.format(d));
}

/** YYYY-MM-DD in Stockholm time. */
export function dateKeyOf(d: Date): string {
  return stockholmDate.format(d);
}

/** The preset kind an appliance is (its own id for presets, matched by name for registered ones). */
export function kindOf(a: AppliancePreset): string {
  return a.householdDefault || a.id === 'ev' ? a.id : matchPresetId(a.label) ?? a.id;
}

/** Stable key for the household, so cached days are recomputed when it changes. */
export function householdKey(household: AppliancePreset[]): string {
  return household
    .filter((a) => a.shiftable)
    .map((a) => `${kindOf(a)}:${a.watts}:${a.typicalDurationHours}`)
    .sort()
    .join(',');
}

/** Estimated kr saved (incl. VAT) on one day of spot prices (SEK/kWh excl. VAT). 0 when the day has no evening prices. */
export function estimateDaySaving(prices: HourlyPrice[], household: AppliancePreset[]): number {
  const evening = prices.filter((p) => {
    const h = hourOf(p.hour);
    return h >= EVENING_PEAK_START && h < EVENING_PEAK_END;
  });
  if (evening.length === 0) return 0;
  const eveningAvg = evening.reduce((s, p) => s + p.price, 0) / evening.length;
  const awake = prices.filter((p) => {
    const h = hourOf(p.hour);
    return h >= AWAKE_START && h < AWAKE_END;
  });

  let total = 0;
  for (const a of household) {
    if (!a.shiftable) continue;
    const kind = kindOf(a);
    const pool = NIGHT_FRIENDLY.has(kind) ? prices : awake;
    const window = findCheapestWindow(pool, a.typicalDurationHours, new Date(0));
    if (!window) continue;
    const kwh = (a.watts / 1000) * a.typicalDurationHours;
    const perRun = kwh * (eveningAvg - window.averagePrice) * VAT;
    if (perRun <= 0) continue;
    total += perRun * ((USES_PER_WEEK[kind] ?? UNKNOWN_USES_PER_WEEK) / 7);
  }
  return total;
}
