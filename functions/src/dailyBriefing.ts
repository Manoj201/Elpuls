import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';
import { findExtremeHours, type PriceHour } from './priceUtils';
import { findWeatherPrepTip, type WeatherHour } from './weatherPrep';
import { sendExpoPushToUid } from './sendPriceNotifications';
import { isProUser } from './proStatus';
import { buildPlanWindows, localClock, type PlanWindow } from './dailyPlan';
import {
  APPLIANCE_NOTE_COPY,
  applianceName,
  DAILY_BRIEFING_TITLE,
  HEATING_PLAN_COPY,
  PRICE_RECAP_COPY,
  WEATHER_TIP_COPY,
  resolveServerLanguage,
} from './pushCopy';

const DAILY_PLAN_TITLE = { sv: 'Din plan idag', en: 'Your plan today' } as const;

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
    const [priceSnap, explainerSnap, weatherSnap, planSnap] = await Promise.all([
      db.collection('prices').doc(`SE-${zone}-${todayDateKey}`).get(),
      db.collection('explainers').doc(`SE-${zone}-${todayDateKey}`).get(),
      db.collection('weather').doc(`SE-${zone}`).get(),
      db.collection('plans').doc(`SE-${zone}-${todayDateKey}`).get(),
    ]);
    const plan = planSnap.data() as { windows?: PlanWindow[]; text_sv?: string | null; text_en?: string | null } | undefined;

    if (!priceSnap.exists) {
      logger.info(`No prices cached for ${zone} on ${todayDateKey}, skipping briefing.`);
      continue;
    }

    const hours = priceSnap.data()?.hours as PriceHour[];
    const { cheapest, priciest } = findExtremeHours(hours);
    const factors = (explainerSnap.data()?.factors as string[] | undefined) ?? [];
    const weatherHours = (weatherSnap.data()?.hours as WeatherHour[] | undefined) ?? [];
    const tipType = findWeatherPrepTip(weatherHours, todayDateKey, tomorrowDateKey);
    // Same heat-up / let-it-cool windows as Din plan (not the old fixed 06–09).
    const planWins = buildPlanWindows(hours);
    const bankWin = planWins.find((w) => w.activity === 'heatBank');
    const coastWin = planWins.find((w) => w.activity === 'heatCoast');

    if (!cheapest || !priciest) {
      logger.info(`No usable price hours for ${zone} on ${todayDateKey}, skipping briefing.`);
      continue;
    }

    const subscriptions = await db.collection('pushSubscriptions').where('zone', '==', zone).get();

    for (const sub of subscriptions.docs) {
      const uid = sub.id;
      try {
      const userSnap = await db.collection('users').doc(uid).get();
      const user = userSnap.data();
      if (!user || !isProUser(user)) continue;
      // Switched off in the app's Notiser screen (missing = on, for older profiles).
      if (user.notificationPrefs?.dailyBriefing === false) continue;

      const language = resolveServerLanguage(user?.language);

      // "Din plan" (section G): the day's AI summary plus this household's
      // first upcoming window. Falls back to the template below without a plan.
      const planText = plan ? (language === 'sv' ? plan.text_sv : plan.text_en) : null;
      if (planText) {
        const disabled = Array.isArray(user.disabledDefaultAppliances) ? (user.disabledDefaultAppliances as string[]) : [];
        const mine = ['washing_machine', 'dishwasher', 'dryer', ...(user.hasEv ? ['ev'] : [])].filter((id) => !disabled.includes(id));
        const next = (plan?.windows ?? [])
          .filter((w) => mine.includes(w.activity) && new Date(w.start).getTime() > Date.now())
          .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())[0];
        const name = next ? applianceName(language, next.activity) : '';
        const windowLine = next ? ` ${name.charAt(0).toUpperCase()}${name.slice(1)}: ${localClock(next.start)}–${localClock(next.end)}.` : '';
        await sendExpoPushToUid(db, uid, DAILY_PLAN_TITLE[language], `${planText}${windowLine}`, { zone, dateKey: todayDateKey });
        continue;
      }

      const pendingSnap = await db
        .collection('pendingApplianceNotifications')
        .where('uid', '==', uid)
        .where('dateKey', '==', todayDateKey)
        .get();

      const clauses: string[] = [PRICE_RECAP_COPY[language](hourLabel(cheapest.hour), hourLabel(priciest.hour))];

      const heatingType = user?.heatingType as string | undefined;
      const heatingApplies = heatingType === 'electric' || heatingType === 'heat_pump';

      // Only appliance pushes make a useful briefing line (not cheap-now / heat-ahead).
      const appliancePending = pendingSnap.docs.map((d) => d.data()).find((d) => !d.kind || d.kind === 'appliance');
      if (appliancePending) {
        const pending = appliancePending;
        clauses.push(APPLIANCE_NOTE_COPY[language](pending.applianceLabel as string, pending.windowStartClock as string | undefined));
      } else if (heatingApplies && bankWin && coastWin) {
        clauses.push(
          HEATING_PLAN_COPY[language](localClock(bankWin.start), localClock(bankWin.end), localClock(coastWin.start), localClock(coastWin.end)),
        );
      } else if (tipType) {
        const copyKey = tipType === 'coldSnap' ? (user?.hasEv ? 'coldSnapEv' : 'coldSnapGeneric') : 'dryingWindow';
        clauses.push(WEATHER_TIP_COPY[language][copyKey]);
      } else if (factors.length > 0 && language === 'en') {
        // The factor words are English-only; Swedish users just get the recap.
        // factors are deterministic, English-only literals — not translated
        // yet, a known/deferred gap (see CLAUDE.md).
        clauses.push(factors.join(' · '));
      }

      await sendExpoPushToUid(db, uid, DAILY_BRIEFING_TITLE[language], clauses.join(' '), { zone, dateKey: todayDateKey });
      } catch (err) {
        // One broken profile must not stop everyone else's briefing.
        logger.error(`Daily briefing failed for uid ${uid}: ${err}`);
      }
    }
  }
});
