import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';
import { findCheapestWindow, type PriceHour } from './priceUtils';
import { sendExpoPushToUid } from './sendPriceNotifications';
import { APPLIANCE_WINDOW_COPY, resolveServerLanguage } from './pushCopy';

// Matches the client's toAppliancePreset default (src/lib/applianceDisplay.ts)
// — registered appliances don't collect a duration at registration time, so
// both sides assume the same generic figure rather than inventing a new one.
const REGISTERED_APPLIANCE_DURATION_HOURS = 1.5;

const stockholmDateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Stockholm' });
const stockholmHourFormatter = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Stockholm', hour: 'numeric', hourCycle: 'h23' });

function stockholmHourOf(date: Date): number {
  return Number(stockholmHourFormatter.format(date));
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
    const language = resolveServerLanguage(userSnap.data()?.language);

    for (const applianceDoc of appliancesSnap.docs) {
      const window = findCheapestWindow(hours, REGISTERED_APPLIANCE_DURATION_HOURS);
      if (!window) continue;

      const applianceLabel = applianceDoc.data().label as string;
      const windowStartHour = stockholmHourOf(new Date(window.start.hour));

      await db
        .collection('pendingApplianceNotifications')
        .doc(`${uid}_${applianceDoc.id}_${dateKey}`)
        .set({ uid, applianceLabel, windowStartHour, dateKey, language });
    }
  }
}

/**
 * Runs every 15 minutes all day (unlike fetchPrices's narrow 12:00-15:00
 * window) since a cheapest window computed by the function above can start
 * at any hour. Fires any pending notification whose hour has arrived, then
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
    const hour = stockholmHourOf(now);

    const due = await db
      .collection('pendingApplianceNotifications')
      .where('dateKey', '==', dateKey)
      .where('windowStartHour', '==', hour)
      .get();

    for (const doc of due.docs) {
      const { uid, applianceLabel, language } = doc.data() as { uid: string; applianceLabel: string; language?: string };
      const { title, body } = APPLIANCE_WINDOW_COPY[resolveServerLanguage(language)](applianceLabel);
      await sendExpoPushToUid(db, uid, title, body, { applianceLabel });
      await doc.ref.delete();
    }

    if (due.size > 0) {
      logger.info(`Fired ${due.size} appliance notification(s) for ${dateKey} hour ${hour}.`);
    }
  },
);
