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
 * How late a push may still go out: up to 2 quarter-hours (30 min) after its
 * slot. Covers a skipped or failed run (and a send that failed, which is
 * retried) without telling people "start now" long after the window opened.
 */
export const CATCH_UP_SLOTS = 2;

/**
 * What to do with a pending push now. Exported for tests.
 *  send: its slot has come (or was missed by at most CATCH_UP_SLOTS)
 *  drop: too late (an earlier day, or more than 30 minutes ago)
 *  wait: later today or a later day
 */
export function dueAction(docDateKey: string, docSlot: number, todayKey: string, nowSlot: number): 'send' | 'drop' | 'wait' {
  if (docDateKey < todayKey) return 'drop';
  if (docDateKey > todayKey || docSlot > nowSlot) return 'wait';
  return nowSlot - docSlot <= CATCH_UP_SLOTS ? 'send' : 'drop';
}

/**
 * Runs every 15 minutes all day, since a smart push (smartPushes.ts) can fall
 * on any quarter-hour. Sends every pending push whose time has come, then
 * deletes it (deletion is the idempotency guard). A push whose send failed is
 * kept and retried on the next run, within the catch-up window; one that's
 * too late is deleted. One failing push never stops the others.
 */
export const fireDueApplianceNotifications = onSchedule(
  { schedule: '*/15 * * * *', timeZone: 'Europe/Stockholm' },
  async () => {
    const db = getFirestore();
    const now = new Date();
    const todayKey = stockholmDateFormatter.format(now);
    const nowSlot = stockholmSlotOf(now);

    // Today's and older records (single-field range, no composite index needed).
    const pending = await db.collection('pendingApplianceNotifications').where('dateKey', '<=', todayKey).get();

    let sent = 0;
    let dropped = 0;
    for (const doc of pending.docs) {
      const data = doc.data() as {
        uid: string;
        dateKey: string;
        windowStartSlot: number;
        applianceLabel?: string | null;
        language?: string;
        title?: string;
        body?: string;
        kind?: string;
      };
      const action = dueAction(data.dateKey, Number(data.windowStartSlot), todayKey, nowSlot);
      if (action === 'wait') continue;
      if (action === 'drop') {
        logger.warn(`Dropping missed push ${doc.id} (${data.dateKey} slot ${data.windowStartSlot}).`);
        await doc.ref.delete();
        dropped++;
        continue;
      }
      try {
        // Smart pushes are written with their text ready; older records only have the appliance label.
        const { title, body } =
          data.title && data.body
            ? { title: data.title, body: data.body }
            : APPLIANCE_WINDOW_COPY[resolveServerLanguage(data.language)](data.applianceLabel ?? '');
        const ok = await sendExpoPushToUid(db, data.uid, title, body, { kind: data.kind ?? 'appliance' });
        if (ok) {
          await doc.ref.delete();
          sent++;
        } else {
          logger.warn(`Send failed for ${doc.id}; will retry on the next run.`);
        }
      } catch (err) {
        logger.error(`Push ${doc.id} failed: ${err}; will retry on the next run.`);
      }
    }

    if (sent > 0 || dropped > 0) {
      logger.info(`Fired ${sent} smart push(es), dropped ${dropped} missed, for ${todayKey} slot ${nowSlot}.`);
    }
  },
);
