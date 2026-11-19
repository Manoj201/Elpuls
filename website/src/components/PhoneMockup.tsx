import type { ReactNode } from 'react';
import styles from './PhoneMockup.module.css';

/** A phone frame around either a real screenshot (`src`) or stylized CSS content (`children`). */
export function PhoneMockup({
  label,
  src,
  children,
  hideLabel = false,
}: {
  label: string;
  src?: string;
  children?: ReactNode;
  /** Hide the caption under the phone (when a heading next to it already says the same). */
  hideLabel?: boolean;
}) {
  return (
    <div className={styles.wrap}>
      <div className={styles.frame}>
        <div className={styles.notch} />
        {src ? (
          <img src={src} alt={label} className={styles.screenshot} loading="lazy" decoding="async" />
        ) : (
          <div className={styles.screen}>{children}</div>
        )}
      </div>
      {!hideLabel && <span className={styles.label}>{label}</span>}
    </div>
  );
}
