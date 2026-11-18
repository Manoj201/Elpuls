/**
 * One-off: re-checks every users/{uid} marked isProSubscriber == true with
 * RevenueCat, the same check as functions/src/proStatus.ts. Needed once
 * after 2026-11-17: before that the app wrote the field itself, so old
 * values were never verified (and expired sandbox testers still counted).
 *
 *   node scripts/verifyProStatus.js           look only, prints what would change
 *   node scripts/verifyProStatus.js --write   writes the verified status
 *
 * Auth: gcloud application-default credentials for Firestore; the RevenueCat
 * secret key from REVENUECAT_SECRET_KEY, or else read from Secret Manager
 * with `gcloud secrets versions access`.
 */
const { execSync } = require('child_process');
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const WRITE = process.argv.includes('--write');
const PROJECT = 'elpuls';

function secretKey() {
  if (process.env.REVENUECAT_SECRET_KEY) return process.env.REVENUECAT_SECRET_KEY;
  return execSync(`gcloud secrets versions access latest --secret=REVENUECAT_SECRET_KEY --project=${PROJECT}`, {
    encoding: 'utf8',
  }).trim();
}

async function fetchProStatus(key, uid) {
  const res = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(uid)}`, {
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`RevenueCat ${res.status}: ${await res.text()}`);
  const body = await res.json();
  const ent = body.subscriber?.entitlements?.pro;
  if (!ent) return { isPro: false, expiresAtMs: null };
  const expiresAtMs = ent.expires_date ? Date.parse(ent.expires_date) : null;
  return { isPro: expiresAtMs === null || expiresAtMs > Date.now(), expiresAtMs };
}

async function main() {
  initializeApp({ credential: applicationDefault(), projectId: PROJECT });
  const db = getFirestore();
  const key = secretKey();
  const snap = await db.collection('users').where('isProSubscriber', '==', true).get();
  console.log(`${snap.size} users marked Pro. ${WRITE ? 'Writing verified status.' : 'Look-only mode (add --write to save).'}`);

  let stillPro = 0;
  let notPro = 0;
  for (const doc of snap.docs) {
    const { isPro, expiresAtMs } = await fetchProStatus(key, doc.id);
    const until = expiresAtMs ? new Date(expiresAtMs).toISOString().slice(0, 16).replace('T', ' ') : '-';
    console.log(`${doc.id.slice(0, 6)}…  ${isPro ? 'PRO    ' : 'not Pro'}  expires ${until}`);
    if (isPro) stillPro++;
    else notPro++;
    if (WRITE) {
      await doc.ref.set(
        { isProSubscriber: isPro, proExpiresAt: expiresAtMs, proCheckedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  console.log(`Done: ${stillPro} still Pro, ${notPro} not Pro.`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
