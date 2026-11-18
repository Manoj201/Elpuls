import { useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { AppliancePreset } from '../config/appliances';
import type { HourlyPrice } from '../providers/types';
import { firestorePriceProvider } from '../providers/firestore/prices';
import { dateKeyOf, estimateDaySaving, householdKey } from '../lib/savings';

/**
 * Past days never change, so each day's estimate is kept on the phone
 * (keyed by zone, date and household): a month costs at most ~30 small
 * price reads once, then one new read a day.
 */
interface SavingsCacheState {
  days: Record<string, number>;
  put: (entries: Record<string, number>) => void;
}

const KEEP_DAYS = 62;

const useSavingsCache = create<SavingsCacheState>()(
  persist(
    (set) => ({
      days: {},
      put: (entries) =>
        set((state) => {
          const cutoff = dateKeyOf(new Date(Date.now() - KEEP_DAYS * 86400000));
          const days: Record<string, number> = {};
          for (const [k, v] of Object.entries({ ...state.days, ...entries })) {
            if (k.split('|')[1] >= cutoff) days[k] = v;
          }
          return { days };
        }),
    }),
    { name: 'elpuls-savings-cache', version: 1, storage: createJSONStorage(() => AsyncStorage) },
  ),
);

export interface MonthlySavings {
  /** kr this month so far, today included once its prices are in. */
  monthTotal: number;
  today: number | null;
  /** Days counted (from the 1st, or from the day the user started). */
  days: number;
  isLoading: boolean;
  /** One entry per calendar day of the month: kr, or null for days not counted (before the user started, or still to come). */
  daily: (number | null)[];
  /** Index of today in `daily`. */
  todayIndex: number;
  /** True when counting started after the 1st (the user joined this month). */
  startedThisMonth: boolean;
}

function daysInMonthOf(todayKey: string): number {
  const [y, m] = todayKey.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Calendar days of this month up to and including today (Stockholm), from `startMs` at the earliest. */
function monthDays(now: Date, startMs: number | null): string[] {
  const todayKey = dateKeyOf(now);
  const firstKey = `${todayKey.slice(0, 8)}01`;
  const startKey = startMs ? dateKeyOf(new Date(startMs)) : firstKey;
  const from = startKey > firstKey ? startKey : firstKey;
  const keys: string[] = [];
  // Step by whole days at noon UTC so DST never skips or repeats a date.
  for (let d = new Date(`${from}T12:00:00Z`); ; d = new Date(d.getTime() + 86400000)) {
    const key = d.toISOString().slice(0, 10);
    if (key > todayKey) break;
    keys.push(key);
  }
  return keys;
}

export function useMonthlySavings(
  zone: string | null,
  household: AppliancePreset[],
  todayPrices: HourlyPrice[],
  now: Date,
  startedAt: number | null,
): MonthlySavings {
  const cache = useSavingsCache((s) => s.days);
  const put = useSavingsCache((s) => s.put);
  const [failedSig, setFailedSig] = useState<string | null>(null);

  const hKey = householdKey(household);
  const todayKey = dateKeyOf(now);
  const days = useMemo(() => monthDays(now, startedAt), [todayKey, startedAt]); // eslint-disable-line react-hooks/exhaustive-deps
  const pastDays = days.filter((d) => d !== todayKey);
  const keyOf = (d: string) => `${zone}|${d}|${hKey}`;
  const missing = zone ? pastDays.filter((d) => cache[keyOf(d)] === undefined) : [];
  const missingSig = missing.join(',');

  useEffect(() => {
    if (!zone || missing.length === 0) return;
    let cancelled = false;
    Promise.all(
      missing.map(async (d) => {
        // Noon UTC is the same calendar day in Stockholm.
        const prices = await firestorePriceProvider.getPrices(zone, new Date(`${d}T12:00:00Z`));
        return [d, prices] as const;
      }),
    )
      .then((results) => {
        if (cancelled) return;
        const entries: Record<string, number> = {};
        for (const [d, prices] of results) {
          // A day with no stored prices counts as 0 (nothing to compare).
          entries[keyOf(d)] = prices.length ? estimateDaySaving(prices, household) : 0;
        }
        put(entries);
      })
      .catch((err) => {
        console.log('Savings: price history load failed', err);
        // Show what we have instead of spinning forever; retried when the
        // day, zone or household changes.
        if (!cancelled) setFailedSig(missingSig);
      });
    return () => {
      cancelled = true;
    };
  }, [zone, hKey, missingSig]); // eslint-disable-line react-hooks/exhaustive-deps

  const today = useMemo(
    () => (todayPrices.length ? estimateDaySaving(todayPrices, household) : null),
    [todayPrices, hKey], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const pastTotal = pastDays.reduce((s, d) => s + (cache[keyOf(d)] ?? 0), 0);
  const counted = new Set(days);
  const monthPrefix = todayKey.slice(0, 8);
  const daily = Array.from({ length: daysInMonthOf(todayKey) }, (_, i) => {
    const key = `${monthPrefix}${String(i + 1).padStart(2, '0')}`;
    if (!counted.has(key)) return null;
    if (key === todayKey) return today;
    return cache[keyOf(key)] ?? null;
  });
  return {
    daily,
    todayIndex: Number(todayKey.slice(8)) - 1,
    startedThisMonth: days.length > 0 && days[0] !== `${monthPrefix}01`,
    monthTotal: pastTotal + (today ?? 0),
    today,
    days: today === null ? pastDays.length : days.length,
    isLoading: missing.length > 0 && failedSig !== missingSig,
  };
}
