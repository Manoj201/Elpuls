import { FieldValue, Firestore } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';
import { findExtremeHours, type PriceHour } from './priceUtils';
import { sendExpoPushToUid } from './sendPriceNotifications';
import { PRICE_ALERT_HIGH_COPY, PRICE_ALERT_LOW_COPY, resolveServerLanguage } from './pushCopy';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function hourLabel(iso: string): string {
  const hour = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Stockholm', hour: 'numeric', hourCycle: 'h23' }).format(new Date(iso));
  return `${pad(Number(hour))}:00`;
}

/**
 * Checks tomorrow's prices against each zone subscriber's own alert
 * preferences (`users/{uid}.priceAlertHighThresholdOre`/`.priceAlertLowEnabled`)
 * and sends an extra, more specific push on top of the existing
 * "prices published" notification — one per user, high-price alert taking
 * priority over the low-price tip if both would fire. Guarded with the same
 * `.create()`-marker idempotency pattern as notifyZonePricesPublished, under
 * its own marker collection so it doesn't collide with that one.
 */
export async function notifyZonePriceAlerts(db: Firestore, zone: string, dateKey: string, hours: PriceHour[]): Promise<void> {
  const marker = db.collection('priceAlertNotifications').doc(`SE-${zone}-${dateKey}`);

  try {
    await marker.create({ notifiedAt: FieldValue.serverTimestamp() });
  } catch (err) {
    const code = (err as { code?: number })?.code;
    if (code === 6 /* ALREADY_EXISTS */) {
      logger.info(`Already checked price alerts for ${zone} on ${dateKey}, skipping.`);
      return;
    }
    throw err;
  }

  const { cheapest, priciest } = findExtremeHours(hours);
  if (!cheapest || !priciest) {
    logger.info(`No usable price hours for ${zone} on ${dateKey}, skipping price alerts.`);
    return;
  }

  const hasLowPriceHour = hours.some((h) => h.price <= 0);
  const peakOre = Math.round(priciest.price * 100);

  const subscriptions = await db.collection('pushSubscriptions').where('zone', '==', zone).get();

  for (const sub of subscriptions.docs) {
    const uid = sub.id;
    const userSnap = await db.collection('users').doc(uid).get();
    const user = userSnap.data();
    const language = resolveServerLanguage(user?.language);

    const highThresholdOre = user?.priceAlertHighThresholdOre as number | undefined;
    const lowEnabled = Boolean(user?.priceAlertLowEnabled);

    if (highThresholdOre && peakOre >= highThresholdOre) {
      const { title, body } = PRICE_ALERT_HIGH_COPY[language](zone, peakOre, hourLabel(priciest.hour));
      await sendExpoPushToUid(db, uid, title, body, { zone, dateKey });
    } else if (lowEnabled && hasLowPriceHour) {
      const { title, body } = PRICE_ALERT_LOW_COPY[language](zone, hourLabel(cheapest.hour));
      await sendExpoPushToUid(db, uid, title, body, { zone, dateKey });
    }
  }
}
