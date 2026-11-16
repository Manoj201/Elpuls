import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';

const SWEDISH_ZONES = ['SE1', 'SE2', 'SE3', 'SE4'];
/** Weather older than this means fetchWeather has been failing. */
const WEATHER_MAX_AGE_HOURS = 3;
const stockholmDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Stockholm' });

/**
 * Watches the data every user depends on (the app reads prices and weather
 * only from Firestore). Logs one ERROR line starting with "DATA_HEALTH" per
 * problem, so a single Google Cloud log-based alert can email the developer:
 *  - today's prices missing (any time)
 *  - tomorrow's prices still missing at 15:30 or later
 *  - weather not refreshed for 3+ hours
 */
export const checkDataHealth = onSchedule(
  { schedule: '30 9,15,18,21,23 * * *', timeZone: 'Europe/Stockholm' },
  async () => {
    const db = getFirestore();
    const now = new Date();
    const today = stockholmDate.format(now);
    const tomorrow = stockholmDate.format(new Date(now.getTime() + 24 * 3600 * 1000));
    const stockholmHour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Stockholm', hour: 'numeric', hourCycle: 'h23' }).format(now));
    const problems: string[] = [];

    for (const zone of SWEDISH_ZONES) {
      const [todaySnap, tomorrowSnap, weatherSnap] = await Promise.all([
        db.collection('prices').doc(`SE-${zone}-${today}`).get(),
        db.collection('prices').doc(`SE-${zone}-${tomorrow}`).get(),
        db.collection('weather').doc(`SE-${zone}`).get(),
      ]);
      if (!todaySnap.exists) problems.push(`today's prices missing for ${zone} (${today})`);
      if (stockholmHour >= 15 && !tomorrowSnap.exists) problems.push(`tomorrow's prices still missing for ${zone} (${tomorrow})`);
      const fetchedAt = weatherSnap.data()?.fetchedAt as string | undefined;
      const ageHours = fetchedAt ? (now.getTime() - new Date(fetchedAt).getTime()) / 3600000 : Infinity;
      if (ageHours > WEATHER_MAX_AGE_HOURS) {
        problems.push(`weather for ${zone} is ${Number.isFinite(ageHours) ? `${Math.round(ageHours)} h` : 'missing'} old`);
      }
    }

    if (problems.length === 0) {
      logger.info('DATA_HEALTH ok');
      return;
    }
    for (const p of problems) logger.error(`DATA_HEALTH: ${p}`);
  },
);
