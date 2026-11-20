import type { AppliancePreset } from '../config/appliances';
import type { HourlyPrice } from '../providers/types';
import { matchPresetId } from './applianceDisplay';
import { findCheapestWindow } from './priceUtils';

/**
 * "Best time from now": for each movable appliance in the household, the
 * cheapest window from the current quarter-hour until 06:00 the next morning
 * (or until the published prices end). Used by both the "Best times for your
 * appliances" card and Din plan's appliance rows, so they always agree, and
 * mirrored on the server (functions/src/liveBest.ts) for the morning push.
 *
 * Rules (same as the pushes): washer + dryer share one window, the dishwasher
 * only 21:00–06:00, appliances that aren't night-friendly only 07:00–22:00.
 * Savings: spot difference × VAT against running it right now (grid fee, tax
 * and markup are the same at every hour).
 */

export const DAY_END_HOUR = 6;
const VAT = 1.25;
/** Saving below this (kr) or below GOOD_NOW_SHARE of the cost now → "Good time now". */
const GOOD_NOW_KR = 1;
const GOOD_NOW_SHARE = 0.05;
const NIGHT_FRIENDLY = new Set(['ev', 'dishwasher', 'washing_machine', 'dryer', 'pool_heater']);
const AWAKE_START = 7;
const AWAKE_END = 22;
const NIGHT_FROM = 21;
/** Fixed order for groups that start at the same time (same order on the server). */
const RANK: Record<string, number> = { washing_machine: 0, dishwasher: 1, ev: 2, pool_heater: 3, sauna: 4 };
const rankOf = (kind: string) => RANK[kind] ?? 9;

export interface LiveGroup {
  /** Stable id (preset id, or "washing_machine+dryer"). */
  id: string;
  /** Preset kind for the icon ('washing_machine' for the washer + dryer pair). */
  kind: string;
  /** Appliances in the group (for labels). */
  members: AppliancePreset[];
  hours: number;
  kwh: number;
  nightOnly: boolean;
  awakeOnly: boolean;
}

export interface LiveRow {
  id: string;
  kind: string;
  members: AppliancePreset[];
  /** Null when the time isn't known yet (night-only appliance before tonight's prices). */
  start: Date | null;
  end: Date | null;
  /** kr incl. VAT vs. running it right now; null when unknown. */
  saving: number | null;
  /** The best time is now (or close enough): "Good time now". */
  goodNow: boolean;
  /** Tonight's time comes when tomorrow's prices are out (~13:00). */
  pendingNight: boolean;
}

export interface LiveResult {
  rows: LiveRow[];
  /** True while the prices don't reach 06:00 yet (before ~13:00): night times may still change. */
  nightPending: boolean;
}

function kindOf(a: AppliancePreset): string {
  return a.householdDefault || a.id === 'ev' ? a.id : matchPresetId(a.label) ?? a.id;
}

/** The household's movable appliances as groups (washer + dryer together, like the pushes). */
export function liveGroups(household: AppliancePreset[]): LiveGroup[] {
  const shiftable = household.filter((a) => a.shiftable);
  const washer = shiftable.find((a) => kindOf(a) === 'washing_machine');
  const dryer = shiftable.find((a) => kindOf(a) === 'dryer');
  const groups: LiveGroup[] = [];
  const make = (members: AppliancePreset[], id: string, kind: string): LiveGroup => ({
    id,
    kind,
    members,
    hours: members.reduce((s, a) => s + a.typicalDurationHours, 0),
    kwh: members.reduce((s, a) => s + (a.watts / 1000) * a.typicalDurationHours, 0),
    nightOnly: kind === 'dishwasher',
    awakeOnly: !NIGHT_FRIENDLY.has(kind),
  });
  if (washer && dryer) groups.push(make([washer, dryer], 'washing_machine+dryer', 'washing_machine'));
  for (const a of shiftable) {
    if (washer && dryer && (a === washer || a === dryer)) continue;
    groups.push(make([a], a.id, kindOf(a)));
  }
  return groups.sort((a, b) => rankOf(a.kind) - rankOf(b.kind));
}

function slotMs(sorted: HourlyPrice[]): number {
  for (let i = 1; i < sorted.length; i++) {
    const d = sorted[i].hour.getTime() - sorted[i - 1].hour.getTime();
    if (d > 0) return d;
  }
  return 15 * 60000;
}

/** 06:00 after `from` (today's 06:00 if it's still before then). */
export function nextDayEnd(from: Date): Date {
  const end = new Date(from);
  end.setHours(DAY_END_HOUR, 0, 0, 0);
  if (from.getTime() >= end.getTime()) end.setDate(end.getDate() + 1);
  return end;
}

/**
 * Best windows for `groups` between `from` and `until` (or the end of the
 * data), plus their saving vs. `nowPrice` when given. `from` is rounded down
 * to the start of its slot, so the current quarter-hour counts ("Now").
 */
function bestBetween(
  groups: LiveGroup[],
  prices: HourlyPrice[],
  from: Date,
  until: Date,
  nowPrice: number | null,
  nowMs: number | null,
): LiveResult {
  const sorted = [...prices].sort((a, b) => a.hour.getTime() - b.hour.getTime());
  if (sorted.length === 0) return { rows: [], nightPending: false };
  const step = slotMs(sorted);
  const dataEnd = sorted[sorted.length - 1].hour.getTime() + step;
  const nightPending = dataEnd < until.getTime();
  const end = Math.min(until.getTime(), dataEnd);
  const startMs = Math.floor(from.getTime() / step) * step;
  const inRange = sorted.filter((p) => p.hour.getTime() >= startMs && p.hour.getTime() + step <= end);
  const hourOf = (p: HourlyPrice) => p.hour.getHours();
  const allowed = (g: LiveGroup, list: HourlyPrice[]) =>
    g.nightOnly
      ? list.filter((p) => hourOf(p) >= NIGHT_FROM || hourOf(p) < DAY_END_HOUR)
      : g.awakeOnly
        ? list.filter((p) => hourOf(p) >= AWAKE_START && hourOf(p) < AWAKE_END)
        : list;
  // Only for "today" (from now): the fallback when a window can't finish by 06:00.
  const extendedPool =
    nowMs !== null && !nightPending
      ? (g: LiveGroup) => allowed(g, sorted.filter((p) => p.hour.getTime() >= startMs && p.hour.getTime() < until.getTime() + 24 * 3600000))
      : null;

  const rows: LiveRow[] = [];
  for (const g of groups) {
    const pool = allowed(g, inRange);
    // Night-only before tonight's prices: say when it comes, never guess from half a night.
    if (g.nightOnly && nightPending) {
      rows.push({ id: g.id, kind: g.kind, members: g.members, start: null, end: null, saving: null, goodNow: false, pendingNight: true });
      continue;
    }
    let best = findCheapestWindow(pool, g.hours, new Date(startMs));
    if (!best && extendedPool) {
      // Doesn't fit before 06:00 (e.g. the washer at 05:00): look into the new day's known prices.
      const ext = extendedPool(g);
      best = findCheapestWindow(ext, g.hours, new Date(startMs));
    }
    if (!best) {
      // Doesn't fit before the data ends (e.g. late evening before 13:00's prices): say when it comes.
      if (nightPending) {
        rows.push({ id: g.id, kind: g.kind, members: g.members, start: null, end: null, saving: null, goodNow: false, pendingNight: true });
      }
      continue;
    }
    const saving = nowPrice !== null ? g.kwh * (nowPrice - best.averagePrice) * VAT : null;
    const startsNow = nowMs !== null && best.start.hour.getTime() <= nowMs;
    const costNow = nowPrice !== null ? g.kwh * nowPrice * VAT : null;
    const smallGain =
      saving !== null && costNow !== null && (saving < GOOD_NOW_KR || (costNow > 0 && saving / costNow < GOOD_NOW_SHARE));
    // "Good time now": it's running now, or waiting saves next to nothing, but
    // only when now is an allowed time for it (never the dishwasher at 15:00).
    // The whole run must fit from now in the allowed hours (no dishwasher 05:15–07:15).
    const runSlots = Math.max(1, Math.round((g.hours * 3600000) / step));
    const nowAllowed = Array.from({ length: runSlots }, (_, i) => startMs + i * step).every((ms) => pool.some((p) => p.hour.getTime() === ms));
    const goodNow = nowMs !== null && (startsNow || (smallGain && nowAllowed));
    const start = goodNow ? new Date(startMs) : best.start.hour;
    rows.push({
      id: g.id,
      kind: g.kind,
      members: g.members,
      start,
      end: goodNow ? new Date(startMs + g.hours * 3600000) : best.end,
      saving: goodNow ? 0 : saving,
      goodNow,
      pendingNight: false,
    });
  }
  rows.sort((a, b) => {
    if (a.start === null) return b.start === null ? rankOf(a.kind) - rankOf(b.kind) : 1;
    if (b.start === null) return -1;
    return a.start.getTime() - b.start.getTime() || rankOf(a.kind) - rankOf(b.kind);
  });
  return { rows, nightPending };
}

/** Today: from now until 06:00 tomorrow (or as far as prices go). */
export function liveBestTimes(household: AppliancePreset[], prices: HourlyPrice[], now: Date): LiveResult {
  const sorted = [...prices].sort((a, b) => a.hour.getTime() - b.hour.getTime());
  const step = slotMs(sorted);
  const current = sorted.find((p) => p.hour.getTime() <= now.getTime() && now.getTime() < p.hour.getTime() + step);
  return bestBetween(liveGroups(household), sorted, now, nextDayEnd(now), current?.price ?? null, now.getTime());
}

/** Tomorrow (Din plan's "Tomorrow" tab): the whole next plan day, 06:00 → 06:00, no saving vs. now. */
export function tomorrowBestTimes(household: AppliancePreset[], prices: HourlyPrice[], now: Date): LiveResult {
  const from = nextDayEnd(now);
  const until = new Date(from);
  until.setDate(until.getDate() + 1);
  return bestBetween(liveGroups(household), prices, from, until, null, null);
}
