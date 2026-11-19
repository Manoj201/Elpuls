import type { AppliancePreset } from '../config/appliances';
import type { HourlyPrice } from '../providers/types';
import { matchPresetId } from './applianceDisplay';

/**
 * elprisetjustnu.se publishes prices in 15-minute intervals; averages them
 * into calendar-hour buckets for the "hourly price chart" view.
 */
export function groupPricesByHour(prices: HourlyPrice[]): HourlyPrice[] {
  const buckets = new Map<string, { hour: Date; total: number; count: number; currency: string }>();

  for (const p of prices) {
    const hourStart = new Date(p.hour);
    hourStart.setMinutes(0, 0, 0);
    const key = hourStart.toISOString();

    const existing = buckets.get(key);
    if (existing) {
      existing.total += p.price;
      existing.count += 1;
    } else {
      buckets.set(key, { hour: hourStart, total: p.price, count: 1, currency: p.currency });
    }
  }

  return Array.from(buckets.values())
    .map((b) => ({ hour: b.hour, price: b.total / b.count, currency: b.currency }))
    .sort((a, b) => a.hour.getTime() - b.hour.getTime());
}

/**
 * Finds the price entry that applies right now: the one with the latest
 * `hour` that is still <= now. Works regardless of the upstream interval
 * length (15 minutes today, could change), unlike indexing by clock hour.
 */
export function findCurrentPrice(prices: HourlyPrice[], now: Date): HourlyPrice | null {
  let current: HourlyPrice | null = null;

  for (const p of prices) {
    if (p.hour.getTime() <= now.getTime()) {
      if (!current || p.hour.getTime() > current.hour.getTime()) {
        current = p;
      }
    }
  }

  return current;
}

export interface CheapestWindow {
  start: HourlyPrice;
  /** End of the window (exclusive): start + duration. */
  end: Date;
  averagePrice: number;
}

/**
 * Length of one price slot in minutes, read from the data itself: 15 since
 * Nord Pool moved to quarter-hour prices (Oct 2025), 60 for hourly-averaged
 * input. Falls back to 60 when there's only one entry.
 */
export function slotMinutes(prices: { hour: Date }[]): number {
  for (let i = 1; i < prices.length; i++) {
    const diff = (prices[i].hour.getTime() - prices[i - 1].hour.getTime()) / 60000;
    if (diff > 0) return diff;
  }
  return 60;
}

/**
 * Finds the cheapest contiguous window of `durationHours` that starts at or
 * after `after`, working on whatever slot length the prices have. With the
 * real 15-minute prices, 1.5 h = 6 slots and a window can start at any
 * quarter-hour (e.g. 10:45). Windows that would span a gap in the data are
 * skipped. Pass today's + tomorrow's prices together so an evening check
 * can point at tomorrow morning.
 */
export function findCheapestWindow(
  prices: HourlyPrice[],
  durationHours: number,
  after: Date,
): CheapestWindow | null {
  const sorted = [...prices].sort((a, b) => a.hour.getTime() - b.hour.getTime());
  const slot = slotMinutes(sorted);
  // A slot that has already started still counts if it's the current one.
  const upcoming = sorted.filter((p) => p.hour.getTime() + slot * 60000 > after.getTime());

  const windowSize = Math.max(1, Math.round((durationHours * 60) / slot));
  if (upcoming.length < windowSize) {
    return null;
  }

  let best: CheapestWindow | null = null;

  for (let i = 0; i + windowSize <= upcoming.length; i++) {
    const first = upcoming[i];
    const last = upcoming[i + windowSize - 1];
    // Contiguous only: last slot starts exactly (size-1) slots after the first.
    if (last.hour.getTime() - first.hour.getTime() !== (windowSize - 1) * slot * 60000) continue;

    let total = 0;
    for (let j = i; j < i + windowSize; j++) total += upcoming[j].price;
    const averagePrice = total / windowSize;

    if (!best || averagePrice < best.averagePrice) {
      best = { start: first, end: new Date(last.hour.getTime() + slot * 60000), averagePrice };
    }
  }

  return best;
}

export interface ApplianceCostComparison {
  costNow: number | null;
  cheapestWindow: CheapestWindow | null;
  costAtWindow: number | null;
  showWaitOption: boolean;
}

/**
 * The pre-use decision calculation ("run now vs. wait for the cheapest
 * window"), shared by the single-appliance Kostnadskoll check and the
 * all-appliances-at-once Apparatrekommendationer screen so both agree on
 * the same numbers.
 */
export function compareApplianceCost(
  appliance: AppliancePreset,
  hourlyPrices: HourlyPrice[],
  now: Date,
): ApplianceCostComparison {
  const currentPrice = findCurrentPrice(hourlyPrices, now);
  const costNow = currentPrice
    ? (appliance.watts / 1000) * appliance.typicalDurationHours * currentPrice.price
    : null;

  // The dishwasher only gets evening/night times (21:00–06:00), like Din plan
  // and the pushes (functions/src/appliances.ts DISHWASHER_*).
  const isDishwasher = appliance.id === 'dishwasher' || matchPresetId(appliance.label) === 'dishwasher';
  const pool = isDishwasher
    ? hourlyPrices.filter((p) => {
        const h = p.hour.getHours();
        return h >= 21 || h < 6;
      })
    : hourlyPrices;
  const cheapestWindow = appliance.shiftable ? findCheapestWindow(pool, appliance.typicalDurationHours, now) : null;
  const costAtWindow = cheapestWindow
    ? (appliance.watts / 1000) * appliance.typicalDurationHours * cheapestWindow.averagePrice
    : null;

  const showWaitOption = appliance.shiftable && costAtWindow !== null && costNow !== null && costAtWindow < costNow * 0.99;

  return { costNow, cheapestWindow, costAtWindow, showWaitOption };
}

export function findExtremeHours(prices: HourlyPrice[]): {
  cheapest: HourlyPrice | null;
  priciest: HourlyPrice | null;
} {
  if (prices.length === 0) {
    return { cheapest: null, priciest: null };
  }

  let cheapest = prices[0];
  let priciest = prices[0];

  for (const p of prices) {
    if (p.price < cheapest.price) cheapest = p;
    if (p.price > priciest.price) priciest = p;
  }

  return { cheapest, priciest };
}
