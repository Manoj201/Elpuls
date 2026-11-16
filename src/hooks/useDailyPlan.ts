import { useEffect, useState } from 'react';
import { useRetryWhileMissing, useStockholmDay } from './useNow';
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
  windows: PlanWindow[];
  flatDay: boolean;
  /** The day's AI summary in the app language, or null if it couldn't be written. */
  text: string | null;
}

interface DailyPlanState {
  today: DailyPlan | null;
  tomorrow: DailyPlan | null;
  isLoading: boolean;
}

const stockholmDateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Stockholm' });

/**
 * Reads "Din plan" for today and tomorrow from plans/SE-{zone}-{date}
 * (written by functions/src/dailyPlan.ts when a day's prices are published;
 * tomorrow's exists from about 13:30). Same pattern as useExplainer.
 */
export function useDailyPlan(zone: string, enabled: boolean): DailyPlanState {
  const { i18n } = useTranslation();
  const language = i18n.language as SupportedLanguage;
  const [state, setState] = useState<DailyPlanState>({ today: null, tomorrow: null, isLoading: enabled });

  // Reload when the Swedish date changes (the app may stay open past midnight).
  const day = useStockholmDay();
  // Tomorrow's plan is written when tomorrow's prices arrive (~13:30), so reload then too.
  const tomorrowReady = usePriceStore((s) => s.tomorrowPrices.length > 0);
  // The plan is written a little after the prices (AI summary), so if it's still missing, look again on each clock tick.
  const retry = useRetryWhileMissing(enabled && !state.isLoading && (state.today === null || (tomorrowReady && state.tomorrow === null)));
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
      const text = language === 'sv' ? (data.text_sv ?? data.text_en) : (data.text_en ?? data.text_sv);
      return {
        dateKey,
        flatDay: Boolean(data.flatDay),
        text: typeof text === 'string' && text.trim() ? text : null,
        windows: (data.windows as { activity: PlanActivity; start: string; end: string; averagePrice: number }[]).map((w) => ({
          activity: w.activity,
          start: new Date(w.start),
          end: new Date(w.end),
          averagePrice: Number(w.averagePrice) || 0,
        })),
      };
    }

    (async () => {
      try {
        const now = new Date();
        const tomorrow = new Date(now.getTime() + 24 * 3600 * 1000);
        const [today, next] = await Promise.all([
          read(stockholmDateFormatter.format(now)),
          read(stockholmDateFormatter.format(tomorrow)),
        ]);
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
