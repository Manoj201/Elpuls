export interface PriceHour {
  hour: string; // ISO string, as stored in the prices/{SE-ZONE-dateKey} doc
  price: number;
}

export interface CheapestWindow {
  start: PriceHour;
  averagePrice: number;
}

/**
 * Server-side duplicate of src/lib/priceUtils.ts's findCheapestWindow,
 * adapted for the Firestore prices doc shape (ISO-string hours, not Date
 * objects). Intentionally not shared code — client and Cloud Functions live
 * in separate TS projects/module systems, same pattern already used for
 * price-risk and weather.
 */
// No `after` cutoff param here (unlike the client version) — this is only
// ever called with one full day's worth of just-published future prices
// (fetchPrices.ts only fetches tomorrow), so there's nothing elapsed to
// filter out.
export function findCheapestWindow(hourlyPrices: PriceHour[], durationHours: number): CheapestWindow | null {
  const sorted = [...hourlyPrices].sort((a, b) => new Date(a.hour).getTime() - new Date(b.hour).getTime());

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

export function findExtremeHours(hours: PriceHour[]): { cheapest: PriceHour | null; priciest: PriceHour | null } {
  if (hours.length === 0) {
    return { cheapest: null, priciest: null };
  }

  let cheapest = hours[0];
  let priciest = hours[0];

  for (const h of hours) {
    if (h.price < cheapest.price) cheapest = h;
    if (h.price > priciest.price) priciest = h;
  }

  return { cheapest, priciest };
}
