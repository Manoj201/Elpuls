import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';
import { notifyZonePricesPublished } from './sendPriceNotifications';
import { scheduleApplianceWindowNotifications } from './applianceNotifications';

const SWEDISH_ZONES = ['SE1', 'SE2', 'SE3', 'SE4'];

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
  { schedule: '5,20,35,50 12-14 * * *', timeZone: 'Europe/Stockholm' },
  async () => {
    const db = getFirestore();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

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

      await db
        .collection('prices')
        .doc(`SE-${zone}-${dateKey}`)
        .set({
          zone,
          date: dateKey,
          currency: 'SEK',
          hours: entries.map((entry) => ({
            hour: entry.time_start,
            price: entry.SEK_per_kWh,
          })),
          fetchedAt: new Date().toISOString(),
        });

      logger.info(`Stored ${entries.length} price entries for ${zone} on ${dateKey}`);

      await notifyZonePricesPublished(db, zone, dateKey);
      await scheduleApplianceWindowNotifications(
        db,
        zone,
        dateKey,
        entries.map((entry) => ({ hour: entry.time_start, price: entry.SEK_per_kWh })),
      );
    }
  },
);
