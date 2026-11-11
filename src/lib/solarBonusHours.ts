import type { HourlyPrice } from '../providers/types';
import type { HourlySolarPotential } from './solarPotential';

export interface SolarBonusHour {
  hour: Date;
  price: number;
  currency: string;
  solarPotentialPct: number;
}

// Below this, even a day's "best" hours aren't meaningfully sunny (deep
// winter, heavy overcast) — not worth flagging as a bonus.
const MIN_MEANINGFUL_DAY_MAX_POTENTIAL = 15;

/**
 * Hours where solar potential is high (relative to that day's own best
 * hours, so this stays meaningful year-round rather than firing only in
 * summer) AND price is at or below the day's average.
 */
export function findSolarBonusHours(
  hourlyPrices: HourlyPrice[],
  solarPotential: HourlySolarPotential[],
): SolarBonusHour[] {
  if (hourlyPrices.length === 0 || solarPotential.length === 0) {
    return [];
  }

  const dayMaxPotential = solarPotential.reduce((max, s) => Math.max(max, s.potentialPct), 0);
  if (dayMaxPotential < MIN_MEANINGFUL_DAY_MAX_POTENTIAL) {
    return [];
  }

  const averagePrice = hourlyPrices.reduce((sum, p) => sum + p.price, 0) / hourlyPrices.length;
  const solarByHour = new Map(solarPotential.map((s) => [s.hour.getTime(), s.potentialPct]));

  const bonusHours: SolarBonusHour[] = [];
  for (const p of hourlyPrices) {
    const potentialPct = solarByHour.get(p.hour.getTime());
    if (potentialPct === undefined) continue;

    const highSolar = potentialPct >= 0.5 * dayMaxPotential;
    const lowPrice = p.price <= averagePrice;

    if (highSolar && lowPrice) {
      bonusHours.push({ hour: p.hour, price: p.price, currency: p.currency, solarPotentialPct: potentialPct });
    }
  }

  return bonusHours.sort((a, b) => a.hour.getTime() - b.hour.getTime());
}
