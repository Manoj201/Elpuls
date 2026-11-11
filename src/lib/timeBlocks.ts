import type { HourlyPrice } from '../providers/types';

export type TimeBlockLabel = 'cheap' | 'normal' | 'expensive' | 'avoid';

export interface TimeBlockDefinition {
  id: 'night' | 'morningPeak' | 'daytime' | 'eveningPeak';
  startHour: number;
  /** Exclusive end hour. */
  endHour: number;
}

export const TIME_BLOCKS: TimeBlockDefinition[] = [
  { id: 'night', startHour: 0, endHour: 6 },
  { id: 'morningPeak', startHour: 6, endHour: 9 },
  { id: 'daytime', startHour: 9, endHour: 16 },
  { id: 'eveningPeak', startHour: 17, endHour: 20 },
];

export interface TimeBlockSummary {
  id: TimeBlockDefinition['id'];
  startHour: number;
  endHour: number;
  averagePrice: number | null;
  currency: string | null;
  label: TimeBlockLabel;
}

/**
 * Labels a block relative to the day's own average, not a fixed öre
 * threshold — a block's price can only really be judged against the rest
 * of that same day (same reasoning as PriceBar's tercile coloring).
 */
function labelForBlock(blockAvg: number, dayAvg: number): TimeBlockLabel {
  if (dayAvg <= 0) return 'normal';
  const ratio = blockAvg / dayAvg;
  if (ratio <= 0.6) return 'cheap';
  if (ratio <= 1.1) return 'normal';
  if (ratio <= 1.5) return 'expensive';
  return 'avoid';
}

/** Splits an hourly price array into the 4 fixed time-of-day blocks used by the Prognos screen. */
export function summarizeTimeBlocks(hourlyPrices: HourlyPrice[]): TimeBlockSummary[] {
  const dayAvg =
    hourlyPrices.length > 0 ? hourlyPrices.reduce((sum, p) => sum + p.price, 0) / hourlyPrices.length : 0;

  return TIME_BLOCKS.map((block) => {
    const inBlock = hourlyPrices.filter((p) => {
      const h = p.hour.getHours();
      return h >= block.startHour && h < block.endHour;
    });

    if (inBlock.length === 0) {
      return { id: block.id, startHour: block.startHour, endHour: block.endHour, averagePrice: null, currency: null, label: 'normal' };
    }

    const averagePrice = inBlock.reduce((sum, p) => sum + p.price, 0) / inBlock.length;

    return {
      id: block.id,
      startHour: block.startHour,
      endHour: block.endHour,
      averagePrice,
      currency: inBlock[0].currency,
      label: labelForBlock(averagePrice, dayAvg),
    };
  });
}
