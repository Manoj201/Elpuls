import type { PriceProvider } from '../providers/types';

export interface ZoneComparison {
  yourZone: string;
  yourAvgPrice: number;
  otherZone: string;
  otherAvgPrice: number;
  /** yourAvgPrice / otherAvgPrice — > 1 means your zone is pricier, < 1 means cheaper. */
  multiple: number;
  currency: string;
}

/**
 * Compares the user's zone to the cheapest other Swedish zone today — the
 * most compelling shareable stat ("SE3 is 3x pricier than SE1 today"). Only
 * fetches the *other* zones; the user's own average is already known by the
 * caller (HomeScreen has already computed it from data it fetched anyway).
 */
export async function compareToOtherZones(params: {
  priceProvider: PriceProvider;
  yourZone: string;
  yourAvgPrice: number;
  currency: string;
  allZones: string[];
  date: Date;
}): Promise<ZoneComparison | null> {
  const { priceProvider, yourZone, yourAvgPrice, currency, allZones, date } = params;
  const otherZoneIds = allZones.filter((z) => z !== yourZone);

  const otherAverages = await Promise.all(
    otherZoneIds.map(async (zone) => {
      const prices = await priceProvider.getPrices(zone, date);
      if (prices.length === 0) return null;
      const avg = prices.reduce((sum, p) => sum + p.price, 0) / prices.length;
      return { zone, avg };
    }),
  );

  const valid = otherAverages.filter((v): v is { zone: string; avg: number } => v !== null);
  if (valid.length === 0) return null;

  const cheapest = valid.reduce((min, v) => (v.avg < min.avg ? v : min), valid[0]);

  return {
    yourZone,
    yourAvgPrice,
    otherZone: cheapest.zone,
    otherAvgPrice: cheapest.avg,
    multiple: cheapest.avg > 0 ? yourAvgPrice / cheapest.avg : 0,
    currency,
  };
}

export interface ZoneAverage {
  zone: string;
  avgPrice: number;
  currency: string;
}

/**
 * Every zone's average price for the day (Statistik screen's zone table) —
 * unlike compareToOtherZones, which reduces to just the single cheapest
 * other zone for a shareable headline, this keeps all of them.
 */
export async function compareAllZones(params: {
  priceProvider: PriceProvider;
  allZones: string[];
  date: Date;
}): Promise<ZoneAverage[]> {
  const { priceProvider, allZones, date } = params;

  const averages = await Promise.all(
    allZones.map(async (zone) => {
      const prices = await priceProvider.getPrices(zone, date);
      if (prices.length === 0) return null;
      const avgPrice = prices.reduce((sum, p) => sum + p.price, 0) / prices.length;
      return { zone, avgPrice, currency: prices[0].currency };
    }),
  );

  return averages.filter((v): v is ZoneAverage => v !== null);
}
