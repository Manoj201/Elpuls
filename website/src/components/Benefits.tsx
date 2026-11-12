import { useTranslation } from 'react-i18next';
import styles from './Benefits.module.css';

const ICONS = ['💰', '🔌', '🧠', '🔔'] as const;

export function Benefits() {
  const { t } = useTranslation();
  const items = t('benefits.items', { returnObjects: true }) as { title: string; body: string }[];

  return (
    <section id="benefits" className={styles.section}>
      <div className="container">
        <h2 className={styles.heading}>{t('benefits.heading')}</h2>
        <p className={styles.subtitle}>{t('benefits.subtitle')}</p>

        <div className={styles.grid}>
          {items.map((b, i) => (
            <div key={b.title} className={styles.card}>
              <div className={styles.node} style={{ animationDelay: `${i * 0.9}s` }}>
                <span className={styles.icon}>{ICONS[i]}</span>
              </div>
              <h3 className={styles.title}>{b.title}</h3>
              <p className={styles.body}>{b.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
