import { create } from 'zustand';
import { useCountryStore } from './useCountryStore';
import type { HourlyForecast } from '../providers/types';

interface WeatherState {
  forecast: HourlyForecast[];
  isLoading: boolean;
  error: string | null;
  fetchForecast: (lat: number, lon: number) => Promise<void>;
}

export const useWeatherStore = create<WeatherState>((set) => ({
  forecast: [],
  isLoading: false,
  error: null,
  fetchForecast: async (lat, lon) => {
    set({ isLoading: true, error: null });
    try {
      const { config } = useCountryStore.getState();
      const forecast = await config.weatherProvider.getForecast(lat, lon);
      set({ forecast, isLoading: false });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err), isLoading: false });
    }
  },
}));
