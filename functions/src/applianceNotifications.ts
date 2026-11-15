import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';
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

/**
 * Runs every 15 minutes all day (unlike fetchPrices's narrow 12:00-15:00
 * window) since a smart push planned by smartPushes.ts can fall on any
 * quarter-hour. Fires any pending notification whose hour has arrived, then
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
      const data = doc.data() as { uid: string; applianceLabel?: string | null; language?: string; title?: string; body?: string; kind?: string };
      // Smart pushes (smartPushes.ts) are written with their text ready;
      // older records only have the appliance label.
      const { title, body } =
        data.title && data.body
          ? { title: data.title, body: data.body }
          : APPLIANCE_WINDOW_COPY[resolveServerLanguage(data.language)](data.applianceLabel ?? '');
      await sendExpoPushToUid(db, data.uid, title, body, { kind: data.kind ?? 'appliance' });
      await doc.ref.delete();
    }

    if (due.size > 0) {
      logger.info(`Fired ${due.size} smart push(es) for ${dateKey} slot ${slot}.`);
    }
  },
);
