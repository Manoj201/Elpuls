import { create } from 'zustand';
import { useCountryStore } from './useCountryStore';
import type { HourlyForecast } from '../providers/types';

/** Same "fresh enough" window as prices: repeated mounts within it don't refetch. */
const FRESH_MS = 5 * 60 * 1000;

interface WeatherState {
  forecast: HourlyForecast[];
  isLoading: boolean;
  error: string | null;
  zone: string | null;
  /** When the last successful fetch finished (ms), for DataAutoRefresh. */
  fetchedAt: number | null;
  fetchForecast: (zone: string, options?: { force?: boolean }) => Promise<void>;
}

let latestRequest = 0;

export const useWeatherStore = create<WeatherState>((set, get) => ({
  forecast: [],
  isLoading: false,
  error: null,
  zone: null,
  fetchedAt: null,
  fetchForecast: async (zone, options) => {
    const state = get();
    if (!options?.force && state.zone === zone && state.fetchedAt !== null && Date.now() - state.fetchedAt < FRESH_MS) return;
    // A load for this zone is already running (e.g. app-level refresh + Home's mount): don't start a second one.
    if (state.isLoading && state.zone === zone) return;

    const request = ++latestRequest;
    if (state.zone !== zone) set({ forecast: [], zone, isLoading: true, error: null });
    else if (state.forecast.length === 0) set({ isLoading: true, error: null });

    try {
      const { config } = useCountryStore.getState();
      const forecast = await config.weatherProvider.getForecast(zone);
      if (request !== latestRequest) return;
      set({ forecast, zone, isLoading: false, error: null, fetchedAt: Date.now() });
    } catch (err) {
      if (request !== latestRequest) return;
      // Keep the old forecast on screen if a background refresh fails.
      set(get().forecast.length > 0 ? { isLoading: false } : { error: err instanceof Error ? err.message : String(err), isLoading: false });
    }
  },
}));
