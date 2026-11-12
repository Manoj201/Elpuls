import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import * as logger from 'firebase-functions/logger';

/**
 * Deletes everything tied to the calling user's own uid — never a
 * client-supplied uid, so a user can only ever delete themselves. Runs as
 * an onCall (Admin SDK) rather than client-side Firestore writes for two
 * reasons: `pendingApplianceNotifications` is Cloud-Functions-only under
 * firestore.rules (no client access), and deleting the Firebase Auth user
 * itself can throw `auth/requires-recent-login` from the client SDK on an
 * older session — the Admin SDK has neither restriction.
 */
export const deleteMyAccount = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign-in required.');
  }

  const uid = request.auth.uid;
  const db = getFirestore();

  const applianceDocs = await db.collection('users').doc(uid).collection('appliances').listDocuments();
  const pendingNotificationDocs = await db.collection('pendingApplianceNotifications').where('uid', '==', uid).get();

  const batch = db.batch();
  batch.delete(db.collection('users').doc(uid));
  batch.delete(db.collection('pushSubscriptions').doc(uid));
  for (const ref of applianceDocs) batch.delete(ref);
  for (const doc of pendingNotificationDocs.docs) batch.delete(doc.ref);
  await batch.commit();

  await getAuth().deleteUser(uid);

  logger.info(`Deleted account and data for uid ${uid}`);
  return { deleted: true };
});
