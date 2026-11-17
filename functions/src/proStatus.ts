import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';

/**
 * Pro status in users/{uid}.isProSubscriber is written only here, from
 * RevenueCat's own records, never by the app (firestore.rules blocks it).
 * Before this, the app wrote the field itself, so anyone could switch on the
 * Pro pushes (smart tips, daily briefing) without paying.
 *
 * Two ways in, same check:
 *  - refreshProStatus (callable): the app asks after a purchase, restore or
 *    app start. Uses the caller's own uid only.
 *  - revenueCatWebhook (HTTP): RevenueCat calls it on renewals, expiries,
 *    cancellations etc., so status stays right when the app isn't opened.
 *
 * Secrets: REVENUECAT_SECRET_KEY (RevenueCat → Project settings → API keys →
 * secret key, v1) and REVENUECAT_WEBHOOK_AUTH (any long random string, also
 * set as the webhook's Authorization header in RevenueCat).
 */

const PRO_ENTITLEMENT_ID = 'pro';

interface RcEntitlement {
  expires_date: string | null;
}

/** Asks RevenueCat whether `uid` has an active "pro" entitlement right now. */
async function fetchProStatus(uid: string): Promise<{ isPro: boolean; expiresAtMs: number | null }> {
  const key = process.env.REVENUECAT_SECRET_KEY;
  if (!key) throw new Error('REVENUECAT_SECRET_KEY is not set');
  const res = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(uid)}`, {
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`RevenueCat ${res.status}: ${await res.text()}`);
  const body = (await res.json()) as { subscriber?: { entitlements?: Record<string, RcEntitlement> } };
  const ent = body.subscriber?.entitlements?.[PRO_ENTITLEMENT_ID];
  if (!ent) return { isPro: false, expiresAtMs: null };
  // null expires_date = lifetime / non-expiring grant.
  const expiresAtMs = ent.expires_date ? Date.parse(ent.expires_date) : null;
  return { isPro: expiresAtMs === null || expiresAtMs > Date.now(), expiresAtMs };
}

async function writeProStatus(uid: string): Promise<boolean> {
  const { isPro, expiresAtMs } = await fetchProStatus(uid);
  await getFirestore()
    .collection('users')
    .doc(uid)
    .set(
      {
        isProSubscriber: isPro,
        proExpiresAt: expiresAtMs,
        proCheckedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  return isPro;
}

/**
 * Server-side Pro check for Cloud Functions that send Pro-only pushes. Also
 * honours the stored expiry, so a subscription that ran out stops counting
 * even if the expiry webhook was missed.
 */
export function isProUser(user: { isProSubscriber?: unknown; proExpiresAt?: unknown } | undefined): boolean {
  if (user?.isProSubscriber !== true) return false;
  const exp = user.proExpiresAt;
  return typeof exp !== 'number' || exp > Date.now();
}

export const refreshProStatus = onCall({ secrets: ['REVENUECAT_SECRET_KEY'] }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign-in required.');
  try {
    return { isPro: await writeProStatus(request.auth.uid) };
  } catch (err) {
    logger.error('refreshProStatus failed', err);
    throw new HttpsError('unavailable', 'Could not check subscription status.');
  }
});

export const revenueCatWebhook = onRequest(
  { secrets: ['REVENUECAT_SECRET_KEY', 'REVENUECAT_WEBHOOK_AUTH'] },
  async (req, res) => {
    const expected = process.env.REVENUECAT_WEBHOOK_AUTH;
    if (!expected || req.get('Authorization') !== expected) {
      res.status(401).send('unauthorized');
      return;
    }
    const event = (req.body as { event?: { app_user_id?: string; aliases?: string[]; transferred_to?: string[]; transferred_from?: string[] } })?.event;
    // Every id the event touches; anonymous RevenueCat ids ($RCAnonymousID:…)
    // aren't Firebase uids, so skip them.
    const ids = new Set(
      [event?.app_user_id, ...(event?.aliases ?? []), ...(event?.transferred_to ?? []), ...(event?.transferred_from ?? [])].filter(
        (id): id is string => typeof id === 'string' && id.length > 0 && !id.startsWith('$RCAnonymousID'),
      ),
    );
    try {
      for (const uid of ids) {
        // Only update users that exist; never create profile docs from a webhook.
        const snap = await getFirestore().collection('users').doc(uid).get();
        if (snap.exists) await writeProStatus(uid);
      }
      res.status(200).send('ok');
    } catch (err) {
      logger.error('revenueCatWebhook failed', err);
      // Non-2xx makes RevenueCat retry later.
      res.status(500).send('error');
    }
  },
);
