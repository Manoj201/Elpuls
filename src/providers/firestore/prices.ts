import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import type { HourlyPrice, PriceProvider } from '../types';

const stockholmDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Stockholm' });

/**
 * Prices from our own backend: prices/SE-{zone}-{YYYY-MM-DD}, written by the
 * fetchPrices / ensureTodayPrices Cloud Functions. The app never calls the
 * upstream price site itself, so it keeps working if that site is slow,
 * down or blocks a network, and every screen, push and plan uses the same
 * numbers. A missing doc means "not published yet" (e.g. tomorrow before ~13:00).
 */
export const firestorePriceProvider: PriceProvider = {
  async getPrices(zone: string, date: Date): Promise<HourlyPrice[]> {
    const snap = await getDoc(doc(db, 'prices', `SE-${zone}-${stockholmDate.format(date)}`));
    const hours = snap.data()?.hours as { hour: string; price: number }[] | undefined;
    if (!snap.exists() || !Array.isArray(hours)) return [];
    return hours
      .map((h) => ({ hour: new Date(h.hour), price: Number(h.price), currency: 'SEK' }))
      .sort((a, b) => a.hour.getTime() - b.hour.getTime());
  },
};
