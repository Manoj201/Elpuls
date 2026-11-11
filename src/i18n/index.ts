import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useUserStore } from '../stores/useUserStore';
import en from './locales/en.json';
import sv from './locales/sv.json';

export const SUPPORTED_LANGUAGES = ['en', 'sv'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

const LANGUAGE_STORAGE_KEY = 'elpuls.language';

function deviceLanguage(): SupportedLanguage {
  const tag = Localization.getLocales()[0]?.languageCode;
  return tag === 'sv' ? 'sv' : 'en';
}

/**
 * Resolves the language to boot with (persisted choice, else device
 * locale) and initializes i18next. Call once before rendering.
 */
export async function initI18n(): Promise<void> {
  const stored = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
  const initialLanguage: SupportedLanguage =
    stored === 'en' || stored === 'sv' ? stored : deviceLanguage();

  await i18next.use(initReactI18next).init({
    resources: { en: { translation: en }, sv: { translation: sv } },
    lng: initialLanguage,
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  });
}

// Best-effort — lets Cloud Functions (push notification copy) know which
// language to use. Mirrored onto both docs: `users/{uid}` is the general
// profile, `pushSubscriptions/{uid}` is what the zone-wide broadcast
// (sendExpoPushToZone) already fetches, so it can group-by-language without
// an extra Firestore read.
async function mirrorLanguageToFirestore(language: SupportedLanguage): Promise<void> {
  const uid = useUserStore.getState().uid;
  if (!uid) return;
  try {
    await Promise.all([
      setDoc(doc(db, 'users', uid), { language }, { merge: true }),
      setDoc(doc(db, 'pushSubscriptions', uid), { language }, { merge: true }),
    ]);
  } catch (err) {
    console.log('Failed to mirror language to Firestore:', err);
  }
}

export async function setLanguage(language: SupportedLanguage): Promise<void> {
  await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  await i18next.changeLanguage(language);
  await mirrorLanguageToFirestore(language);
}

/** Call once auth resolves, so a device-locale default (never explicitly chosen via setLanguage) still reaches Firestore. */
export async function syncCurrentLanguageToFirestore(): Promise<void> {
  await mirrorLanguageToFirestore(i18next.language as SupportedLanguage);
}

export default i18next;
