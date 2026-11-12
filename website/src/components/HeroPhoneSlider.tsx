import frame from './PhoneMockup.module.css';
import styles from './HeroPhoneSlider.module.css';

const SLIDES = ['/screenshots/overview.png', '/screenshots/forecast.png', '/screenshots/stats.png'];
const CYCLE_SECONDS = 9;

/** Same phone frame as PhoneMockup, but crossfades between several screenshots on a CSS-only loop. */
export function HeroPhoneSlider() {
  return (
    <div className={frame.wrap}>
      <div className={frame.frame}>
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
