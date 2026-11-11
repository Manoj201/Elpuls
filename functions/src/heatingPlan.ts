import type { PriceHour } from './priceUtils';

type TimeBlockId = 'night' | 'morningPeak' | 'daytime' | 'eveningPeak';
type TimeBlockLabel = 'cheap' | 'normal' | 'expensive' | 'avoid';

const TIME_BLOCKS: { id: TimeBlockId; startHour: number; endHour: number }[] = [
  { id: 'night', startHour: 0, endHour: 6 },
  { id: 'morningPeak', startHour: 6, endHour: 9 },
  { id: 'daytime', startHour: 9, endHour: 16 },
  { id: 'eveningPeak', startHour: 17, endHour: 20 },
];

const stockholmHourFormatter = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Stockholm', hour: 'numeric', hourCycle: 'h23' });

function stockholmHourOf(iso: string): number {
  return Number(stockholmHourFormatter.format(new Date(iso)));
}

function labelForBlock(blockAvg: number, dayAvg: number): TimeBlockLabel {
  if (dayAvg <= 0) return 'normal';
  const ratio = blockAvg / dayAvg;
  if (ratio <= 0.6) return 'cheap';
  if (ratio <= 1.1) return 'normal';
  if (ratio <= 1.5) return 'expensive';
  return 'avoid';
}

export interface HeatingPlan {
  bankStartHour: number;
  bankEndHour: number;
  coastStartHour: number;
  coastEndHour: number;
}

/**
 * Server-side duplicate of src/lib/timeBlocks.ts + src/lib/heatingPlan.ts,
 * combined into one file since this is the only server-side consumer of
 * time-block logic — same dual-copy precedent as priceRisk.ts/weatherPrep.ts.
 * `morningPeak` is the bank-heat window, `eveningPeak` the coast window;
 * returns null unless the evening block is genuinely pricier than normal.
 */
export function findHeatingPlan(hours: PriceHour[]): HeatingPlan | null {
  const dayAvg = hours.length > 0 ? hours.reduce((sum, h) => sum + h.price, 0) / hours.length : 0;

  const blockAverage = (block: (typeof TIME_BLOCKS)[number]): number | null => {
    const inBlock = hours.filter((h) => {
      const hour = stockholmHourOf(h.hour);
      return hour >= block.startHour && hour < block.endHour;
    });
    return inBlock.length > 0 ? inBlock.reduce((sum, h) => sum + h.price, 0) / inBlock.length : null;
  };

  const morning = TIME_BLOCKS.find((b) => b.id === 'morningPeak')!;
  const evening = TIME_BLOCKS.find((b) => b.id === 'eveningPeak')!;
  const eveningAvg = blockAverage(evening);

  if (eveningAvg === null) return null;
  const eveningLabel = labelForBlock(eveningAvg, dayAvg);
  if (eveningLabel !== 'expensive' && eveningLabel !== 'avoid') return null;

  return {
    bankStartHour: morning.startHour,
    bankEndHour: morning.endHour,
    coastStartHour: evening.startHour,
    coastEndHour: evening.endHour,
  };
}
