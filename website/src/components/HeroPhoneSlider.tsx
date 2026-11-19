import { useTranslation } from 'react-i18next';
import frame from './PhoneMockup.module.css';
import styles from './HeroPhoneSlider.module.css';

/** App screenshots per website language (public/screenshots/{en,sv}/). */
const SLIDE_NAMES = ['overview', 'chart', 'coming-days', 'stats'];
const CYCLE_SECONDS = 12;

export function screenshotLang(language: string): 'sv' | 'en' {
  return language.startsWith('en') ? 'en' : 'sv';
}

/** Same phone frame as PhoneMockup, but crossfades between several screenshots on a CSS-only loop. */
export function HeroPhoneSlider({ alt = '' }: { alt?: string }) {
  const { i18n } = useTranslation();
  const lang = screenshotLang(i18n.language);
  const SLIDES = SLIDE_NAMES.map((name) => `/screenshots/${lang}/${name}.png`);
  return (
    <div className={frame.wrap}>
      <div className={frame.frame} role="img" aria-label={alt}>
        <div className={frame.notch} />
        <div className={styles.stack}>
          {SLIDES.map((src, i) => (
            <img
              key={src}
              src={src}
              alt=""
              className={`${frame.screenshot} ${styles.slide}`}
              style={{
                animationDuration: `${CYCLE_SECONDS}s`,
                animationDelay: `${(i * CYCLE_SECONDS) / SLIDES.length}s`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
