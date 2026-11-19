import { Fragment, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from './Icon';
import { Reveal, useInView } from './motion';
import styles from './Pipeline.module.css';

type Node = { icon: string; tag: string; title: string; body: string; detail: string };

/** One step of the data pulse, in seconds. Node i lights up at i × STEP, the dot after it travels next. */
const STEP = 1.1;

/**
 * "Behind the scenes": Nord Pool + SMHI → our server → AI → the app, as a row
 * of cards joined by lines that a glowing data pulse travels along (a column
 * on phones). The loop only runs while the section is on screen, and not at
 * all with reduced motion (UI/UX Pro Max: motion conveys meaning, reduced-motion).
 */
export function Pipeline() {
  const { t } = useTranslation();
  const nodes = t('pipeline.nodes', { returnObjects: true }) as Node[];
  const { ref, inView } = useInView<HTMLDivElement>(0.25);
  const cycle = `${STEP * nodes.length + 1}s`;

  return (
    <section className={styles.section} id="how-elpuls-works">
      <div className="container">
        <Reveal>
          <p className={styles.kicker}>{t('pipeline.eyebrow')}</p>
          <h2 className={styles.heading}>{t('pipeline.heading')}</h2>
          <p className={styles.subtitle}>{t('pipeline.subtitle')}</p>
        </Reveal>

        <div ref={ref} className={`${styles.flow} ${inView ? styles.running : ''}`} style={{ '--cycle': cycle } as CSSProperties}>
          <ol className={styles.row}>
            {nodes.map((n, i) => (
              <Fragment key={n.title}>
                <li
                  className={`${styles.node} ${n.icon === 'sparkles' ? styles.nodeAi : ''}`}
                  style={{ '--d': `${i * STEP}s`, '--enter': `${i * 140}ms` } as CSSProperties}
                >
                  <div className={styles.card}>
                    <div className={styles.iconWrap}>
                      <span className={styles.ring} aria-hidden="true" />
                      <Icon name={n.icon} size={26} />
                    </div>
                    <span className={styles.tag}>{n.tag}</span>
                    <h3 className={styles.title}>{n.title}</h3>
                    <p className={styles.body}>{n.body}</p>
                    <p className={styles.detail}>
                      <Icon name="check" size={14} /> {n.detail}
                    </p>
                  </div>
                </li>
                {i < nodes.length - 1 && (
                  <li className={styles.link} aria-hidden="true" style={{ '--d': `${i * STEP + STEP * 0.45}s` } as CSSProperties}>
                    <span className={styles.line} />
                    <span className={styles.pulse} />
                  </li>
                )}
              </Fragment>
            ))}
          </ol>
        </div>

        <Reveal delay={200}>
          <p className={styles.note}>
            <Icon name="shield" size={16} /> {t('pipeline.note')}
          </p>
        </Reveal>
      </div>
    </section>
  );
}
