import { FieldValue, Firestore } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';
import { findExtremeHours, type PriceHour } from './priceUtils';
import { sendExpoPushToUid } from './sendPriceNotifications';
import {
  PRICE_ALERT_HIGH_COPY,
  PRICE_ALERT_LOW_COPY,
  PRICE_PUBLISHED_COPY,
  planReadyCopy,
  resolveServerLanguage,
} from './pushCopy';
import type { PlanReadyInfo } from './smartPushes';

function hourLabel(iso: string): string {
  const hour = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Stockholm', hour: 'numeric', hourCycle: 'h23' }).format(new Date(iso));
  return `${String(Number(hour)).padStart(2, '0')}:00`;
}

/**
 * The one push each subscriber gets when tomorrow's prices are published
 * (about 13:00), replacing the separate "prices published" and price-alert
 * pushes so nobody gets two at once:
 *  - Pro users who get tonight's plan at 19:00: "Din plan för i natt är klar"
 *    (+ their price alert sentence, if one fires), opens Din plan when tapped.
 *  - Otherwise a price alert, if the user's own limit is crossed.
 *  - Otherwise the plain "Morgondagens elpriser är här" (if not switched off).
 * Once per zone and day (`.create()` marker, fetchPrices polls every 15 min).
 * One broken profile never stops the others.
 */
export async function sendPublishPushes(
  db: Firestore,
  zone: string,
  dateKey: string,
  hours: PriceHour[],
  planReady: Map<string, PlanReadyInfo>,
): Promise<void> {
  const marker = db.collection('priceNotifications').doc(`SE-${zone}-${dateKey}`);
  try {
    await marker.create({ notifiedAt: FieldValue.serverTimestamp() });
  } catch (err) {
    if ((err as { code?: number })?.code === 6 /* ALREADY_EXISTS */) {
      logger.info(`Already sent publish pushes for ${zone} ${dateKey}, skipping.`);
      return;
    }
    throw err;
  }

  const { cheapest, priciest } = findExtremeHours(hours);
  const peakOre = priciest ? Math.round(priciest.price * 100) : 0;
  const hasLowPriceHour = hours.some((h) => h.price <= 0);

  const subscriptions = await db.collection('pushSubscriptions').where('zone', '==', zone).get();
  const seenTokens = new Set<string>();
  const counts = { planReady: 0, alert: 0, published: 0 };

  for (const sub of subscriptions.docs) {
    const uid = sub.id;
    try {
      const subscription = sub.data() as { expoPushToken?: string; language?: string; pricesPublished?: boolean };
      // One device = one push, even if a stale duplicate subscription exists.
      if (!subscription.expoPushToken || seenTokens.has(subscription.expoPushToken)) continue;
      seenTokens.add(subscription.expoPushToken);

      const user = (await db.collection('users').doc(uid).get()).data() ?? {};
      const language = resolveServerLanguage(user.language ?? subscription.language);
      const wantsPublished = subscription.pricesPublished !== false;

      // The user's own price alert for tomorrow, if any (high limit beats the low tip).
      const highLimit = user.priceAlertHighThresholdOre as number | undefined;
      let alert: { title: string; body: string } | null = null;
      if (priciest && highLimit && peakOre >= highLimit) {
        alert = PRICE_ALERT_HIGH_COPY[language](zone, peakOre, hourLabel(priciest.hour));
      } else if (cheapest && user.priceAlertLowEnabled && hasLowPriceHour) {
        alert = PRICE_ALERT_LOW_COPY[language](zone, hourLabel(cheapest.hour));
      }

      const ready = planReady.get(uid);
      if (ready && wantsPublished) {
        const copy = planReadyCopy(language, ready.kinds);
        const body = alert ? `${copy.body} ${alert.body}` : copy.body;
        await sendExpoPushToUid(db, uid, copy.title, body, { kind: 'planReady', zone, dateKey });
        counts.planReady++;
      } else if (alert) {
        await sendExpoPushToUid(db, uid, alert.title, alert.body, { kind: 'priceAlert', zone, dateKey });
        counts.alert++;
      } else if (wantsPublished) {
        const copy = PRICE_PUBLISHED_COPY[language](zone, dateKey);
        await sendExpoPushToUid(db, uid, copy.title, copy.body, { kind: 'pricesPublished', zone, dateKey });
        counts.published++;
      }
    } catch (err) {
      logger.error(`Publish push failed for uid ${uid}: ${err}`);
    }
  }
  logger.info(
    `Publish pushes for ${zone} ${dateKey}: ${counts.planReady} plan-ready, ${counts.alert} alert, ${counts.published} prices-published.`,
  );
}
