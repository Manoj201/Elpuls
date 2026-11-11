import { create } from 'zustand';
import { useCountryStore } from './useCountryStore';
import type { HourlyPrice } from '../providers/types';

interface PriceState {
  todayPrices: HourlyPrice[];
  tomorrowPrices: HourlyPrice[];
  isLoading: boolean;
  error: string | null;
  fetchPrices: (zone: string) => Promise<void>;
}

export const usePriceStore = create<PriceState>((set) => ({
  todayPrices: [],
  tomorrowPrices: [],
  isLoading: false,
  error: null,
  fetchPrices: async (zone) => {
    set({ isLoading: true, error: null });
    try {
      const { config } = useCountryStore.getState();
      const today = new Date();
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const [todayPrices, tomorrowPrices] = await Promise.all([
        config.priceProvider.getPrices(zone, today),
        config.priceProvider.getPrices(zone, tomorrow),
      ]);

      set({ todayPrices, tomorrowPrices, isLoading: false });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err), isLoading: false });
    }
  },
}));
