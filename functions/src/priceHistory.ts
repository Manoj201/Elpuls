import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';

/**
 * Daily price and weather history per zone, the data the 7-day outlook
 * (priceOutlook.ts, Release 1.2 section H) learns from.
 *
 * Stored as one doc per zone, history/SE-{zone}, with the days as a JSON
 * string (≈ 1 500 days × 3 numbers, well under Firestore's 1 MB limit, and
 * no index entries). Not readable by the app (default-deny rule).
 *
 * The long backfill (2022 → launch) was done once with
 * functions/scripts/importPriceHistory.js from a developer machine, not from
 * Cloud Functions (so a bulk download can never get our servers rate-limited
 * by the price site that every user's daily prices depend on). The daily
 * buildPriceOutlooks run only tops up the newest days.
 *
 * Sources (both free, no key):
 *  - prices: elprisetjustnu.se, daily average of SEK/kWh excl. VAT, back to 2022-11-01
 *  - weather: SMHI observations at one long-running station per zone, daily
 *    mean temperature (°C) and wind speed (m/s). The full archive file is
 *    only read while old days are missing; after that the "latest months"
 *    file (last ~4 months) keeps it up to date.
 */

export const HISTORY_START = '2022-11-01';

/** SMHI station per zone (temperature and wind both measured there since before 2022). */
const STATIONS: Record<string, number> = {
  SE1: 162860, // Luleå-Kallax Flygplats
  SE2: 127310, // Sundsvall-Timrå Flygplats
  SE3: 97200, // Stockholm-Bromma Flygplats
  SE4: 53300, // Malmö-Sturup Flygplats
};
const SMHI_TEMP = 1;
const SMHI_WIND = 4;
/** The "latest months" file covers roughly this many days. */
const LATEST_MONTHS_DAYS = 110;
/**
 * Be gentle with elprisetjustnu.se, a free service that also serves every
 * user's daily prices: one request at a time with a pause between, and only
 * a small batch per run. (A fast 6-at-a-time download got a network
 * rate-limited on 2026-11-16.)
 */
const PRICE_FETCH_PAUSE_MS = 1500;

export interface HistoryDay {
  /** Average spot price, SEK/kWh excl. VAT. */
  p?: number;
  /** Mean temperature, °C. */
  t?: number;
  /** Mean wind speed, m/s. */
  w?: number;
}
export type History = Record<string, HistoryDay>;

export function addDays(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export async function loadHistory(db: Firestore, zone: string): Promise<History> {
  const snap = await db.collection('history').doc(`SE-${zone}`).get();
  const raw = snap.data()?.days;
  if (typeof raw !== 'string') return {};
  try {
    return JSON.parse(raw) as History;
  } catch {
    return {};
  }
}

async function saveHistory(db: Firestore, zone: string, history: History): Promise<void> {
  await db
    .collection('history')
    .doc(`SE-${zone}`)
    .set({ zone, days: JSON.stringify(history), updatedAt: FieldValue.serverTimestamp() });
}

/** Thrown when the price site says "too many requests" / "forbidden": stop and try again next run. */
export class RateLimitedError extends Error {}

async function fetchDayAverage(zone: string, dateKey: string): Promise<number | null> {
  const [y, m, d] = dateKey.split('-');
  const response = await fetch(`https://www.elprisetjustnu.se/api/v1/prices/${y}/${m}-${d}_${zone}.json`);
  if (response.status === 429 || response.status === 403) throw new RateLimitedError(`HTTP ${response.status}`);
  if (!response.ok) return null;
  const rows = (await response.json()) as { SEK_per_kWh: number }[];
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return rows.reduce((s, r) => s + r.SEK_per_kWh, 0) / rows.length;
}

/** Daily means from an SMHI observation CSV ("Datum;Tid (UTC);Värde;Kvalitet"). Days with < 12 readings are skipped. */
async function fetchStationDaily(station: number, parameter: number, period: 'corrected-archive' | 'latest-months', since: string) {
  const url = `https://opendata-download-metobs.smhi.se/api/version/1.0/parameter/${parameter}/station/${station}/period/${period}/data.csv`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`SMHI ${parameter}/${station}/${period}: ${response.status}`);
  const text = await response.text();
  const sums = new Map<string, { sum: number; n: number }>();
  for (const line of text.split('\n')) {
    const parts = line.split(';');
    const date = parts[0]?.trim();
    if (!date || date.length !== 10 || date[4] !== '-' || date < since) continue;
    const value = Number(parts[2]);
    if (!Number.isFinite(value)) continue;
    const acc = sums.get(date) ?? { sum: 0, n: 0 };
    acc.sum += value;
    acc.n += 1;
    sums.set(date, acc);
  }
  const daily: Record<string, number> = {};
  for (const [date, { sum, n }] of sums) if (n >= 12) daily[date] = Math.round((sum / n) * 100) / 100;
  return daily;
}

/**
 * Fills in missing days up to and including `lastDay` (normally yesterday)
 * and saves. The first run backfills everything from HISTORY_START; later
 * runs only add the newest days. `maxPriceFetches` caps one run's downloads.
 */
export async function updateHistory(db: Firestore, zone: string, lastDay: string, maxPriceFetches = 1600): Promise<History> {
  const history = await loadHistory(db, zone);
  const days = dateRange(HISTORY_START, lastDay);

  // Prices
  let rateLimited: RateLimitedError | null = null;
  const missingPrices = days.filter((d) => history[d]?.p === undefined).slice(-maxPriceFetches);
  if (missingPrices.length > 0) {
    for (const d of missingPrices) {
      try {
        const avg = await fetchDayAverage(zone, d);
        if (avg !== null) history[d] = { ...history[d], p: Math.round(avg * 100000) / 100000 };
      } catch (err) {
        if (err instanceof RateLimitedError) {
          // Back off at the first sign of rate limiting: keep what we have, try again next run.
          logger.warn(`History ${zone}: price site said ${err.message}, stopping this run.`);
          rateLimited = err;
          break;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, PRICE_FETCH_PAUSE_MS));
    }
  }

  // Weather
  const station = STATIONS[zone];
  const missingWeather = days.filter((d) => history[d]?.t === undefined || history[d]?.w === undefined);
  if (station && missingWeather.length > 0) {
    const oldest = missingWeather[0];
    const needArchive = oldest < addDays(lastDay, -LATEST_MONTHS_DAYS + 5);
    const periods: ('corrected-archive' | 'latest-months')[] = needArchive ? ['corrected-archive', 'latest-months'] : ['latest-months'];
    try {
      for (const period of periods) {
        const [temps, winds] = await Promise.all([
          fetchStationDaily(station, SMHI_TEMP, period, oldest),
          fetchStationDaily(station, SMHI_WIND, period, oldest),
        ]);
        for (const d of missingWeather) {
          if (temps[d] !== undefined) history[d] = { ...history[d], t: temps[d] };
          if (winds[d] !== undefined) history[d] = { ...history[d], w: winds[d] };
        }
      }
    } catch (err) {
      logger.warn(`Weather history for ${zone} not updated: ${err}`);
    }
  }

  await saveHistory(db, zone, history);
  // Saved what we got; now tell the caller to stop (no more zones this run).
  if (rateLimited) throw rateLimited;
  const priceDays = Object.values(history).filter((v) => v.p !== undefined).length;
  const weatherDays = Object.values(history).filter((v) => v.t !== undefined && v.w !== undefined).length;
  logger.info(`History ${zone}: ${priceDays} days with prices, ${weatherDays} with weather (this run fetched ${missingPrices.length} price days).`);
  return history;
}
