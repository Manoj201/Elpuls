/* eslint-disable */
/**
 * One-off: fill history/SE-{zone} with daily average prices from your own
 * computer, so the outlook can be built without the slow hourly backfill.
 *
 *   node scripts/importPriceHistory.js SE3 --from-dir /path/to/raw_SE3   # files named YYYY-MM-DD.json (elprisetjustnu format)
 *   node scripts/importPriceHistory.js SE1 --fetch                       # downloads, 1 request/second, newest first
 *   node scripts/importPriceHistory.js SE1 --from-firestore              # copies days already in our prices/ collection (no download)
 *
 * Writes with your gcloud application-default credentials to project "elpuls".
 * Only adds prices for days that don't have one; weather and existing days are
 * kept. Each batch is merged in a transaction, so it can't overwrite what the
 * hourly updatePriceHistories job writes at the same time.
 */
const fs = require('fs');
const path = require('path');
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const HISTORY_START = '2022-11-01';
const PAUSE_MS = 1000;
const BATCH = 50;

function addDays(dateKey, n) {
  const d = new Date(`${dateKey}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function average(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return Math.round((rows.reduce((s, r) => s + r.SEK_per_kWh, 0) / rows.length) * 100000) / 100000;
}

async function mergePrices(db, zone, prices) {
  const ref = db.collection('history').doc(`SE-${zone}`);
  let added = 0;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    let days = {};
    try {
      days = JSON.parse(snap.data()?.days ?? '{}');
    } catch {}
    for (const [d, p] of Object.entries(prices)) {
      if (days[d]?.p === undefined) {
        days[d] = { ...days[d], p };
        added++;
      }
    }
    tx.set(ref, { zone, days: JSON.stringify(days), updatedAt: new Date() }, { merge: true });
  });
  return added;
}

async function main() {
  const [zone, mode, dir] = process.argv.slice(2);
  if (!/^SE[1-4]$/.test(zone || '') || !['--from-dir', '--fetch', '--from-firestore'].includes(mode)) {
    console.log('Usage: node scripts/importPriceHistory.js SE3 --from-dir <dir> | SE1 --fetch | SE1 --from-firestore');
    process.exit(1);
  }
  initializeApp({ credential: applicationDefault(), projectId: 'elpuls' });
  const db = getFirestore();

  if (mode === '--from-dir') {
    const prices = {};
    for (const f of fs.readdirSync(dir)) {
      const date = f.replace('.json', '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      try {
        const p = average(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
        if (p !== null) prices[date] = p;
      } catch {}
    }
    const added = await mergePrices(db, zone, prices);
    console.log(`${zone}: read ${Object.keys(prices).length} days from files, added ${added} new.`);
    return;
  }

  if (mode === '--from-firestore') {
    // prices/SE-{zone}-{date} docs written by fetchPrices since launch.
    const snap = await db.collection('prices').where('zone', '==', zone).get();
    const prices = {};
    for (const doc of snap.docs) {
      const data = doc.data();
      const p = average((data.hours || []).map((h) => ({ SEK_per_kWh: h.price })));
      if (p !== null && typeof data.date === 'string') prices[data.date] = p;
    }
    // Only past days: history holds days up to yesterday.
    const today = new Date().toISOString().slice(0, 10);
    for (const d of Object.keys(prices)) if (d >= today) delete prices[d];
    const added = await mergePrices(db, zone, prices);
    console.log(`${zone}: ${Object.keys(prices).length} past days in prices/, added ${added} new.`);
    return;
  }

  // --fetch: newest first, gently, stop at the first 429/403.
  const yesterday = addDays(new Date().toISOString().slice(0, 10), -1);
  const snap = await db.collection('history').doc(`SE-${zone}`).get();
  let existing = {};
  try {
    existing = JSON.parse(snap.data()?.days ?? '{}');
  } catch {}
  const missing = [];
  for (let d = yesterday; d >= HISTORY_START; d = addDays(d, -1)) if (existing[d]?.p === undefined) missing.push(d);
  console.log(`${zone}: ${missing.length} days to fetch (about ${Math.round((missing.length * PAUSE_MS) / 60000)} min).`);

  let batch = {};
  let total = 0;
  for (const d of missing) {
    const [y, m, day] = d.split('-');
    // Network blips (Wi-Fi drop, sleep) are retried a few times instead of ending the run.
    let res = null;
    for (let attempt = 1; attempt <= 3 && !res; attempt++) {
      try {
        res = await fetch(`https://www.elprisetjustnu.se/api/v1/prices/${y}/${m}-${day}_${zone}.json`, {
          headers: { 'User-Agent': 'curl/8.0' },
        });
      } catch (err) {
        console.log(`${zone} ${d}: network error (${err.cause?.code || err.message}), retry ${attempt}/3…`);
        await new Promise((r) => setTimeout(r, 5000 * attempt));
      }
    }
    if (!res) {
      console.log(`${zone} ${d}: skipped after 3 network errors (run the script again later to fill it).`);
      continue;
    }
    if (res.status === 429 || res.status === 403) {
      console.log(`Stopped: price site said ${res.status}. Saving what we have; try again later.`);
      break;
    }
    if (res.ok) {
      const p = average(await res.json());
      if (p !== null) batch[d] = p;
    }
    if (Object.keys(batch).length >= BATCH) {
      total += await mergePrices(db, zone, batch);
      console.log(`${zone}: ${total} days saved…`);
      batch = {};
    }
    await new Promise((r) => setTimeout(r, PAUSE_MS));
  }
  if (Object.keys(batch).length) total += await mergePrices(db, zone, batch);
  console.log(`${zone}: done, ${total} days added.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
