import type { AppliancePreset } from '../config/appliances';
import type { HourlyPrice } from '../providers/types';

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
  averagePrice: number;
}

/**
 * Slides a `durationHours`-long window over hourly buckets at/after `after`,
 * returning the window with the lowest average price. Used by the pre-use
 * cost check to answer "when's the next cheap window for this appliance?"
 * Pass in today's + tomorrow's hourly buckets combined so an evening check
 * can point at tomorrow morning, not just today's few remaining hours.
 */
export function findCheapestWindow(
  hourlyPrices: HourlyPrice[],
  durationHours: number,
  after: Date,
): CheapestWindow | null {
  const sorted = hourlyPrices
    .filter((p) => p.hour.getTime() >= after.getTime())
    .sort((a, b) => a.hour.getTime() - b.hour.getTime());

  const windowSize = Math.max(1, Math.round(durationHours));
  if (sorted.length < windowSize) {
    return null;
  }

  let best: CheapestWindow | null = null;

  for (let i = 0; i + windowSize <= sorted.length; i++) {
    const window = sorted.slice(i, i + windowSize);
    const averagePrice = window.reduce((sum, p) => sum + p.price, 0) / window.length;
    if (!best || averagePrice < best.averagePrice) {
      best = { start: window[0], averagePrice };
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

  const cheapestWindow = appliance.shiftable ? findCheapestWindow(hourlyPrices, appliance.typicalDurationHours, now) : null;
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
