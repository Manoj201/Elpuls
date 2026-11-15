import type { HourlyPrice } from '../providers/types';
import { makeBander, type PriceBand } from './priceBands';

export interface PricePeriod {
  start: Date;
  /** Exclusive end. */
  end: Date;
  band: PriceBand;
  averagePrice: number;
  hours: number;
}

/**
 * Splits one day into the stretches where the price is cheap, normal or
 * dear compared with that day's own average, using the same rule and words
 * as the price chart (makeBander). Unlike fixed clock blocks, the periods
 * always cover the whole day and follow the actual prices, so they answer
 * "when is it cheap today?" directly.
 *
 * A single hour that differs from the hours on both sides is absorbed into
 * them, so the list stays short and readable. The stretch holding the day's
 * dearest hour is marked as the peak.
 */
export function summarizePricePeriods(hourly: HourlyPrice[]): PricePeriod[] {
  if (hourly.length === 0) return [];
  const sorted = [...hourly].sort((a, b) => a.hour.getTime() - b.hour.getTime());
  const bandOf = makeBander(sorted);
  const rawBands = sorted.map(bandOf);
  // Group "dear" and "peak" together; the peak is marked afterwards.
  const groupBand = rawBands.map((b) => (b === 'peak' ? 'dear' : b));

  type Run = { from: number; to: number; band: PriceBand };
  const runs: Run[] = [];
  groupBand.forEach((band, i) => {
    const last = runs[runs.length - 1];
    if (last && last.band === band && last.to === i - 1) last.to = i;
    else runs.push({ from: i, to: i, band });
  });

  // Absorb one-hour blips that sit between two runs of the same band.
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 1; i < runs.length - 1; i++) {
      const blip = runs[i];
      if (blip.to === blip.from && runs[i - 1].band === runs[i + 1].band) {
        runs.splice(i - 1, 3, { from: runs[i - 1].from, to: runs[i + 1].to, band: runs[i - 1].band });
        changed = true;
        break;
      }
    }
  }

  const peakIndex = rawBands.indexOf('peak');

  return runs.map((run) => {
    const slice = sorted.slice(run.from, run.to + 1);
    const averagePrice = slice.reduce((s, p) => s + p.price, 0) / slice.length;
    const isPeak = run.band === 'dear' && peakIndex >= run.from && peakIndex <= run.to;
    return {
      start: sorted[run.from].hour,
      end: new Date(sorted[run.to].hour.getTime() + 3600000),
      band: isPeak ? 'peak' : run.band,
      averagePrice,
      hours: run.to - run.from + 1,
    };
  });
}

/** Time-of-day word for a period, from its middle: natt, morgon, förmiddag … */
export function partOfDay(start: Date, end: Date): 'night' | 'morning' | 'forenoon' | 'afternoon' | 'evening' | 'lateEvening' {
  const mid = (start.getHours() + (end.getHours() === 0 ? 24 : end.getHours())) / 2;
  if (mid < 5) return 'night';
  if (mid < 9) return 'morning';
  if (mid < 12) return 'forenoon';
  if (mid < 17) return 'afternoon';
  if (mid < 22) return 'evening';
  return 'lateEvening';
}
