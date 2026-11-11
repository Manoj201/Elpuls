import type { HourlyPrice } from '../providers/types';
import { summarizeTimeBlocks } from './timeBlocks';

export interface HeatingPlan {
  bankStartHour: number;
  bankEndHour: number;
  coastStartHour: number;
  coastEndHour: number;
}

/**
 * Reuses the Prognos screen's existing time-block summary rather than a new
 * window-finding algorithm — `morningPeak` (06-09) is the bank-heat window,
 * `eveningPeak` (17-20) is the coast-through-the-peak window, which already
 * match CLAUDE.md §3's example times closely. Returns null ("nothing to
 * advise today") unless the evening block is genuinely pricier than normal
 * — no point suggesting a plan on a flat-price day.
 */
export function findHeatingPlan(hourlyPrices: HourlyPrice[]): HeatingPlan | null {
  const blocks = summarizeTimeBlocks(hourlyPrices);
  const morning = blocks.find((b) => b.id === 'morningPeak');
  const evening = blocks.find((b) => b.id === 'eveningPeak');

  if (!morning || !evening) return null;
  if (evening.label !== 'expensive' && evening.label !== 'avoid') return null;

  return {
    bankStartHour: morning.startHour,
    bankEndHour: morning.endHour,
    coastStartHour: evening.startHour,
    coastEndHour: evening.endHour,
  };
}
