import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';
import { findCheapestWindow, type PriceHour } from './priceUtils';
import { durationForRegistered } from './appliances';
import { sendExpoPushToUid } from './sendPriceNotifications';
import { APPLIANCE_WINDOW_COPY, resolveServerLanguage } from './pushCopy';

const stockholmDateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Stockholm' });
const stockholmTimeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Stockholm',
  hour: 'numeric',
  minute: 'numeric',
  hourCycle: 'h23',
});

/** Quarter-hour of the Stockholm day (0–95): 10:45 → 43. Matches the 15-minute price slots. */
function stockholmSlotOf(date: Date): number {
  const parts = stockholmTimeFormatter.formatToParts(date);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return hour * 4 + Math.floor(minute / 15);
}

/** "10:45" in Stockholm time, for the push text. */
function stockholmClockOf(date: Date): string {
  const parts = stockholmTimeFormatter.formatToParts(date);
  const hour = parts.find((p) => p.type === 'hour')?.value ?? '00';
  const minute = parts.find((p) => p.type === 'minute')?.value ?? '00';
  return `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
}

/**
 * Called once per zone right after fetchPrices.ts writes tomorrow's prices.
 * For every user subscribed to push in this zone with at least one
 * notify-enabled registered appliance, computes that appliance's cheapest
 * window tomorrow and stores a "fire at this hour" record — fetchPrices only
 * runs 12:00-15:00 Stockholm, but a cheapest window can start at any hour,
 * so the actual send happens later via fireDueApplianceNotifications below.
 */
export async function scheduleApplianceWindowNotifications(
  db: Firestore,
  zone: string,
  dateKey: string,
  hours: PriceHour[],
): Promise<void> {
  const subscriptions = await db.collection('pushSubscriptions').where('zone', '==', zone).get();

  for (const sub of subscriptions.docs) {
    const uid = sub.id;
    const appliancesSnap = await db
      .collection('users')
      .doc(uid)
      .collection('appliances')
      .where('notifyEnabled', '==', true)
      .get();

    if (appliancesSnap.empty) continue;

    const userSnap = await db.collection('users').doc(uid).get();
    // Appliance pushes are a Pro feature; check on the server, not only in the app.
    if (userSnap.data()?.isProSubscriber !== true) continue;
    const language = resolveServerLanguage(userSnap.data()?.language);

    for (const applianceDoc of appliancesSnap.docs) {
      const data = applianceDoc.data();
      const applianceLabel = data.label as string;
      const durationHours = durationForRegistered(applianceLabel, data.durationHours as number | undefined);
      const window = findCheapestWindow(hours, durationHours);
      if (!window) continue;

      const windowStart = new Date(window.start.hour);

      await db
        .collection('pendingApplianceNotifications')
        .doc(`${uid}_${applianceDoc.id}_${dateKey}`)
        .set({
          uid,
          applianceLabel,
          windowStartSlot: stockholmSlotOf(windowStart),
          windowStartClock: stockholmClockOf(windowStart),
          dateKey,
          language,
        });
    }
  }
}

/**
 * Runs every 15 minutes all day (unlike fetchPrices's narrow 12:00-15:00
 * window) since a cheapest window computed by the function above can start
 * at any quarter-hour. Fires any pending notification whose hour has arrived, then
 * deletes it — deletion is the idempotency guard here, simpler than
 * sendPriceNotifications.ts's `.create()` marker pattern since there's
 * nothing worth re-deriving once a reminder has gone out.
 */
export const fireDueApplianceNotifications = onSchedule(
  { schedule: '*/15 * * * *', timeZone: 'Europe/Stockholm' },
  async () => {
    const db = getFirestore();
    const now = new Date();
    const dateKey = stockholmDateFormatter.format(now);
    // Runs every 15 minutes, so this is the quarter-hour that just started.
    const slot = stockholmSlotOf(now);

    const due = await db
      .collection('pendingApplianceNotifications')
      .where('dateKey', '==', dateKey)
      .where('windowStartSlot', '==', slot)
      .get();

    for (const doc of due.docs) {
      const { uid, applianceLabel, language } = doc.data() as { uid: string; applianceLabel: string; language?: string };
      const { title, body } = APPLIANCE_WINDOW_COPY[resolveServerLanguage(language)](applianceLabel);
      await sendExpoPushToUid(db, uid, title, body, { applianceLabel });
      await doc.ref.delete();
    }

    if (due.size > 0) {
      logger.info(`Fired ${due.size} appliance notification(s) for ${dateKey} slot ${slot}.`);
    }
  },
);
