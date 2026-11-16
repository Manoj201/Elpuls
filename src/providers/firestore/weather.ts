import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import type { HourlyForecast, WeatherProvider } from '../types';

/**
 * Weather forecast from our own backend: weather/SE-{zone}, refreshed by the
 * fetchWeather Cloud Function (06, 12, 18) at the zone's reference point.
 * The app never calls the weather service directly.
 */
export const firestoreWeatherProvider: WeatherProvider = {
  async getForecast(zone: string): Promise<HourlyForecast[]> {
    const snap = await getDoc(doc(db, 'weather', `SE-${zone}`));
    const hours = snap.data()?.hours as { hour: string; tempC: number; windMs: number; cloudCoverPct: number }[] | undefined;
    if (!snap.exists() || !Array.isArray(hours)) return [];
    return hours.map((h) => ({
      hour: new Date(h.hour),
      tempC: Number(h.tempC),
      windMs: Number(h.windMs),
      cloudCoverPct: Number(h.cloudCoverPct),
    }));
  },
};
