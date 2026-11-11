import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { SupportedLanguage } from '../i18n';

interface ExplainerState {
  text: string | null;
  factors: string[];
  isLoading: boolean;
}

const stockholmDateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Stockholm' });

/**
 * Reads today's AI-generated price explainer for a zone from Firestore
 * (written once/day by the generateExplainer Cloud Function). This is the
 * app's first client-side Firestore read — unlike prices/weather (fetched
 * directly from public APIs), the explainer can only come from Firestore
 * since generating it requires a server-side LLM call.
 */
export function useExplainer(zone: string): ExplainerState {
  const { i18n } = useTranslation();
  const language = i18n.language as SupportedLanguage;
  const [state, setState] = useState<ExplainerState>({ text: null, factors: [], isLoading: true });

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, isLoading: true }));

    async function load() {
      try {
        const dateKey = stockholmDateFormatter.format(new Date());
        const snap = await getDoc(doc(db, 'explainers', `SE-${zone}-${dateKey}`));

        if (cancelled) return;

        if (!snap.exists()) {
          setState({ text: null, factors: [], isLoading: false });
          return;
        }

        const data = snap.data();
        // Falls back to whichever language exists if the requested one is
        // missing — mirrors src/i18n/index.ts's fallbackLng: 'en'.
        const text = language === 'sv' ? (data.text_sv ?? data.text_en) : (data.text_en ?? data.text_sv);
        setState({
          text: typeof text === 'string' ? text : null,
          factors: Array.isArray(data.factors) ? data.factors : [],
          isLoading: false,
        });
      } catch (err) {
        console.log('Failed to load explainer:', err);
        if (!cancelled) setState({ text: null, factors: [], isLoading: false });
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [zone, language]);

  return state;
}
