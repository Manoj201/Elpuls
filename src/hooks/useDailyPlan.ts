import { useEffect, useState } from 'react';
import { useNow, useRetryWhileMissing } from './useNow';
import { planDayKey } from '../lib/planRows';
import { usePriceStore } from '../stores/usePriceStore';
import { useTranslation } from 'react-i18next';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { SupportedLanguage } from '../i18n';

export type PlanActivity = 'washing_machine' | 'dishwasher' | 'dryer' | 'ev' | 'pool_heater' | 'heatBank' | 'heatCoast' | 'avoid';

export interface PlanWindow {
  activity: PlanActivity;
  start: Date;
  end: Date;
  /** SEK/kWh excl. VAT. */
  averagePrice: number;
}

export interface DailyPlan {
  dateKey: string;
  /** Day part (06:00–21:00): heating, avoid, daytime appliance suggestions. */
  windows: PlanWindow[];
  /** Tonight (21:00 → 06:00): added when the next day's prices arrive (~13:00). */
  nightWindows: PlanWindow[];
  nightReady: boolean;
  flatDay: boolean;
  /** The day's AI summary in the app language, or null if it couldn't be written. */
  text: string | null;
}

interface DailyPlanState {
  today: DailyPlan | null;
  tomorrow: DailyPlan | null;
  isLoading: boolean;
}

/**
 * Reads "Din plan" for today and tomorrow from plans/SE-{zone}-{date}
 * (functions/src/dailyPlan.ts). A plan day runs 06:00 → 06:00: before 06:00
 * "today" is still the previous day's plan (its night). The day part exists
 * from ~13:00 the day before; the night part from ~13:00 the same day.
 */
export function useDailyPlan(zone: string, enabled: boolean): DailyPlanState {
  const { i18n } = useTranslation();
  const language = i18n.language as SupportedLanguage;
  const [state, setState] = useState<DailyPlanState>({ today: null, tomorrow: null, isLoading: enabled });

  // Reload when the plan day changes (06:00), not at midnight.
  const day = planDayKey(useNow());
  // Tomorrow's plan and tonight's part are written when tomorrow's prices arrive (~13:00), so reload then too.
  const tomorrowReady = usePriceStore((s) => s.tomorrowPrices.length > 0);
  // Written a little after the prices (AI summary), so while something is still missing, look again on each clock tick.
  const retry = useRetryWhileMissing(
    enabled &&
      !state.isLoading &&
      (state.today === null || (tomorrowReady && (state.tomorrow === null || !state.today.nightReady))),
  );
  useEffect(() => {
    if (!enabled) {
      setState({ today: null, tomorrow: null, isLoading: false });
      return;
    }
    let cancelled = false;

    async function read(dateKey: string): Promise<DailyPlan | null> {
      const snap = await getDoc(doc(db, 'plans', `SE-${zone}-${dateKey}`));
      const data = snap.data();
      if (!snap.exists() || !data || !Array.isArray(data.windows)) return null;
      const toWindows = (list: unknown) =>
        (Array.isArray(list) ? (list as { activity: PlanActivity; start: string; end: string; averagePrice: number }[]) : []).map((w) => ({
          activity: w.activity,
          start: new Date(w.start),
          end: new Date(w.end),
          averagePrice: Number(w.averagePrice) || 0,
        }));
      const text = language === 'sv' ? (data.text_sv ?? data.text_en) : (data.text_en ?? data.text_sv);
      return {
        dateKey,
        flatDay: Boolean(data.flatDay),
        text: typeof text === 'string' && text.trim() ? text : null,
        windows: toWindows(data.windows),
        nightWindows: toWindows(data.nightWindows),
        nightReady: data.nightReady === true,
      };
    }

    (async () => {
      try {
        const now = new Date();
        const [today, next] = await Promise.all([read(planDayKey(now)), read(planDayKey(now, 1))]);
        if (!cancelled) setState({ today, tomorrow: next, isLoading: false });
      } catch (err) {
        console.log('Failed to load daily plan:', err);
        if (!cancelled) setState((s) => ({ ...s, isLoading: false }));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [zone, language, enabled, day, tomorrowReady, retry]);

  return state;
}
