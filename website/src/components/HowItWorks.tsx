import { useTranslation } from 'react-i18next';
import styles from './HowItWorks.module.css';

const ICONS = ['⚡', '✨', '📱'] as const;
const TRACK_POSITIONS = ['16.667%', '50%'];

export function HowItWorks() {
  const { t } = useTranslation();
  const steps = t('howItWorks.steps', { returnObjects: true }) as { title: string; body: string }[];

  return (
    <section id="how-it-works" className={styles.section}>
      <div className="container">
        <h2 className={styles.heading}>{t('howItWorks.heading')}</h2>
        <p className={styles.subtitle}>{t('howItWorks.subtitle')}</p>

        <div className={styles.flow}>
          <div className={styles.nodesRow}>
            {steps.map((step, i) => (
              <div key={step.title} className={styles.nodeCol}>
                <div className={styles.node} style={{ animationDelay: `${i * 1.5}s` }}>
                  <span className={styles.icon}>{ICONS[i]}</span>
                </div>
              </div>
            ))}

            <div className={styles.trackLayer} aria-hidden="true">
              {TRACK_POSITIONS.map((left, i) => (
                <div key={left} className={styles.track} style={{ left }}>
                  <div className={styles.line} />
                  <div className={styles.dot} style={{ animationDelay: `${i * 1.5}s` }} />
                </div>
              ))}
            </div>
          </div>

          <div className={styles.textRow}>
            {steps.map((step, i) => (
              <div key={step.title} className={styles.textCol}>
                <h3 className={styles.title}>
                  <span className={styles.mobileIcon}>{ICONS[i]}</span>
                  {step.title}
                </h3>
                <p className={styles.body}>{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
