import styles from './GaugeGraphic.module.css';

/** A decorative recreation of the app's own price gauge (see the Overview screenshot) — SVG + CSS, no raster image. */
export function GaugeGraphic() {
  return (
    <svg viewBox="0 0 200 120" className={styles.gauge} aria-hidden="true">
      <defs>
        <linearGradient id="gaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#2dd4bf" />
          <stop offset="55%" stopColor="#7c5cff" />
          <stop offset="100%" stopColor="#ffb300" />
        </linearGradient>
      </defs>

      <path
        d="M 20 100 A 80 80 0 0 1 180 100"
        fill="none"
        stroke="url(#gaugeGrad)"
        strokeWidth="14"
        strokeLinecap="round"
      />

      <g className={styles.needle}>
        <line x1="100" y1="100" x2="100" y2="32" stroke="#f4f2fb" strokeWidth="3" strokeLinecap="round" />
      </g>
      <circle cx="100" cy="100" r="7" fill="#f4f2fb" />
    </svg>
  );
}
