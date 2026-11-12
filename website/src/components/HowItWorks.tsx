import styles from './HowItWorks.module.css';

const STEPS = [
  {
    icon: '⚡',
    title: 'Live spot price',
    body: 'elprisetjustnu.se (Nord Pool) for prices, SMHI for weather — fetched automatically for your zone.',
  },
  {
    icon: '✨',
    title: 'AI explains it',
    body: 'Claude reads the price and weather together and writes a plain-language reason why today looks the way it does.',
  },
  {
    icon: '📱',
    title: 'You decide',
    body: 'You see the price, the reason, and the best window — and act on it yourself. Elpuls never controls anything.',
  },
] as const;

const TRACK_POSITIONS = ['16.667%', '50%'];

export function HowItWorks() {
  return (
    <section id="how-it-works" className={styles.section}>
      <div className="container">
        <h2 className={styles.heading}>How it works</h2>
        <p className={styles.subtitle}>Price and weather data flow in, Claude explains it, you act on it.</p>

        <div className={styles.flow}>
          <div className={styles.nodesRow}>
            {STEPS.map((step, i) => (
              <div key={step.title} className={styles.nodeCol}>
                <div className={styles.node} style={{ animationDelay: `${i * 1.5}s` }}>
                  <span className={styles.icon}>{step.icon}</span>
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
            {STEPS.map((step) => (
              <div key={step.title} className={styles.textCol}>
                <h3 className={styles.title}>
                  <span className={styles.mobileIcon}>{step.icon}</span>
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
