import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';
import { findCheapestWindow, type PriceHour } from './priceUtils';
import { APPLIANCE_PRESETS, NIGHT_FRIENDLY_PRESETS } from './appliances';
import { findHeatingPlan } from './heatingPlan';
import { assessPriceRisk, type WeatherHour } from './priceRisk';

/**
 * "Din plan" (Pro, Release 1.2 section G): one plan per zone and day, shared
 * by every user in the zone (no per-user AI calls). The app shows only the
 * rows that fit the user's household.
 *
 * Accuracy rule (CLAUDE.md §11): every time here is calculated, never written
 * by the AI. The AI only gets the finished windows and writes two short
 * sentences about the day, in Swedish and English.
 */

const CLAUDE_MODEL = 'claude-haiku-4-5-20251001';
const REPORT_TOOL_NAME = 'report_daily_plan';
/** Same rule as the app's price bands (src/lib/priceBands.ts): ≥ 115 % of the day average is dear. */
const DEAR_RATIO = 1.15;
/** Laundry and drying that aren't night-friendly stay within these hours. */
const AWAKE_START_HOUR = 7;
const AWAKE_END_HOUR = 22;
const PLAN_ACTIVITIES = ['washing_machine', 'dishwasher', 'dryer', 'ev', 'pool_heater'];
/** Below this spread ((max − min) / average) the day is flat: timing barely matters. */
const FLAT_DAY_SPREAD = 0.25;
const HEAT_BANK_HOURS = 3;
const HEAT_LOOKBACK_HOURS = 8;

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

/**
 * The day's windows, all calculated from the prices: the cheapest stretch per
 * appliance, the heating plan, and the stretch to avoid. Exported for tests.
 */
export function buildPlanWindows(hours: PriceHour[]): PlanWindow[] {
  const sorted = [...hours].sort((a, b) => new Date(a.hour).getTime() - new Date(b.hour).getTime());
  if (sorted.length === 0) return [];
  const step = slotMs(sorted);
  const windows: PlanWindow[] = [];

  const awake = sorted.filter((h) => {
    const hour = localHour(h.hour);
    return hour >= AWAKE_START_HOUR && hour < AWAKE_END_HOUR;
  });

  for (const id of PLAN_ACTIVITIES) {
    const preset = APPLIANCE_PRESETS.find((p) => p.id === id);
    if (!preset || !preset.shiftable) continue;
    const pool = NIGHT_FRIENDLY_PRESETS.has(id) ? sorted : awake;
    // The dryer goes after the laundry is washed, never at the same time.
    const washer = windows.find((w) => w.activity === 'washing_machine');
    const notBefore = id === 'dryer' && washer ? new Date(washer.end) : new Date(0);
    const best = findCheapestWindow(pool, preset.typicalDurationHours, notBefore);
    if (!best) continue;
    windows.push({
      activity: id as PlanActivity,
      start: best.start.hour,
      end: best.end.toISOString(),
      averagePrice: best.averagePrice,
    });
  }

  // Heating: only when the evening is clearly dear (findHeatingPlan's rule).
  // Heat up in the cheapest 3 hours of the 8 hours before the evening
  // stretch (not a fixed 06–09, which is often the morning peak), then let
  // the house drift through the evening.
  const heating = findHeatingPlan(sorted);
  if (heating) {
    const coastStart = boundaryOf(sorted, heating.coastStartHour);
    const coastEnd = boundaryOf(sorted, heating.coastEndHour);
    if (coastStart && coastEnd) {
      const coastStartMs = new Date(coastStart).getTime();
      const beforeEvening = sorted.filter((h) => {
        const t = new Date(h.hour).getTime();
        return t >= coastStartMs - HEAT_LOOKBACK_HOURS * 3600000 && t < coastStartMs;
      });
      const bank = findCheapestWindow(beforeEvening, HEAT_BANK_HOURS);
      if (bank) {
        windows.push({ activity: 'heatBank', start: bank.start.hour, end: bank.end.toISOString(), averagePrice: bank.averagePrice });
      }
      const coast = sorted.filter((h) => {
        const t = new Date(h.hour).getTime();
        return t >= coastStartMs && t < new Date(coastEnd).getTime();
      });
      windows.push({
        activity: 'heatCoast',
        start: coastStart,
        end: coastEnd,
        averagePrice: coast.length ? coast.reduce((s, h) => s + h.price, 0) / coast.length : 0,
      });
    }
  }

  // Avoid: the continuous dear stretch around the day's most expensive slot.
  const avg = sorted.reduce((s, h) => s + h.price, 0) / sorted.length;
  let peak = 0;
  sorted.forEach((h, i) => {
    if (h.price > sorted[peak].price) peak = i;
  });
  if (avg > 0 && sorted[peak].price >= avg * DEAR_RATIO) {
    let from = peak;
    let to = peak;
    while (from > 0 && sorted[from - 1].price >= avg * DEAR_RATIO) from--;
    while (to < sorted.length - 1 && sorted[to + 1].price >= avg * DEAR_RATIO) to++;
    const slice = sorted.slice(from, to + 1);
    windows.push({
      activity: 'avoid',
      start: sorted[from].hour,
      end: new Date(new Date(sorted[to].hour).getTime() + step).toISOString(),
      averagePrice: slice.reduce((s, h) => s + h.price, 0) / slice.length,
    });
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
    'Rules: only mention times that appear in the list above, exactly as written. Do not name specific appliances (the app lists them per household). No exclamation marks, no sales language.',
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
      max_tokens: 400,
      tool_choice: { type: 'tool', name: REPORT_TOOL_NAME },
      tools: [
        {
          name: REPORT_TOOL_NAME,
          description: 'Report the plan summary in Swedish and English.',
          input_schema: {
            type: 'object',
            properties: {
              text_sv: { type: 'string', description: 'At most 2 short sentences in Swedish, plain text.' },
              text_en: { type: 'string', description: 'The same summary in English, at most 2 short sentences, plain text.' },
            },
            required: ['text_sv', 'text_en'],
          },
        },
      ],
      messages: [{ role: 'user', content: buildPrompt(zone, dateKey, hours, windows, risk?.factors ?? []) }],
    });
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
    flatDay: isFlatDay(hours),
    text_sv: textSv,
    text_en: textEn,
    generatedAt: FieldValue.serverTimestamp(),
  });
  logger.info(`Stored daily plan for ${zone} ${dateKey}: ${windows.length} windows, text ${textSv ? 'yes' : 'no'}.`);
}
