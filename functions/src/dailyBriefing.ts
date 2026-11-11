import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';
import { findExtremeHours, type PriceHour } from './priceUtils';
import { findWeatherPrepTip, type WeatherHour } from './weatherPrep';
import { findHeatingPlan } from './heatingPlan';
import { sendExpoPushToUid } from './sendPriceNotifications';
import {
  APPLIANCE_NOTE_COPY,
  DAILY_BRIEFING_TITLE,
  HEATING_PLAN_COPY,
  PRICE_RECAP_COPY,
  WEATHER_TIP_COPY,
  resolveServerLanguage,
} from './pushCopy';

const SWEDISH_ZONES = ['SE1', 'SE2', 'SE3', 'SE4'];

const stockholmDateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Stockholm' });

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function hourLabel(iso: string): string {
  const hour = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Stockholm', hour: 'numeric', hourCycle: 'h23' }).format(new Date(iso));
  return `${pad(Number(hour))}:00`;
}

/**
 * One push per day for Pro subscribers, combining already-computed data —
 * no new LLM call (CLAUDE.md §5's near-zero-cost architecture). Runs 10
 * minutes after generateExplainer (0 7 * * *) so that day's explainer doc
 * is guaranteed to exist first.
 */
export const sendDailyBriefings = onSchedule({ schedule: '10 7 * * *', timeZone: 'Europe/Stockholm' }, async () => {
  const db = getFirestore();
  const todayDateKey = stockholmDateFormatter.format(new Date());
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowDateKey = stockholmDateFormatter.format(tomorrow);

  for (const zone of SWEDISH_ZONES) {
    const [priceSnap, explainerSnap, weatherSnap] = await Promise.all([
      db.collection('prices').doc(`SE-${zone}-${todayDateKey}`).get(),
      db.collection('explainers').doc(`SE-${zone}-${todayDateKey}`).get(),
      db.collection('weather').doc(`SE-${zone}`).get(),
    ]);

    if (!priceSnap.exists) {
      logger.info(`No prices cached for ${zone} on ${todayDateKey}, skipping briefing.`);
      continue;
    }

    const hours = priceSnap.data()?.hours as PriceHour[];
    const { cheapest, priciest } = findExtremeHours(hours);
    const factors = (explainerSnap.data()?.factors as string[] | undefined) ?? [];
    const weatherHours = (weatherSnap.data()?.hours as WeatherHour[] | undefined) ?? [];
    const tipType = findWeatherPrepTip(weatherHours, todayDateKey, tomorrowDateKey);
    const heatingPlan = findHeatingPlan(hours);

    if (!cheapest || !priciest) {
      logger.info(`No usable price hours for ${zone} on ${todayDateKey}, skipping briefing.`);
      continue;
    }

    const subscriptions = await db.collection('pushSubscriptions').where('zone', '==', zone).get();

    for (const sub of subscriptions.docs) {
      const uid = sub.id;
      const userSnap = await db.collection('users').doc(uid).get();
      const user = userSnap.data();
      if (!user?.isProSubscriber) continue;

      const language = resolveServerLanguage(user?.language);

      const pendingSnap = await db
        .collection('pendingApplianceNotifications')
        .where('uid', '==', uid)
        .where('dateKey', '==', todayDateKey)
        .get();

      const clauses: string[] = [PRICE_RECAP_COPY[language](hourLabel(cheapest.hour), hourLabel(priciest.hour))];

      const heatingType = user?.heatingType as string | undefined;
      const heatingApplies = heatingType === 'electric' || heatingType === 'heat_pump';

      if (!pendingSnap.empty) {
        const label = pendingSnap.docs[0].data().applianceLabel as string;
        clauses.push(APPLIANCE_NOTE_COPY[language](label));
      } else if (heatingApplies && heatingPlan) {
        clauses.push(
          HEATING_PLAN_COPY[language](
            `${pad(heatingPlan.bankStartHour)}:00`,
            `${pad(heatingPlan.bankEndHour)}:00`,
            `${pad(heatingPlan.coastStartHour)}:00`,
            `${pad(heatingPlan.coastEndHour)}:00`,
          ),
        );
      } else if (tipType) {
        const copyKey = tipType === 'coldSnap' ? (user?.hasEv ? 'coldSnapEv' : 'coldSnapGeneric') : 'dryingWindow';
        clauses.push(WEATHER_TIP_COPY[language][copyKey]);
      } else if (factors.length > 0) {
        // factors are deterministic, English-only literals — not translated
        // yet, a known/deferred gap (see CLAUDE.md).
        clauses.push(factors.join(' · '));
      }

      await sendExpoPushToUid(db, uid, DAILY_BRIEFING_TITLE[language], clauses.join(' '), { zone, dateKey: todayDateKey });
    }
  }
});
