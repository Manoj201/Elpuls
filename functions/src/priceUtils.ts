export interface PriceHour {
  hour: string; // ISO string, as stored in the prices/{SE-ZONE-dateKey} doc
  price: number;
}

export interface CheapestWindow {
  start: PriceHour;
  /** End of the window (exclusive): start + duration. */
  end: Date;
  averagePrice: number;
}

/** Length of one price slot in minutes, read from the data (15 since Oct 2025). */
export function slotMinutes(hours: PriceHour[]): number {
  for (let i = 1; i < hours.length; i++) {
    const diff = (new Date(hours[i].hour).getTime() - new Date(hours[i - 1].hour).getTime()) / 60000;
    if (diff > 0) return diff;
  }
  return 60;
}

/**
 * Server copy of src/lib/priceUtils.ts's findCheapestWindow (client and
 * Cloud Functions are separate TS projects, same dual-copy pattern as
 * priceRisk/weatherPrep). Keep both in sync.
 *
 * Works on the real 15-minute prices: the duration is converted to slots
 * (1.5 h = 6 slots), so a window can start on any quarter-hour. The old
 * version counted the duration in rows, which turned 1.5 h into 30 minutes.
 * Windows spanning a gap in the data are skipped; `notBefore` drops slots
 * that have already ended.
 */
export function findCheapestWindow(
  hours: PriceHour[],
  durationHours: number,
  notBefore: Date = new Date(0),
): CheapestWindow | null {
  const sorted = [...hours].sort((a, b) => new Date(a.hour).getTime() - new Date(b.hour).getTime());
  const slot = slotMinutes(sorted);
  const upcoming = sorted.filter((p) => new Date(p.hour).getTime() + slot * 60000 > notBefore.getTime());

  const windowSize = Math.max(1, Math.round((durationHours * 60) / slot));
  if (upcoming.length < windowSize) {
    return null;
  }

  let best: CheapestWindow | null = null;

  for (let i = 0; i + windowSize <= upcoming.length; i++) {
    const firstMs = new Date(upcoming[i].hour).getTime();
    const lastMs = new Date(upcoming[i + windowSize - 1].hour).getTime();
    if (lastMs - firstMs !== (windowSize - 1) * slot * 60000) continue;

    let total = 0;
    for (let j = i; j < i + windowSize; j++) total += upcoming[j].price;
    const averagePrice = total / windowSize;

    if (!best || averagePrice < best.averagePrice) {
      best = { start: upcoming[i], end: new Date(lastMs + slot * 60000), averagePrice };
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
