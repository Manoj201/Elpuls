import { useTranslation } from 'react-i18next';
import { setLanguage } from '../i18n';
import styles from './LanguageSwitcher.module.css';

const LANGUAGES = [
  { code: 'sv', label: 'SV' },
  { code: 'en', label: 'EN' },
] as const;

export function LanguageSwitcher() {
  const { i18n } = useTranslation();

  return (
    <div className={styles.switcher}>
      {LANGUAGES.map(({ code, label }) => (
        <button
          key={code}
          type="button"
          className={`${styles.option} ${i18n.language === code ? styles.active : ''}`}
          onClick={() => setLanguage(code)}
          aria-pressed={i18n.language === code}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
