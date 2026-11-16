import { useEffect, useState } from 'react';
import { useRetryWhileMissing, useStockholmDay } from './useNow';
import { useTranslation } from 'react-i18next';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { SupportedLanguage } from '../i18n';

export interface OutlookDay {
  date: string;
  /** SEK/kWh excl. VAT, daily average. */
  mid: number;
  low: number;
  high: number;
  uncertain: boolean;
}

export interface SeasonalMonth {
  month: string;
  change: number;
  years: number;
}

export interface Outlook {
  /** The last days' real averages (SEK/kWh), oldest first; may be empty on older docs. */
  recent: { date: string; avg: number }[];
  /** Tomorrow's real average when the outlook was made. */
  tomorrowAvg: number | null;
  days: OutlookDay[];
  seasonal: SeasonalMonth[];
  show: boolean;
  hitRate: number;
  text: string | null;
}

const stockholmDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Stockholm' });

/**
 * Reads the 7-day + seasonal outlook (functions/src/priceOutlook.ts, written
 * daily at 15:00). Before today's exists, falls back to yesterday's and keeps
 * only days from the day after tomorrow on (tomorrow's real prices are known).
 */
export function useOutlook(zone: string, enabled: boolean): { outlook: Outlook | null; isLoading: boolean } {
  const { i18n } = useTranslation();
  const language = i18n.language as SupportedLanguage;
  const [state, setState] = useState<{ outlook: Outlook | null; isLoading: boolean; fromToday: boolean }>({
    outlook: null,
    isLoading: enabled,
    fromToday: false,
  });

  // Reload when the Swedish date changes (the app may stay open past midnight).
  const day = useStockholmDay();
  // Today's outlook is written ~15:00; until then we show yesterday's and look again on each clock tick.
  const retry = useRetryWhileMissing(enabled && !state.isLoading && !state.fromToday);
  useEffect(() => {
    if (!enabled) {
      setState({ outlook: null, isLoading: false, fromToday: false });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const now = new Date();
        const today = stockholmDate.format(now);
        const yesterday = stockholmDate.format(new Date(now.getTime() - 24 * 3600 * 1000));
        const dayAfterTomorrow = stockholmDate.format(new Date(now.getTime() + 2 * 24 * 3600 * 1000));
        let snap = await getDoc(doc(db, 'outlooks', `SE-${zone}-${today}`));
        const fromToday = snap.exists();
        if (!fromToday) snap = await getDoc(doc(db, 'outlooks', `SE-${zone}-${yesterday}`));
        const data = snap.data();
        if (cancelled) return;
        if (!snap.exists() || !data) {
          setState({ outlook: null, isLoading: false, fromToday: false });
          return;
        }
        const text = language === 'sv' ? (data.text_sv ?? data.text_en) : (data.text_en ?? data.text_sv);
        setState({
          isLoading: false,
          fromToday,
          outlook: {
            show: Boolean(data.show),
            recent: Array.isArray(data.recent) ? (data.recent as { date: string; avg: number }[]).filter((r) => r.date < today) : [],
            tomorrowAvg: typeof data.tomorrowAvg === 'number' ? data.tomorrowAvg : null,
            hitRate: Number(data.backtest?.hitRate ?? 0),
            text: typeof text === 'string' && text.trim() ? text : null,
            days: ((data.days ?? []) as OutlookDay[]).filter((d) => d.date >= dayAfterTomorrow),
            seasonal: (data.seasonal ?? []) as SeasonalMonth[],
          },
        });
      } catch (err) {
        console.log('Failed to load outlook:', err);
        if (!cancelled) setState((s) => ({ ...s, isLoading: false }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [zone, language, enabled, day, retry]);

  return { outlook: state.outlook, isLoading: state.isLoading };
}
