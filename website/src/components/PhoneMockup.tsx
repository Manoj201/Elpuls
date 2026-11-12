import type { ReactNode } from 'react';
import styles from './PhoneMockup.module.css';

/** A phone frame around either a real screenshot (`src`) or stylized CSS content (`children`). */
export function PhoneMockup({ label, src, children }: { label: string; src?: string; children?: ReactNode }) {
  return (
    <div className={styles.wrap}>
      <div className={styles.frame}>
        <div className={styles.notch} />
        {src ? (
          <img src={src} alt={label} className={styles.screenshot} />
        ) : (
          <div className={styles.screen}>{children}</div>
        )}
      </div>
      <span className={styles.label}>{label}</span>
    </div>
  );
}
