import type { HourlyPrice, PriceProvider } from '../types';

const SWEDISH_ZONES = ['SE1', 'SE2', 'SE3', 'SE4'] as const;
export type SwedishZone = (typeof SWEDISH_ZONES)[number];

interface ElprisetJustNuEntry {
  SEK_per_kWh: number;
  EUR_per_kWh: number;
  EXR: number;
  time_start: string;
  time_end: string;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function buildUrl(zone: string, date: Date): string {
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  return `https://www.elprisetjustnu.se/api/v1/prices/${year}/${month}-${day}_${zone}.json`;
}

/**
 * PriceProvider for Sweden, backed by elprisetjustnu.se (no API key required).
 * Prices are published in 15-minute intervals; each entry's `hour` is the
 * interval's start time. Tomorrow's prices typically publish ~13:00 CET.
 */
export const elprisetjustnuProvider: PriceProvider = {
  async getPrices(zone: string, date: Date): Promise<HourlyPrice[]> {
    if (!SWEDISH_ZONES.includes(zone as SwedishZone)) {
      throw new Error(`Unknown Swedish price zone: ${zone}`);
    }

    const response = await fetch(buildUrl(zone, date));

    if (response.status === 404) {
      // Prices for this date aren't published yet.
      return [];
    }

    if (!response.ok) {
      throw new Error(
        `elprisetjustnu.se request failed: ${response.status} ${response.statusText}`,
      );
    }

    const entries: ElprisetJustNuEntry[] = await response.json();

    return entries.map((entry) => ({
      hour: new Date(entry.time_start),
      price: entry.SEK_per_kWh,
      currency: 'SEK',
    }));
  },
};
