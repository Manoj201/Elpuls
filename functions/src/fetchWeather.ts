import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';

// One representative city per Swedish price zone, used to approximate
// zone-level weather until per-user location forecasts are added.
const ZONE_REFERENCE_POINTS: Record<string, { lat: number; lon: number }> = {
  SE1: { lat: 65.5848, lon: 22.1567 }, // Luleå
  SE2: { lat: 62.3908, lon: 17.3069 }, // Sundsvall
  SE3: { lat: 59.3293, lon: 18.0686 }, // Stockholm
  SE4: { lat: 55.605, lon: 13.0038 }, // Malmö
};

interface Snow1gTimeSeriesEntry {
  time: string;
  data: {
    air_temperature: number;
    wind_speed: number;
    cloud_area_fraction: number;
  };
}

interface Snow1gResponse {
  timeSeries: Snow1gTimeSeriesEntry[];
}

function buildUrl(lat: number, lon: number): string {
  return `https://opendata-download-metfcst.smhi.se/api/category/snow1g/version/1/geotype/point/lon/${lon}/lat/${lat}/data.json`;
}

/**
 * Scheduled a few times a day to refresh the weather forecast used for the
 * "why is it expensive" explainer and solar bonus hours. Stored in
 * Firestore so clients don't hit SMHI directly.
 */
export const fetchWeather = onSchedule(
  { schedule: '0 6,12,18 * * *', timeZone: 'Europe/Stockholm' },
  async () => {
    const db = getFirestore();

    for (const [zone, { lat, lon }] of Object.entries(ZONE_REFERENCE_POINTS)) {
      const response = await fetch(buildUrl(lat, lon));

      if (!response.ok) {
        logger.error(`Failed to fetch weather for ${zone}: ${response.status}`);
        continue;
      }

      const body = (await response.json()) as Snow1gResponse;

      await db
        .collection('weather')
        .doc(`SE-${zone}`)
        .set({
          zone,
          hours: body.timeSeries.map((entry) => ({
            hour: entry.time,
            tempC: entry.data.air_temperature,
            windMs: entry.data.wind_speed,
            cloudCoverPct: (entry.data.cloud_area_fraction / 8) * 100,
          })),
          fetchedAt: new Date().toISOString(),
        });

      logger.info(`Stored ${body.timeSeries.length} weather entries for ${zone}`);
    }
  },
);
