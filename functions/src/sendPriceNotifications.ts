import { FieldValue, Firestore } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';
import { PRICE_PUBLISHED_COPY, resolveServerLanguage, type ServerLanguage } from './pushCopy';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_PUSH_CHUNK_SIZE = 100;

interface PushSubscription {
  expoPushToken?: string;
  language?: string;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function sendExpoPushBatch(
  tokens: string[],
  title: string,
  body: string,
  data: Record<string, string>,
): Promise<void> {
  const messages = tokens.map((to) => ({ to, sound: 'default', title, body, data }));

  const response = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(messages),
  });

  if (!response.ok) {
    logger.error(`Expo push API request failed: ${response.status}`);
    return;
  }

  const responseBody = await response.json();
  logger.info(`Expo push API response: ${JSON.stringify(responseBody)}`);
}

/**
 * Sends a push notification to every device subscribed to `zone`, grouped
 * by each subscriber's own language (defaulting to 'sv' when unset) — the
 * `copyForLanguage` callback resolves the actual title/body per group, so
 * one zone-wide send can still reach each recipient in their own language.
 */
export async function sendExpoPushToZone(
  db: Firestore,
  zone: string,
  copyForLanguage: (language: ServerLanguage) => { title: string; body: string },
  data: Record<string, string>,
): Promise<void> {
  const subscriptions = await db.collection('pushSubscriptions').where('zone', '==', zone).get();

  const tokensByLanguage = new Map<ServerLanguage, string[]>();
  // One device = one push, even if stale duplicate subscriptions for the
  // same token still exist (see dedupePushTokens.ts).
  const seenTokens = new Set<string>();
  for (const sub of subscriptions.docs) {
    const subscription = sub.data() as PushSubscription;
    if (!subscription.expoPushToken || seenTokens.has(subscription.expoPushToken)) continue;
    seenTokens.add(subscription.expoPushToken);
    const language = resolveServerLanguage(subscription.language);
    const tokens = tokensByLanguage.get(language) ?? [];
    tokens.push(subscription.expoPushToken);
    tokensByLanguage.set(language, tokens);
  }

  if (tokensByLanguage.size === 0) {
    logger.info(`No push subscriptions for ${zone}, nothing to send.`);
    return;
  }

  for (const [language, tokens] of tokensByLanguage) {
    const { title, body } = copyForLanguage(language);
    for (const batch of chunk(tokens, EXPO_PUSH_CHUNK_SIZE)) {
      await sendExpoPushBatch(batch, title, body, data);
    }
  }

  logger.info(`Sent to ${zone} (${seenTokens.size} device(s)).`);
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
): Promise<void> {
  const sub = await db.collection('pushSubscriptions').doc(uid).get();
  const token = (sub.data() as PushSubscription | undefined)?.expoPushToken;

  if (!token) {
    logger.info(`No push subscription for uid ${uid}, nothing to send.`);
    return;
  }

  await sendExpoPushBatch([token], title, body, data);
  logger.info(`Sent "${title}" to uid ${uid}.`);
}

/**
 * Notifies everyone subscribed to `zone` that tomorrow's prices were just
 * published, at most once per zone per day. Uses a `.create()` on a marker
 * doc as an atomic "already notified" guard, since fetchPrices polls every
 * 15 minutes and would otherwise re-trigger this on every run.
 */
export async function notifyZonePricesPublished(
  db: Firestore,
  zone: string,
  dateKey: string,
): Promise<void> {
  const marker = db.collection('priceNotifications').doc(`SE-${zone}-${dateKey}`);

  try {
    await marker.create({ notifiedAt: FieldValue.serverTimestamp() });
  } catch (err) {
    const code = (err as { code?: number })?.code;
    if (code === 6 /* ALREADY_EXISTS */) {
      logger.info(`Already notified ${zone} for ${dateKey}, skipping.`);
      return;
    }
    throw err;
  }

  await sendExpoPushToZone(
    db,
    zone,
    (language) => PRICE_PUBLISHED_COPY[language](zone, dateKey),
    { zone, dateKey },
  );
}
