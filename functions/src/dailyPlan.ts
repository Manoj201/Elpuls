import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';
import { findCheapestWindow, type PriceHour } from './priceUtils';
import { APPLIANCE_PRESETS } from './appliances';
import { findHeatingPlan } from './heatingPlan';
import { assessPriceRisk, type WeatherHour } from './priceRisk';
import { CLAUDE_MODEL, logStopReason } from './claudeModel';

/**
 * "Din plan" (Pro, Release 1.2 section G): one plan per zone and day, shared
 * by every user in the zone (no per-user AI calls). The app shows only the
 * rows that fit the user's household.
 *
 * Accuracy rule (CLAUDE.md §11): every time here is calculated, never written
 * by the AI. The AI only gets the finished windows and writes two short
 * sentences about the day, in Swedish and English.
 */

const REPORT_TOOL_NAME = 'report_daily_plan';
/** Same rule as the app's price bands (src/lib/priceBands.ts): ≥ 115 % of the day average is dear. */
const DEAR_RATIO = 1.15;
/** Laundry and drying that aren't night-friendly stay within these hours. */
/** Below this spread ((max − min) / average) the day is flat: timing barely matters. */
const FLAT_DAY_SPREAD = 0.25;
const HEAT_BANK_HOURS = 3;
const HEAT_LOOKBACK_HOURS = 8;
const VAT = 1.25;
/** Daytime suggestions: from here until the evening peak, like the daytime pushes. */
const DAY_START_HOUR = 7;
const EVENING_PEAK_START_HOUR = 17;
const EVENING_PEAK_END_HOUR = 20;
/** A daytime suggestion must save at least this much (kr incl. VAT) for a preset run, like the pushes. */
const DAY_MIN_KR = 2;
/** "Tonight" = 21:00 until 06:00, when the next electricity day starts (same as the 19:00 push). */
const NIGHT_FROM_HOUR = 21;
const NIGHT_TO_HOUR = 6;
/** Heat up only when that time costs at most 85 % of the evening (and of the avoid stretch). */
const HEAT_BANK_MAX_RATIO = 0.85;

export type PlanActivity = 'washing_machine' | 'dishwasher' | 'dryer' | 'ev' | 'pool_heater' | 'heatBank' | 'heatCoast' | 'avoid';

export interface PlanWindow {
  activity: PlanActivity;
  /** ISO start/end (end exclusive). */
  start: string;
  end: string;
  /** Average spot price in SEK/kWh excl. VAT. */
  averagePrice: number;
}

const stockholmParts = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Stockholm',
  hour: 'numeric',
  minute: 'numeric',
  hourCycle: 'h23',
});

function localHour(iso: string): number {
  const parts = Object.fromEntries(stockholmParts.formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
  return Number(parts.hour);
}

export function localClock(iso: string): string {
  const parts = Object.fromEntries(stockholmParts.formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
  return `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
}

function slotMs(hours: PriceHour[]): number {
  if (hours.length < 2) return 3600000;
  return new Date(hours[1].hour).getTime() - new Date(hours[0].hour).getTime();
}

/** ISO time of the slot that starts at `hour` local time, or null. */
function boundaryOf(hours: PriceHour[], hour: number): string | null {
  const slot = hours.find((h) => localHour(h.hour) === hour && new Date(h.hour).getMinutes() === 0);
  return slot ? slot.hour : null;
}

/** True when prices hardly move over the day, so when you run things barely matters. */
export function isFlatDay(hours: PriceHour[]): boolean {
  if (hours.length === 0) return true;
  const prices = hours.map((h) => h.price);
  const avg = prices.reduce((s, p) => s + p, 0) / prices.length;
  if (avg <= 0) return false;
  return (Math.max(...prices) - Math.min(...prices)) / avg < FLAT_DAY_SPREAD;
}

function averageOf(hours: PriceHour[]): number | null {
  return hours.length ? hours.reduce((s, h) => s + h.price, 0) / hours.length : null;
}

type ApplianceGroup = { activities: PlanActivity[]; hours: number; kwh: number };

/** A preset's run: duration and energy. The washer + dryer share one window (both together), like the pushes. */
function group(ids: PlanActivity[]): ApplianceGroup | null {
  const presets = ids.map((id) => APPLIANCE_PRESETS.find((p) => p.id === id));
  if (presets.some((p) => !p || !p.shiftable)) return null;
  return {
    activities: ids,
    hours: presets.reduce((s, p) => s + (p?.typicalDurationHours ?? 0), 0),
    kwh: presets.reduce((s, p) => s + ((p?.watts ?? 0) / 1000) * (p?.typicalDurationHours ?? 0), 0),
  };
}

const DAY_GROUPS = [group(['washing_machine', 'dryer']), group(['pool_heater'])].filter((g): g is ApplianceGroup => g !== null);
const NIGHT_GROUPS = [group(['washing_machine', 'dryer']), group(['dishwasher']), group(['ev']), group(['pool_heater'])].filter(
  (g): g is ApplianceGroup => g !== null,
);

/**
 * Night part of day D's plan: each night appliance's cheapest window between
 * 21:00 on D and 06:00 on D+1 (needs D+1's prices, so it's added when they
 * arrive, about 13:00 on D). Same rule as the 19:00 push. Kept only when it's
 * cheaper than D's evening (17-20); otherwise timing barely matters tonight.
 * Exported for tests.
 */
export function buildNightWindows(dayHours: PriceHour[], nextHours: PriceHour[]): PlanWindow[] {
  const night = [
    ...dayHours.filter((h) => localHour(h.hour) >= NIGHT_FROM_HOUR),
    ...nextHours.filter((h) => localHour(h.hour) < NIGHT_TO_HOUR),
  ].sort((a, b) => new Date(a.hour).getTime() - new Date(b.hour).getTime());
  const evening = averageOf(dayHours.filter((h) => {
    const hour = localHour(h.hour);
    return hour >= EVENING_PEAK_START_HOUR && hour < EVENING_PEAK_END_HOUR;
  }));
  if (night.length === 0 || evening === null) return [];
  const windows: PlanWindow[] = [];
  for (const g of NIGHT_GROUPS) {
    const best = findCheapestWindow(night, g.hours, new Date(0));
    if (!best || best.averagePrice >= evening) continue;
    for (const activity of g.activities) {
      windows.push({ activity, start: best.start.hour, end: best.end.toISOString(), averagePrice: best.averagePrice });
    }
  }
  return windows;
}

/**
 * Adds the night part to day D's plan once D+1's prices are stored. Runs on
 * every fetchPrices pass; does nothing once the night part is there or when
 * D's plan doesn't exist yet. Returns true when it wrote the night part.
 */
export async function addNightPlan(
  db: Firestore,
  zone: string,
  dateKey: string,
  dayHours: PriceHour[],
  nextHours: PriceHour[],
): Promise<boolean> {
  const ref = db.collection('plans').doc(`SE-${zone}-${dateKey}`);
  const snap = await ref.get();
  const data = snap.data();
  if (!snap.exists || !data || data.status === 'pending' || data.nightReady === true) return false;
  const nightWindows = buildNightWindows(dayHours, nextHours);
  await ref.update({ nightWindows, nightReady: true, nightGeneratedAt: FieldValue.serverTimestamp() });
  logger.info(`Stored tonight's plan for ${zone} ${dateKey}: ${nightWindows.length} windows.`);
  return true;
}

/**
 * Day part of day D's plan, from D's prices (stored about 13:00 on D-1):
 * daytime appliance suggestions, the heating plan and the stretch to avoid.
 * The night part (21:00 on D → 06:00 on D+1) is added later by addNightPlan.
 * Exported for tests (and used by the heat-ahead push).
 */
export function buildPlanWindows(hours: PriceHour[]): PlanWindow[] {
  const sorted = [...hours].sort((a, b) => new Date(a.hour).getTime() - new Date(b.hour).getTime());
  if (sorted.length === 0) return [];
  const step = slotMs(sorted);
  const windows: PlanWindow[] = [];

  // Day part: the same daytime suggestions as the smart pushes
  // (smartPushes.ts): 07:00-17:00, only appliances people run while awake
  // (laundry with drying, pool), and only when it's worth it versus the
  // evening (>= DAY_MIN_KR for a preset run) and the day isn't flat. The
  // dishwasher and the car belong to the night part (buildNightWindows).
  const eveningAverage = averageOf(sorted.filter((h) => {
    const hour = localHour(h.hour);
    return hour >= EVENING_PEAK_START_HOUR && hour < EVENING_PEAK_END_HOUR;
  }));
  const daytime = sorted.filter((h) => {
    const hour = localHour(h.hour);
    return hour >= DAY_START_HOUR && hour < EVENING_PEAK_START_HOUR;
  });
  if (!isFlatDay(sorted) && eveningAverage !== null) {
    for (const group of DAY_GROUPS) {
      const best = findCheapestWindow(daytime, group.hours, new Date(0));
      if (!best) continue;
      const saving = group.kwh * (eveningAverage - best.averagePrice) * VAT;
      if (saving < DAY_MIN_KR) continue;
      for (const activity of group.activities) {
        windows.push({ activity, start: best.start.hour, end: best.end.toISOString(), averagePrice: best.averagePrice });
      }
    }
  }

  // Avoid: the continuous dear stretch around the day's most expensive slot.
  const avg = sorted.reduce((s, h) => s + h.price, 0) / sorted.length;
  let peak = 0;
  sorted.forEach((h, i) => {
    if (h.price > sorted[peak].price) peak = i;
  });
  let avoid: { startMs: number; endMs: number; average: number } | null = null;
  if (avg > 0 && sorted[peak].price >= avg * DEAR_RATIO) {
    let from = peak;
    let to = peak;
    while (from > 0 && sorted[from - 1].price >= avg * DEAR_RATIO) from--;
    while (to < sorted.length - 1 && sorted[to + 1].price >= avg * DEAR_RATIO) to++;
    const slice = sorted.slice(from, to + 1);
    const average = slice.reduce((s, h) => s + h.price, 0) / slice.length;
    const endMs = new Date(sorted[to].hour).getTime() + step;
    avoid = { startMs: new Date(sorted[from].hour).getTime(), endMs, average };
    windows.push({
      activity: 'avoid',
      start: sorted[from].hour,
      end: new Date(endMs).toISOString(),
      averagePrice: average,
    });
  }


  const heating = findHeatingPlan(sorted);
  if (heating) {
    const coastStart = boundaryOf(sorted, heating.coastStartHour);
    const coastEnd = boundaryOf(sorted, heating.coastEndHour);
    if (coastStart && coastEnd) {
      const coastStartMs = new Date(coastStart).getTime();
      const coast = sorted.filter((h) => {
        const t = new Date(h.hour).getTime();
        return t >= coastStartMs && t < new Date(coastEnd).getTime();
      });
      const coastAverage = coast.length ? coast.reduce((s, h) => s + h.price, 0) / coast.length : 0;
      // Never inside the "avoid" stretch (seen 2026-11-19: "heat the house
      // 12:15-15:15" inside "avoid 07:30-16:45"), and only when it's clearly
      // cheaper than both the evening it prepares for and the avoid stretch.
      // Otherwise there's no good moment to heat up: only "let it cool" remains.
      const beforeEvening = sorted.filter((h) => {
        const t = new Date(h.hour).getTime();
        const inAvoid = avoid !== null && t >= avoid.startMs && t < avoid.endMs;
        return t >= coastStartMs - HEAT_LOOKBACK_HOURS * 3600000 && t < coastStartMs && !inAvoid;
      });
      const bank = findCheapestWindow(beforeEvening, HEAT_BANK_HOURS);
      const clearlyCheaper =
        bank !== null &&
        bank.averagePrice <= coastAverage * HEAT_BANK_MAX_RATIO &&
        (avoid === null || bank.averagePrice <= avoid.average * HEAT_BANK_MAX_RATIO);
      if (bank && clearlyCheaper) {
        windows.push({ activity: 'heatBank', start: bank.start.hour, end: bank.end.toISOString(), averagePrice: bank.averagePrice });
      }
      windows.push({
        activity: 'heatCoast',
        start: coastStart,
        end: coastEnd,
        averagePrice: coastAverage,
      });
    }
  }

  return windows;
}

const PLAN_LABELS: Record<PlanActivity, string> = {
  washing_machine: 'laundry',
  dishwasher: 'dishes',
  dryer: 'tumble dryer',
  ev: 'charging an electric car',
  pool_heater: 'pool heating',
  heatBank: 'heat the house (electric heating / heat pump)',
  heatCoast: 'let the house cool a little',
  avoid: 'most expensive stretch, avoid using much power',
};

function buildPrompt(zone: string, dateKey: string, hours: PriceHour[], windows: PlanWindow[], factors: string[]): string {
  const prices = hours.map((h) => h.price * 100);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const avg = prices.reduce((s, p) => s + p, 0) / prices.length;
  const lines = windows.map(
    (w) => `- ${PLAN_LABELS[w.activity]}: ${localClock(w.start)}–${localClock(w.end)} (about ${Math.round(w.averagePrice * 100)} öre/kWh)`,
  );
  return [
    `You write the short summary for "Din plan", a daily electricity plan for households in Swedish price zone ${zone}, for ${dateKey}.`,
    `Spot prices that day: average ${Math.round(avg)} öre/kWh, lowest ${Math.round(min)}, highest ${Math.round(max)} (excl. VAT).`,
    `Weather factors: ${factors.length ? factors.join(', ') : 'none that clearly move the price'}.`,
    'The plan below was calculated from the prices. It is the only source of times:',
    ...lines,
    ...(isFlatDay(hours) ? ['Prices barely move this day, so say that timing matters little.'] : []),
    'Write at most 2 short sentences, plain text, no markdown, no emoji: why the day looks like this and the main thing to do or avoid.',
    // The plan is per zone, but the app shows each home only its own rows, so
    // a clock range built from appliance windows (e.g. a pool heater's) can
    // match nothing on the card (seen 2026-11-18: "02:30–06:15"). Cheap times
    // in words; only the shared "avoid" stretch may be given as a time.
    'Rules: describe when power is cheap in words only (at night, in the morning, at midday, in the afternoon, in the evening), never as clock times. The only clock times you may write are the "avoid" stretch, exactly as written above. Do not name specific appliances (the app lists them per household). No exclamation marks, no sales language.',
    'Report the same summary in Swedish (natural, everyday Swedish) and English using the tool.',
  ].join('\n');
}

/**
 * Builds and stores plans/SE-{zone}-{dateKey} once (idempotent via a
 * .create() marker, like generateExplainer). Called from fetchPrices right
 * after a day's prices are stored. A failed AI call still stores the
 * calculated windows, with no text, so the app always has a plan.
 */
export async function generateDailyPlan(
  db: Firestore,
  zone: string,
  dateKey: string,
  hours: PriceHour[],
): Promise<void> {
  const ref = db.collection('plans').doc(`SE-${zone}-${dateKey}`);
  try {
    await ref.create({ status: 'pending', createdAt: FieldValue.serverTimestamp() });
  } catch (err) {
    if ((err as { code?: number })?.code === 6 /* ALREADY_EXISTS */) return;
    throw err;
  }

  const windows = buildPlanWindows(hours);
  let textSv: string | null = null;
  let textEn: string | null = null;

  try {
    const weatherSnap = await db.collection('weather').doc(`SE-${zone}`).get();
    const weatherHours = (weatherSnap.data()?.hours ?? []) as WeatherHour[];
    const risk = assessPriceRisk(weatherHours, dateKey);

    // Lazy-loaded: see generateExplainer.ts (ESM dependency breaks function discovery if imported eagerly).
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const message = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      // Thinking on (auto tool choice): clearly more natural Swedish than a forced call,
      // which skips thinking on Haiku 5.5. Thinking counts toward max_tokens.
      max_tokens: 4000,
      output_config: { effort: 'medium' },
      system: `Answer only by calling the ${REPORT_TOOL_NAME} tool once, with both text_sv and text_en filled in.`,
      tool_choice: { type: 'auto' },
      tools: [
        {
          name: REPORT_TOOL_NAME,
          strict: true,
          description: 'Report the plan summary in Swedish and English.',
          input_schema: {
            type: 'object',
            properties: {
              text_sv: { type: 'string', description: 'At most 2 short sentences in Swedish, plain text.' },
              text_en: { type: 'string', description: 'The same summary in English, at most 2 short sentences, plain text.' },
            },
            required: ['text_sv', 'text_en'],
            additionalProperties: false,
          },
        },
      ],
      messages: [{ role: 'user', content: buildPrompt(zone, dateKey, hours, windows, risk?.factors ?? []) }],
    });
    logStopReason(message, 'daily plan text');
    const toolUse = message.content.find((block) => block.type === 'tool_use');
    if (toolUse && toolUse.type === 'tool_use') {
      const input = toolUse.input as { text_sv?: unknown; text_en?: unknown };
      textSv = typeof input.text_sv === 'string' && input.text_sv.trim() ? input.text_sv.trim().slice(0, 400) : null;
      textEn = typeof input.text_en === 'string' && input.text_en.trim() ? input.text_en.trim().slice(0, 400) : null;
    }
  } catch (err) {
    logger.error(`Daily plan text failed for ${zone} ${dateKey}: ${err}`);
  }

  await ref.set({
    zone,
    date: dateKey,
    windows,
    // Night part (21:00 → 06:00) comes when the next day's prices arrive.
    nightWindows: [],
    nightReady: false,
    flatDay: isFlatDay(hours),
    text_sv: textSv,
    text_en: textEn,
    generatedAt: FieldValue.serverTimestamp(),
  });
  logger.info(`Stored daily plan for ${zone} ${dateKey}: ${windows.length} windows, text ${textSv ? 'yes' : 'no'}.`);
}
