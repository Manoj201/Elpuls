import { Firestore } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

interface PushSubscription {
  expoPushToken?: string;
  language?: string;
  /** Mirrored from the user's Notiser settings; false = no "prices published" push. */
  pricesPublished?: boolean;
}

export async function sendExpoPushBatch(
  tokens: string[],
  title: string,
  body: string,
  data: Record<string, string>,
): Promise<boolean> {
  const messages = tokens.map((to) => ({ to, sound: 'default', title, body, data }));

  const response = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(messages),
  });

  if (!response.ok) {
    logger.error(`Expo push API request failed: ${response.status}`);
    return false;
  }

  const responseBody = await response.json();
  logger.info(`Expo push API response: ${JSON.stringify(responseBody)}`);
  return true;
}

/**
 * Sends a push to one specific user's device (looked up by their
 * `pushSubscriptions/{uid}` doc, since that doc's ID is already the uid) —
 * used by the proactive appliance-start notifications, which target a
 * single user's opted-in appliance rather than a whole zone.
 */
export async function sendExpoPushToUid(
  db: Firestore,
  uid: string,
  title: string,
  body: string,
  data: Record<string, string>,
): Promise<boolean> {
  const sub = await db.collection('pushSubscriptions').doc(uid).get();
  const token = (sub.data() as PushSubscription | undefined)?.expoPushToken;

  if (!token) {
    logger.info(`No push subscription for uid ${uid}, nothing to send.`);
    // Nothing to retry: there's no device to send to.
    return true;
  }

  const ok = await sendExpoPushBatch([token], title, body, data);
  if (ok) logger.info(`Sent "${title}" to uid ${uid}.`);
  return ok;
}
