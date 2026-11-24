import { onSchedule } from 'firebase-functions/v2/scheduler';
import { FieldValue, getFirestore, type Firestore } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';
import { addDays, loadHistory, RateLimitedError, updateHistory, type History } from './priceHistory';
import { CLAUDE_MODEL, logStopReason } from './claudeModel';

/** Past days stored on each outlook doc for the app's chart ("Månad" view). */
const RECENT_HISTORY_DAYS = 30;
/** Our own earlier forecast for a past day: preferably the one made 3 days before. */
const PAST_FORECAST_AHEAD = [3, 2, 4, 5, 6, 7];
/** Months of monthly averages for the "År" view and "Same time in past years". */
const MONTH_HISTORY = 36;

/**
 * 7-day and seasonal price outlook (Pro, Release 1.2 section H).
 *
 * Calculated, not guessed by AI (CLAUDE.md §11). Per zone and day-ahead k
 * (2–7) a linear model learns from the stored history how the day's average
 * price follows from: tomorrow's known price, the last 7 days' level,
 * weekday, and how temperature and wind change (observed in history, SMHI
 * forecast for the coming days). A backtest on the most recent year sets the
 * zone's public hit rate; the card only shows when days 2–5 reach
 * MIN_HIT_RATE. The AI only writes one sentence from the finished numbers.
 *
 * A prototype of this method on SE3 (trained to Nov 2025, tested Nov 2025 –
 * Oct 2026) got the direction right 76 % of the time 2 days ahead, 70 % at
 * 5 days and 62 % at 7, against 9–15 % for "same as today".
 */

const SWEDISH_ZONES = ['SE1', 'SE2', 'SE3', 'SE4'];
const HORIZONS = [2, 3, 4, 5, 6, 7];
/** Days 6–7 are shown as "uncertain". */
const UNCERTAIN_FROM = 6;
/** Direction thresholds vs today's average: ±10 %. */
const SAME_BAND = 0.1;
/** Minimum direction hit rate (days 2–5, last year) to show the card in a zone. */
const MIN_HIT_RATE = 0.65;
/** Need this many days of history before building a model. */
const MIN_HISTORY_DAYS = 500;
/**
 * Range = 7.5th–92.5th percentile of the model's errors, which held on about
 * 4 days in 5 in the backtest (10–90 % held too rarely, 5–95 % was wider than needed).
 */
const RANGE_LOW_Q = 0.075;
const RANGE_HIGH_Q = 0.925;
const REPORT_TOOL_NAME = 'report_outlook';

const stockholmDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Stockholm' });

type Direction = 'cheaper' | 'same' | 'dearer';

export interface OutlookDay {
  date: string;
  horizon: number;
  direction: Direction;
  /** SEK/kWh excl. VAT, daily average. */
  mid: number;
  low: number;
  high: number;
  uncertain: boolean;
}

export interface SeasonalMonth {
  /** YYYY-MM of the coming month. */
  month: string;
  /** Usual change vs the current month, e.g. 0.3 = about 30 % dearer. */
  change: number;
  /** How many past years the figure is based on. */
  years: number;
}

// ---------- maths ----------

function lstsq(X: number[][], y: number[]): number[] {
  const m = X[0].length;
  const A = Array.from({ length: m }, (_, i) =>
    Array.from({ length: m }, (_, j) => X.reduce((s, r) => s + r[i] * r[j], 0) + (i === j ? 1e-6 : 0)),
  );
  const b = Array.from({ length: m }, (_, i) => X.reduce((s, r, k) => s + r[i] * y[k], 0));
  for (let c = 0; c < m; c++) {
    let piv = c;
    for (let r = c + 1; r < m; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    [A[c], A[piv]] = [A[piv], A[c]];
    [b[c], b[piv]] = [b[piv], b[c]];
    for (let r = 0; r < m; r++) {
      if (r === c || A[c][c] === 0) continue;
      const f = A[r][c] / A[c][c];
      for (let j = 0; j < m; j++) A[r][j] -= f * A[c][j];
      b[r] -= f * b[c];
    }
  }
  return b.map((v, i) => (A[i][i] === 0 ? 0 : v / A[i][i]));
}

const dot = (a: number[], b: number[]) => a.reduce((s, v, i) => s + v * b[i], 0);

function quantile(values: number[], q: number): number {
  const v = [...values].sort((a, b) => a - b);
  return v[Math.min(v.length - 1, Math.max(0, Math.round(q * (v.length - 1))))];
}

function direction(value: number, reference: number): Direction {
  if (reference <= 0.05) return Math.abs(value - reference) < 0.05 ? 'same' : value < reference ? 'cheaper' : 'dearer';
  if (value < reference * (1 - SAME_BAND)) return 'cheaper';
  if (value > reference * (1 + SAME_BAND)) return 'dearer';
  return 'same';
}

/** Monday = 0 … Sunday = 6. */
function weekday(dateKey: string): number {
  return (new Date(`${dateKey}T12:00:00Z`).getUTCDay() + 6) % 7;
}

// ---------- features ----------

interface Series {
  price: (d: string) => number | undefined;
  temp: (d: string) => number | undefined;
  wind: (d: string) => number | undefined;
}

/**
 * Features for target day = origin + k. Prices are known through origin + 1
 * (tomorrow is published), weather for every day used. Same as the prototype.
 */
function features(s: Series, origin: string, k: number): number[] | null {
  const known = [-5, -4, -3, -2, -1, 0, 1].map((i) => addDays(origin, i));
  const target = addDays(origin, k);
  const prices = known.map(s.price);
  if (prices.some((p) => p === undefined)) return null;
  const temps = [...known, target].map(s.temp);
  const winds = [...known, target].map(s.wind);
  if (temps.some((v) => v === undefined) || winds.some((v) => v === undefined)) return null;

  const level = (prices as number[]).reduce((a, b) => a + b, 0) / prices.length;
  const last = prices[prices.length - 1] as number;
  const tKnown = (temps.slice(0, 7) as number[]).reduce((a, b) => a + b, 0) / 7;
  const wKnown = (winds.slice(0, 7) as number[]).reduce((a, b) => a + b, 0) / 7;
  const tTarget = temps[7] as number;
  const wTarget = winds[7] as number;
  const wd = [0, 0, 0, 0, 0, 0];
  const day = weekday(target);
  if (day < 6) wd[day] = 1;
  return [1, last, level, ...wd, tTarget - tKnown, wTarget - wKnown, wTarget, tTarget];
}

interface FittedModel {
  beta: number[];
  lowError: number;
  highError: number;
}

function fit(samples: { x: number[]; y: number }[]): FittedModel | null {
  if (samples.length < 100) return null;
  const beta = lstsq(samples.map((s) => s.x), samples.map((s) => s.y));
  const errors = samples.map((s) => s.y - dot(beta, s.x));
  return { beta, lowError: quantile(errors, RANGE_LOW_Q), highError: quantile(errors, RANGE_HIGH_Q) };
}

function samplesFor(s: Series, k: number, origins: string[]): { origin: string; x: number[]; y: number; reference: number }[] {
  const out: { origin: string; x: number[]; y: number; reference: number }[] = [];
  for (const origin of origins) {
    const y = s.price(addDays(origin, k));
    const reference = s.price(origin);
    if (y === undefined || reference === undefined) continue;
    const x = features(s, origin, k);
    if (x) out.push({ origin, x, y, reference });
  }
  return out;
}

// ---------- outlook ----------

export interface ZoneOutlook {
  days: OutlookDay[];
  backtest: { hitRate: number; tested: number; coverage: number };
  show: boolean;
  seasonal: SeasonalMonth[];
}

/**
 * Builds the outlook for `today` from the history (observed, ≤ yesterday),
 * today's and tomorrow's published prices, and the SMHI forecast.
 */
export function buildOutlook(
  history: History,
  today: string,
  todayAvg: number,
  tomorrowAvg: number,
  forecast: { temp: Record<string, number>; wind: Record<string, number> },
): ZoneOutlook | null {
  // Count days that have a price: weather alone (the SMHI archive fills all
  // days at once) is not enough to learn from.
  const historyDays = Object.keys(history)
    .filter((d) => history[d]?.p !== undefined)
    .sort();
  if (historyDays.length < MIN_HISTORY_DAYS) return null;
  const lastObserved = historyDays[historyDays.length - 1];

  // History only (for training and the backtest).
  const observed: Series = {
    price: (d) => history[d]?.p,
    temp: (d) => history[d]?.t,
    wind: (d) => history[d]?.w,
  };
  // Live: history, plus today/tomorrow's published prices, plus the forecast where history ends.
  const live: Series = {
    price: (d) => (d === today ? todayAvg : d === addDays(today, 1) ? tomorrowAvg : history[d]?.p),
    temp: (d) => history[d]?.t ?? forecast.temp[d],
    wind: (d) => history[d]?.w ?? forecast.wind[d],
  };

  const origins = historyDays;
  const testFrom = addDays(lastObserved, -365);
  let hits = 0;
  let tested = 0;
  let covered = 0;
  let coverageN = 0;
  const days: OutlookDay[] = [];

  for (const k of HORIZONS) {
    const all = samplesFor(observed, k, origins);

    // Backtest: learn from data before the last year, test on the last year.
    const train = all.filter((s) => addDays(s.origin, k) < testFrom);
    const test = all.filter((s) => addDays(s.origin, k) >= testFrom);
    const backModel = fit(train);
    if (backModel) {
      for (const s of test) {
        const p = dot(backModel.beta, s.x);
        if (k < UNCERTAIN_FROM) {
          tested++;
          if (direction(p, s.reference) === direction(s.y, s.reference)) hits++;
        }
        coverageN++;
        if (s.y >= p + backModel.lowError && s.y <= p + backModel.highError) covered++;
      }
    }

    // Live forecast: learn from everything observed.
    const model = fit(all);
    const x = features(live, today, k);
    if (!model || !x) continue;
    const mid = dot(model.beta, x);
    days.push({
      date: addDays(today, k),
      horizon: k,
      direction: direction(mid, todayAvg),
      mid: round(mid),
      low: round(mid + model.lowError),
      high: round(mid + model.highError),
      uncertain: k >= UNCERTAIN_FROM,
    });
  }

  const hitRate = tested > 0 ? hits / tested : 0;
  return {
    days,
    backtest: { hitRate: round(hitRate), tested, coverage: round(coverageN ? covered / coverageN : 0) },
    show: tested >= 300 && hitRate >= MIN_HIT_RATE && days.length > 0,
    seasonal: seasonalOutlook(history, today),
  };
}

function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}

/** Usual change for the next three months vs the current month, from past years' monthly averages. */
export function seasonalOutlook(history: History, today: string): SeasonalMonth[] {
  const byMonth = new Map<string, number[]>(); // 'YYYY-MM' → daily prices
  for (const [d, v] of Object.entries(history)) {
    if (v.p === undefined) continue;
    const key = d.slice(0, 7);
    byMonth.set(key, [...(byMonth.get(key) ?? []), v.p]);
  }
  const monthAvg = (key: string) => {
    const list = byMonth.get(key);
    return list && list.length >= 20 ? list.reduce((a, b) => a + b, 0) / list.length : undefined;
  };

  const [year, month] = today.split('-').map(Number);
  const out: SeasonalMonth[] = [];
  for (let ahead = 1; ahead <= 3; ahead++) {
    const target = new Date(Date.UTC(year, month - 1 + ahead, 1));
    const targetMonth = target.getUTCMonth() + 1;
    // Pooled over the past years that have both months: total average of the
    // coming month vs total average of this month. Steadier than averaging
    // year-by-year ratios, where one very cheap month blows the figure up.
    const from: number[] = [];
    const to: number[] = [];
    for (let y = 2022; y < year + 1; y++) {
      const fromKey = `${y}-${String(month).padStart(2, '0')}`;
      const toYear = y + (targetMonth < month ? 1 : 0);
      const toKey = `${toYear}-${String(targetMonth).padStart(2, '0')}`;
      if (toKey >= today.slice(0, 7)) continue;
      const a = monthAvg(fromKey);
      const b = monthAvg(toKey);
      if (a !== undefined && b !== undefined) {
        from.push(a);
        to.push(b);
      }
    }
    const fromAvg = from.reduce((x, y) => x + y, 0) / (from.length || 1);
    const toAvg = to.reduce((x, y) => x + y, 0) / (to.length || 1);
    if (from.length >= 2 && fromAvg > 0.05) {
      out.push({
        month: `${target.getUTCFullYear()}-${String(targetMonth).padStart(2, '0')}`,
        change: round(toAvg / fromAvg - 1),
        years: from.length,
      });
    }
  }
  return out;
}

// ---------- AI sentence ----------

async function writeSummary(zone: string, outlook: ZoneOutlook): Promise<{ sv: string | null; en: string | null }> {
  const lines = outlook.days.map(
    (d) =>
      `- ${d.date} (${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][weekday(d.date)]}): ${d.direction} than today, about ${Math.round(d.low * 100)}–${Math.round(d.high * 100)} öre/kWh${d.uncertain ? ' (uncertain)' : ''}`,
  );
  const prompt = [
    `You write one short line for a 7-day electricity price outlook for households in Swedish price zone ${zone}.`,
    'The outlook below was calculated by a model from price history and the weather forecast. It is the only source of facts:',
    ...lines,
    'Write 1–2 short sentences, plain text, no markdown or emoji: the overall trend for the coming days and when it looks cheapest.',
    'Rules: only use days and directions from the list; no numbers or prices that are not in it; never promise, it is a forecast. No exclamation marks.',
    'Report it in Swedish (everyday Swedish) and English using the tool.',
  ].join('\n');
  try {
    // Lazy-loaded: see generateExplainer.ts.
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
          description: 'Report the outlook summary in Swedish and English.',
          input_schema: {
            type: 'object',
            properties: {
              text_sv: { type: 'string', description: '1–2 short sentences in Swedish, plain text.' },
              text_en: { type: 'string', description: 'The same in English, 1–2 short sentences, plain text.' },
            },
            required: ['text_sv', 'text_en'],
            additionalProperties: false,
          },
        },
      ],
      messages: [{ role: 'user', content: prompt }],
    });
    logStopReason(message, 'outlook text');
    const toolUse = message.content.find((b) => b.type === 'tool_use');
    if (!toolUse || toolUse.type !== 'tool_use') return { sv: null, en: null };
    const input = toolUse.input as { text_sv?: unknown; text_en?: unknown };
    const clean = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 300) : null);
    return { sv: clean(input.text_sv), en: clean(input.text_en) };
  } catch (err) {
    logger.error(`Outlook summary failed for ${zone}: ${err}`);
    return { sv: null, en: null };
  }
}

// ---------- scheduled job ----------

function dailyMeans(hours: { hour: string; tempC: number; windMs: number }[]) {
  const temp: Record<string, number[]> = {};
  const wind: Record<string, number[]> = {};
  for (const h of hours) {
    const d = stockholmDate.format(new Date(h.hour));
    (temp[d] ??= []).push(h.tempC);
    (wind[d] ??= []).push(h.windMs);
  }
  const mean = (r: Record<string, number[]>) =>
    Object.fromEntries(Object.entries(r).map(([d, v]) => [d, v.reduce((a, b) => a + b, 0) / v.length]));
  return { temp: mean(temp), wind: mean(wind) };
}

async function buildZone(db: Firestore, zone: string, today: string): Promise<void> {
  // Daily top-up of the newest days (up to 10, so a week-long outage is caught up in one run).
  let history: History;
  try {
    history = await updateHistory(db, zone, addDays(today, -1), 10);
  } catch (err) {
    if (!(err instanceof RateLimitedError)) throw err;
    history = await loadHistory(db, zone); // use what's stored; the newest days come next time
  }

  const [todaySnap, tomorrowSnap, weatherSnap] = await Promise.all([
    db.collection('prices').doc(`SE-${zone}-${today}`).get(),
    db.collection('prices').doc(`SE-${zone}-${addDays(today, 1)}`).get(),
    db.collection('weather').doc(`SE-${zone}`).get(),
  ]);
  const avg = (snap: FirebaseFirestore.DocumentSnapshot) => {
    const hours = (snap.data()?.hours ?? []) as { price: number }[];
    return hours.length ? hours.reduce((s, h) => s + h.price, 0) / hours.length : undefined;
  };
  const todayAvg = avg(todaySnap);
  const tomorrowAvg = avg(tomorrowSnap);
  if (todayAvg === undefined || tomorrowAvg === undefined) {
    logger.info(`Outlook ${zone}: today's or tomorrow's prices missing, skipped.`);
    return;
  }
  const forecast = dailyMeans((weatherSnap.data()?.hours ?? []) as { hour: string; tempC: number; windMs: number }[]);

  const outlook = buildOutlook(history, today, todayAvg, tomorrowAvg, forecast);
  const priceDays = Object.values(history).filter((v) => v.p !== undefined).length;
  if (!outlook || outlook.days.length === 0) {
    logger.info(`Outlook ${zone}: not enough price history yet (${priceDays} days with prices), nothing saved.`);
    // Remove an outlook saved earlier today from incomplete data, so the app shows "not ready" instead.
    await db.collection('outlooks').doc(`SE-${zone}-${today}`).delete();
    return;
  }
  const text = outlook.show ? await writeSummary(zone, outlook) : { sv: null, en: null };

  // The last 30 days' real averages, so the app's chart can show where prices
  // come from (week view uses the last 5, month view all of them).
  const recent = Array.from({ length: RECENT_HISTORY_DAYS }, (_, i) => RECENT_HISTORY_DAYS - i)
    .map((n) => addDays(today, -n))
    .filter((d) => history[d]?.p !== undefined)
    .map((d) => ({ date: d, avg: round(history[d].p as number) }));

  const pastForecasts = await loadPastForecasts(db, zone, recent.map((r) => r.date));
  const months = monthlyAverages(history, today);

  await db.collection('outlooks').doc(`SE-${zone}-${today}`).set({
    zone,
    date: today,
    todayAvg: round(todayAvg),
    tomorrowAvg: round(tomorrowAvg),
    recent,
    pastForecasts,
    months,
    ...outlook,
    text_sv: text.sv,
    text_en: text.en,
    generatedAt: FieldValue.serverTimestamp(),
  });
  logger.info(
    `Outlook ${zone}: hit rate ${Math.round(outlook.backtest.hitRate * 100)} % (${outlook.backtest.tested} tests), range coverage ${Math.round(outlook.backtest.coverage * 100)} %, show ${outlook.show}.`,
  );
}

export interface PastForecast {
  date: string;
  mid: number;
  low: number;
  high: number;
  /** How many days before the day the forecast was made. */
  ahead: number;
}

/**
 * What we forecast for each of `dates` earlier, read from our own saved
 * outlook docs (the one made 3 days before when it exists). Lets the app show
 * our track record next to the real prices: live forecasts only, never the
 * backtest (which used the real weather and looks better than live).
 */
export async function loadPastForecasts(db: Firestore, zone: string, dates: string[]): Promise<PastForecast[]> {
  if (dates.length === 0) return [];
  const made = new Set<string>();
  for (const d of dates) for (const k of PAST_FORECAST_AHEAD) made.add(addDays(d, -k));
  const refs = [...made].map((m) => db.collection('outlooks').doc(`SE-${zone}-${m}`));
  const snaps = await db.getAll(...refs);
  const byMade = new Map<string, { date: string; mid: number; low: number; high: number }[]>();
  for (const snap of snaps) {
    const data = snap.data();
    if (!snap.exists || !data || !Array.isArray(data.days)) continue;
    byMade.set(String(data.date), data.days);
  }
  return pastForecastsFrom(byMade, dates);
}

/** Pure part of loadPastForecasts: pick each date's forecast, preferring 3 days ahead. */
export function pastForecastsFrom(
  byMade: Map<string, { date: string; mid: number; low: number; high: number }[]>,
  dates: string[],
): PastForecast[] {
  const out: PastForecast[] = [];
  for (const d of dates) {
    for (const k of PAST_FORECAST_AHEAD) {
      const day = byMade.get(addDays(d, -k))?.find((x) => x.date === d);
      if (day && typeof day.mid === 'number') {
        out.push({ date: d, mid: round(day.mid), low: round(day.low), high: round(day.high), ahead: k });
        break;
      }
    }
  }
  return out;
}

export interface MonthAverage {
  /** 'YYYY-MM' */
  month: string;
  /** SEK/kWh excl. VAT, average of the month's daily averages. */
  avg: number;
  /** True for the current month (only the days so far). */
  partial: boolean;
}

/**
 * Monthly average spot price for the last MONTH_HISTORY months, oldest first.
 * Full months need ≥ 20 days of prices; the current month is included from 5
 * days on, marked partial.
 */
export function monthlyAverages(history: History, today: string): MonthAverage[] {
  const thisMonth = today.slice(0, 7);
  const byMonth = new Map<string, number[]>();
  for (const [d, v] of Object.entries(history)) {
    if (v.p === undefined || d >= today) continue;
    const key = d.slice(0, 7);
    const list = byMonth.get(key);
    if (list) list.push(v.p);
    else byMonth.set(key, [v.p]);
  }
  const [y, m] = thisMonth.split('-').map(Number);
  const out: MonthAverage[] = [];
  for (let i = MONTH_HISTORY - 1; i >= 0; i--) {
    const t = new Date(Date.UTC(y, m - 1 - i, 1));
    const key = `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}`;
    const list = byMonth.get(key) ?? [];
    const partial = key === thisMonth;
    if (list.length >= (partial ? 5 : 20)) {
      out.push({ month: key, avg: round(list.reduce((a, b) => a + b, 0) / list.length), partial });
    }
  }
  return out;
}

/**
 * Daily at 15:00 (after tomorrow's prices are stored, 12:00–14:50). Updates
 * each zone's history (the first runs backfill from Nov 2022) and writes
 * outlooks/SE-{zone}-{today}.
 */
export const buildPriceOutlooks = onSchedule(
  { schedule: '0 15 * * *', timeZone: 'Europe/Stockholm', secrets: ['ANTHROPIC_API_KEY'], timeoutSeconds: 540, memory: '1GiB' },
  async () => {
    const db = getFirestore();
    const today = stockholmDate.format(new Date());
    for (const zone of SWEDISH_ZONES) {
      try {
        await buildZone(db, zone, today);
      } catch (err) {
        logger.error(`Outlook ${zone} failed: ${err}`);
      }
    }
  },
);
