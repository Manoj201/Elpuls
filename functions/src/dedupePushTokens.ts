import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { getFirestore } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';

/**
 * Keeps at most ONE push subscription per device. A phone's Expo push token
 * stays the same across Elpuls user IDs, but every guest session, sign-out
 * or account switch writes its own `pushSubscriptions/{uid}` doc — so one
 * phone could end up subscribed to several zones and get a push for each.
 * Whenever a subscription is written, any OTHER subscription holding the
 * same token is deleted, so the most recently active user/zone wins.
 */
export const dedupePushTokens = onDocumentWritten('pushSubscriptions/{uid}', async (event) => {
  const after = event.data?.after;
  const token = after?.exists ? (after.data()?.expoPushToken as string | undefined) : undefined;
  if (!token) return;

  const db = getFirestore();
  const duplicates = await db.collection('pushSubscriptions').where('expoPushToken', '==', token).get();
  const stale = duplicates.docs.filter((doc) => doc.id !== event.params.uid);
  if (stale.length === 0) return;

  const batch = db.batch();
  for (const doc of stale) batch.delete(doc.ref);
  await batch.commit();
  logger.info(`Removed ${stale.length} stale push subscription(s) sharing a token with ${event.params.uid}.`);
});
