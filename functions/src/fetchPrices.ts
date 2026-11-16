import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';
import { notifyZonePricesPublished } from './sendPriceNotifications';
import { scheduleSmartPushes } from './smartPushes';
import { notifyZonePriceAlerts } from './priceAlerts';
import { generateDailyPlan } from './dailyPlan';

const SWEDISH_ZONES = ['SE1', 'SE2', 'SE3', 'SE4'];

const stockholmDateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Stockholm' });
function stockholmDateKey(d: Date): string {
  return stockholmDateFormatter.format(d);
}

interface ElprisetJustNuEntry {
  SEK_per_kWh: number;
  time_start: string;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function buildUrl(zone: string, date: Date): string {
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  return `https://www.elprisetjustnu.se/api/v1/prices/${year}/${month}-${day}_${zone}.json`;
}

/**
 * Scheduled daily to pick up tomorrow's Swedish spot prices once
 * elprisetjustnu.se publishes them (typically ~13:00 CET). Stored in
 * Firestore so clients read from our cache instead of hitting the
 * upstream API directly.
 */
export const fetchPrices = onSchedule(
  // The AI key is for the "Din plan" summary (dailyPlan.ts).
  { schedule: '5,20,35,50 12-14 * * *', timeZone: 'Europe/Stockholm', secrets: ['ANTHROPIC_API_KEY'] },
  async () => {
    const db = getFirestore();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Today's "Din plan" if it's missing (e.g. the feature was deployed after
    // yesterday's publish, or yesterday's run failed). Idempotent, cheap when it exists.
    const todayKey = stockholmDateKey(new Date());
    for (const zone of SWEDISH_ZONES) {
      const todaySnap = await db.collection('prices').doc(`SE-${zone}-${todayKey}`).get();
      const todayHours = todaySnap.data()?.hours as { hour: string; price: number }[] | undefined;
      if (todayHours?.length) {
        await generateDailyPlan(db, zone, todayKey, todayHours).catch((err) => logger.error(`Today's plan failed for ${zone}: ${err}`));
      }
    }

    for (const zone of SWEDISH_ZONES) {
      const response = await fetch(buildUrl(zone, tomorrow));

      if (response.status === 404) {
        logger.info(`Prices for ${zone} not published yet`);
        continue;
      }

      if (!response.ok) {
        logger.error(`Failed to fetch prices for ${zone}: ${response.status}`);
        continue;
      }

      const entries = (await response.json()) as ElprisetJustNuEntry[];
      const dateKey = tomorrow.toISOString().slice(0, 10);
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

      await notifyZonePricesPublished(db, zone, dateKey);
      await scheduleSmartPushes(db, zone, dateKey, hours);
      await notifyZonePriceAlerts(db, zone, dateKey, hours);
      // Once per zone and day (idempotent); never blocks the price fetch.
      await generateDailyPlan(db, zone, dateKey, hours).catch((err) => logger.error(`Daily plan failed for ${zone}: ${err}`));
    }
  },
);
