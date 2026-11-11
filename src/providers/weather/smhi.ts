import type { HourlyForecast, WeatherProvider } from '../types';

interface Snow1gTimeSeriesEntry {
  time: string;
  data: {
    air_temperature: number;
    wind_speed: number;
    cloud_area_fraction: number;
    [key: string]: number;
  };
}

interface Snow1gResponse {
  referenceTime: string;
  timeSeries: Snow1gTimeSeriesEntry[];
}

function buildUrl(lat: number, lon: number): string {
  return `https://opendata-download-metfcst.smhi.se/api/category/snow1g/version/1/geotype/point/lon/${lon}/lat/${lat}/data.json`;
}

/**
 * WeatherProvider for Sweden, backed by SMHI's open data API (no API key
 * required). Uses the "snow1g" category, which replaced the deprecated
 * "pmp3g" category on 2026-03-31. All times from SMHI are in UTC.
 */
export const smhiProvider: WeatherProvider = {
  async getForecast(lat: number, lon: number): Promise<HourlyForecast[]> {
    const response = await fetch(buildUrl(lat, lon));

    if (!response.ok) {
      throw new Error(`SMHI request failed: ${response.status} ${response.statusText}`);
    }

    const body: Snow1gResponse = await response.json();

    return body.timeSeries.map((entry) => ({
      hour: new Date(entry.time),
      tempC: entry.data.air_temperature,
      windMs: entry.data.wind_speed,
      // SMHI reports cloud_area_fraction in octas (0-8); convert to a percentage.
      cloudCoverPct: (entry.data.cloud_area_fraction / 8) * 100,
    }));
  },
};
