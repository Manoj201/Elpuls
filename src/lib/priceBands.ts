import { theme } from '../theme';

/**
 * Price bands for every chart, judged per calendar day against that day's
 * own average (what people mean by "cheap today"), not across today and
 * tomorrow together, where an expensive tomorrow made all of today look cheap.
 *
 *  - cheap:  ≤ 85% of the day's average
 *  - normal: in between
 *  - dear:   ≥ 115% of the day's average
 *  - peak:   dear and within the top 10% of the day's range
 *
 * Colour is never the only signal: charts show the band in words too
 * (legend, tap readout, summary, screen reader).
 */
export type PriceBand = 'cheap' | 'normal' | 'dear' | 'peak';

const CHEAP_RATIO = 0.85;
const DEAR_RATIO = 1.15;
const PEAK_SHARE_OF_RANGE = 0.1;

// "Normal" uses textMuted (#79708F, ~3.9:1 on the card), not neutralBar
// (#423B5E, 1.7:1), which failed the 3:1 non-text contrast check in the
// dataviz palette validator. Cheap→normal→dear→peak reads as a diverging
// scale: cool teal, neutral grey midpoint, warm amber, red only at the top.
export const BAND_COLOR: Record<PriceBand, string> = {
  cheap: theme.colors.positiveTeal,
  normal: theme.colors.textMuted,
  dear: theme.colors.accentAmber,
  peak: theme.colors.dangerEmber,
};

export const BAND_ORDER: PriceBand[] = ['cheap', 'normal', 'dear', 'peak'];

/** Highlight for the Pro "best times" windows: brand purple, so it never looks like a price band. */
export const HIGHLIGHT_COLOR = theme.colors.accentPurple;

interface DayStats {
  avg: number;
  min: number;
  max: number;
}

/**
 * Returns a function that gives the band for any price slot, using the
 * stats of that slot's own calendar day.
 */
export function makeBander(prices: { hour: Date; price: number }[]): (p: { hour: Date; price: number }) => PriceBand {
  const days = new Map<string, number[]>();
  for (const p of prices) {
    const key = p.hour.toDateString();
    days.set(key, [...(days.get(key) ?? []), p.price]);
  }
  const stats = new Map<string, DayStats>();
  for (const [key, list] of days) {
    stats.set(key, {
      avg: list.reduce((s, v) => s + v, 0) / list.length,
      min: Math.min(...list),
      max: Math.max(...list),
    });
  }

  return (p) => {
    const s = stats.get(p.hour.toDateString());
    if (!s) return 'normal';
    // Days with (near) zero or negative average: fall back to position in range.
    if (s.avg <= 0.01) {
      const range = s.max - s.min;
      if (range <= 0) return 'normal';
      const r = (p.price - s.min) / range;
      return r < 1 / 3 ? 'cheap' : r < 2 / 3 ? 'normal' : 'dear';
    }
    if (p.price <= s.avg * CHEAP_RATIO) return 'cheap';
    if (p.price >= s.avg * DEAR_RATIO) {
      return p.price >= s.max - (s.max - s.min) * PEAK_SHARE_OF_RANGE ? 'peak' : 'dear';
    }
    return 'normal';
  };
}

/** Start/end of a time range to shade on a chart (e.g. an appliance's best window). */
export interface ChartRange {
  start: Date;
  end: Date;
}

export function inRanges(start: Date, end: Date, ranges: ChartRange[]): boolean {
  return ranges.some((r) => start.getTime() < r.end.getTime() && end.getTime() > r.start.getTime());
}
