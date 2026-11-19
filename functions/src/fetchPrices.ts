import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';
import { scheduleSmartPushes } from './smartPushes';
import { sendPublishPushes } from './publishPushes';
import { addNightPlan, generateDailyPlan } from './dailyPlan';

const SWEDISH_ZONES = ['SE1', 'SE2', 'SE3', 'SE4'];

const stockholmDateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Stockholm' });
function stockholmDateKey(d: Date): string {
  return stockholmDateFormatter.format(d);
}

interface ElprisetJustNuEntry {
  SEK_per_kWh: number;
  time_start: string;
}

/**
 * Scheduled daily to pick up tomorrow's Swedish spot prices once
 * elprisetjustnu.se publishes them (typically ~13:00 CET). Stored in
 * Firestore so clients read from our cache instead of hitting the
 * upstream API directly.
 */
export const fetchPrices = onSchedule(
  // Every 15 min from 12:05 until tomorrow's prices are stored, up to 23:50:
  // if the price site is down at 13:00 we keep trying all evening instead of
  // giving up at 14:50 (the app reads prices only from Firestore). Zones
  // already stored are skipped, so later runs on a normal day do nothing.
  // The AI key is for the "Din plan" summary (dailyPlan.ts).
  { schedule: '5,20,35,50 12-23 * * *', timeZone: 'Europe/Stockholm', secrets: ['ANTHROPIC_API_KEY'] },
  async () => {
    const db = getFirestore();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Today's "Din plan" if it's missing (e.g. the feature was deployed after
    // yesterday's publish, or yesterday's run failed). Idempotent, cheap when it exists.
    const todayKey = stockholmDateKey(new Date());
    type PriceHourDoc = { hour: string; price: number };
    for (const zone of SWEDISH_ZONES) {
      const todaySnap = await db.collection('prices').doc(`SE-${zone}-${todayKey}`).get();
      const todayHours = todaySnap.data()?.hours as PriceHourDoc[] | undefined;
      if (todayHours?.length) {
        await generateDailyPlan(db, zone, todayKey, todayHours).catch((err) => logger.error(`Today's plan failed for ${zone}: ${err}`));
        // Tonight's part, if tomorrow's prices are already stored but it's
        // missing (a failed step on the run that stored them). No-op otherwise.
        const nextHours = (await db.collection('prices').doc(`SE-${zone}-${stockholmDateKey(tomorrow)}`).get()).data()?.hours as
          | PriceHourDoc[]
          | undefined;
        if (nextHours?.length) {
          await addNightPlan(db, zone, todayKey, todayHours, nextHours).catch((err) => logger.error(`Tonight's plan failed for ${zone}: ${err}`));
        }
      }
    }

    const tomorrowKey = stockholmDateKey(tomorrow);
    for (const zone of SWEDISH_ZONES) {
      if ((await db.collection('prices').doc(`SE-${zone}-${tomorrowKey}`).get()).exists) continue;
      const [ty, tm, td] = tomorrowKey.split('-');
      const response = await fetch(`https://www.elprisetjustnu.se/api/v1/prices/${ty}/${tm}-${td}_${zone}.json`);

      if (response.status === 404) {
        logger.info(`Prices for ${zone} not published yet`);
        continue;
      }

      if (!response.ok) {
        logger.error(`Failed to fetch prices for ${zone}: ${response.status}`);
        continue;
      }

      const entries = (await response.json()) as ElprisetJustNuEntry[];
      const dateKey = tomorrowKey;
      const hours = entries.map((entry) => ({ hour: entry.time_start, price: entry.SEK_per_kWh }));

      await db
        .collection('prices')
        .doc(`SE-${zone}-${dateKey}`)
        .set({
          zone,
          date: dateKey,
          currency: 'SEK',
          hours,
          fetchedAt: new Date().toISOString(),
        });

      logger.info(`Stored ${entries.length} price entries for ${zone} on ${dateKey}`);

      // Each step on its own: prices are already stored, so this zone won't be
      // processed again; one failing step must not skip the others. Order
      // matters: tomorrow's plan and tonight's plan are stored before the
      // pushes that point to them ("Din plan för i natt är klar").
      await generateDailyPlan(db, zone, dateKey, hours).catch((err) => logger.error(`Daily plan failed for ${zone}: ${err}`));
      const todayForNight = (await db.collection('prices').doc(`SE-${zone}-${todayKey}`).get()).data()?.hours as PriceHourDoc[] | undefined;
      if (todayForNight?.length) {
        await addNightPlan(db, zone, todayKey, todayForNight, hours).catch((err) => logger.error(`Tonight's plan failed for ${zone}: ${err}`));
      }
      const planReady = await scheduleSmartPushes(db, zone, dateKey, hours).catch((err) => {
        logger.error(`Smart push planning failed for ${zone}: ${err}`);
        return new Map();
      });
      await sendPublishPushes(db, zone, dateKey, hours, planReady).catch((err) => logger.error(`Publish pushes failed for ${zone}: ${err}`));
    }
  },
);

/**
 * Safety net (the app reads prices only from Firestore): shortly after
 * midnight and at 06:00, store today's prices if they're missing, e.g. when
 * every fetchPrices run failed the day before. Does nothing on a normal day.
 */
export const ensureTodayPrices = onSchedule(
  { schedule: '7 0,6 * * *', timeZone: 'Europe/Stockholm' },
  async () => {
    const db = getFirestore();
    const now = new Date();
    const dateKey = stockholmDateKey(now);
    for (const zone of SWEDISH_ZONES) {
      const ref = db.collection('prices').doc(`SE-${zone}-${dateKey}`);
      if ((await ref.get()).exists) continue;
      // Built from the Swedish date: at 00:07 in Sweden the server's UTC clock is still on yesterday.
      const [y, m, d] = dateKey.split('-');
      const response = await fetch(`https://www.elprisetjustnu.se/api/v1/prices/${y}/${m}-${d}_${zone}.json`);
      if (!response.ok) {
        logger.error(`ensureTodayPrices: ${zone} ${dateKey} failed: ${response.status}`);
        continue;
      }
      const entries = (await response.json()) as ElprisetJustNuEntry[];
      await ref.set({
        zone,
        date: dateKey,
        currency: 'SEK',
        hours: entries.map((entry) => ({ hour: entry.time_start, price: entry.SEK_per_kWh })),
        fetchedAt: new Date().toISOString(),
      });
      logger.warn(`ensureTodayPrices: stored missing prices for ${zone} ${dateKey}.`);
    }
  },
);
