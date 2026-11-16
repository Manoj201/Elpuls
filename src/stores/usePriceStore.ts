import { create } from 'zustand';
import { useCountryStore } from './useCountryStore';
import type { HourlyPrice } from '../providers/types';

const stockholmDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Stockholm' });

/** Screens call fetchPrices on mount; within this window, for the same zone and day, that's a no-op. */
const FRESH_MS = 5 * 60 * 1000;

interface PriceState {
  todayPrices: HourlyPrice[];
  tomorrowPrices: HourlyPrice[];
  /** True only while there's nothing to show yet (first load or a new zone). Background refreshes never set it. */
  isLoading: boolean;
  /** Only set when there's nothing to show; a failed background refresh keeps the old prices. */
  error: string | null;
  /** Zone and Swedish date the current prices belong to. */
  zone: string | null;
  dateKey: string | null;
  /** When the last successful fetch finished (ms), for the auto-refresh in DataAutoRefresh. */
  fetchedAt: number | null;
  /** force: skip the "fresh enough" check (Retry button, auto-refresh). */
  fetchPrices: (zone: string, options?: { force?: boolean }) => Promise<void>;
  /**
   * The Swedish date changed since the last fetch: yesterday's "tomorrow" is
   * today, so move it over right away (no network needed) instead of showing
   * yesterday's prices as today until the refetch lands. Older data is cleared.
   */
  rollOverDay: () => void;
}

// Each fetch gets a number; only the newest one may write, so a slow older
// response (e.g. for the zone you just switched away from) can't overwrite it.
let latestRequest = 0;
// A load already running for the same zone and day is shared, not repeated
// (the app-level refresh and a screen's mount can ask at the same moment).
let inflight: { key: string; promise: Promise<void> } | null = null;

export const usePriceStore = create<PriceState>((set, get) => ({
  todayPrices: [],
  tomorrowPrices: [],
  isLoading: false,
  error: null,
  zone: null,
  dateKey: null,
  fetchedAt: null,
  rollOverDay: () => {
    const s = get();
    const now = new Date();
    const today = stockholmDate.format(now);
    if (s.dateKey === null || s.dateKey === today) return;
    const yesterday = stockholmDate.format(new Date(now.getTime() - 24 * 3600 * 1000));
    if (s.dateKey === yesterday && s.tomorrowPrices.length > 0) {
      set({ todayPrices: s.tomorrowPrices, tomorrowPrices: [], dateKey: today });
    } else {
      set({ todayPrices: [], tomorrowPrices: [], dateKey: null, isLoading: true });
    }
  },
  fetchPrices: async (zone, options) => {
    const state = get();
    const todayKey = stockholmDate.format(new Date());
    const sameData = state.zone === zone && state.dateKey === todayKey && state.todayPrices.length > 0;
    if (!options?.force && sameData && state.fetchedAt !== null && Date.now() - state.fetchedAt < FRESH_MS) return;
    const key = `${zone}|${todayKey}`;
    if (inflight?.key === key) return inflight.promise;
    const promise = load(zone, todayKey);
    inflight = { key, promise };
    try {
      await promise;
    } finally {
      if (inflight?.promise === promise) inflight = null;
    }
  },
}));

async function load(zone: string, todayKey: string): Promise<void> {
  const { getState: get, setState: set } = usePriceStore;
  const state = get();
  const request = ++latestRequest;
  // Keep showing what we have while refreshing the same zone; a new zone starts empty.
  if (state.zone !== zone) {
    set({ todayPrices: [], tomorrowPrices: [], zone, dateKey: null, isLoading: true, error: null });
  } else if (state.todayPrices.length === 0) {
    set({ isLoading: true, error: null });
  }

  try {
    const { config } = useCountryStore.getState();
    const today = new Date();
    const tomorrow = new Date(today.getTime() + 24 * 3600 * 1000);
    const [todayPrices, tomorrowPrices] = await Promise.all([
      config.priceProvider.getPrices(zone, today),
      config.priceProvider.getPrices(zone, tomorrow),
    ]);
    if (request !== latestRequest) return;
    set({ todayPrices, tomorrowPrices, zone, dateKey: todayKey, isLoading: false, error: null, fetchedAt: Date.now() });
  } catch (err) {
    if (request !== latestRequest) return;
    // Background refresh failed: keep the prices on screen, try again later.
    if (get().todayPrices.length > 0) {
      set({ isLoading: false });
      return;
    }
    set({ error: err instanceof Error ? err.message : String(err), isLoading: false });
  }
}
