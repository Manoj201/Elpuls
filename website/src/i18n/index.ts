import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import sv from './locales/sv.json';

const STORAGE_KEY = 'elpuls-website-language';

function getStoredLanguage(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'en' || stored === 'sv' ? stored : 'sv';
  } catch {
    return 'sv';
  }
}

export function setLanguage(language: 'sv' | 'en') {
  i18n.changeLanguage(language);
  try {
    localStorage.setItem(STORAGE_KEY, language);
  } catch {
    // Best-effort only — private browsing etc. shouldn't break the switch.
  }
}

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    sv: { translation: sv },
  },
  lng: getStoredLanguage(),
  fallbackLng: 'sv',
  interpolation: { escapeValue: false },
});

document.documentElement.lang = i18n.language;
i18n.on('languageChanged', (language) => {
  document.documentElement.lang = language;
});

export default i18n;
