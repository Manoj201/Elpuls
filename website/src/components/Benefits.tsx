import styles from './Benefits.module.css';

const BENEFITS = [
  {
    icon: '💰',
    title: 'Save real money',
    body: 'See the exact cost before you run anything — not just a vague tip to "use power off-peak."',
  },
  {
    icon: '🔌',
    title: 'No hardware, no switching',
    body: 'Works with any electricity contract and any appliance you already own. No smart plugs, no new retailer.',
  },
  {
    icon: '🧠',
    title: "Understand why, not just what",
    body: 'A plain-language reason behind every price swing, linked to real weather — not just a raw number.',
  },
  {
    icon: '🔔',
    title: 'Alerts on your terms',
    body: 'Set your own price-spike threshold and get notified about the prices that actually matter to you.',
  },
] as const;

export function Benefits() {
  return (
    <section id="benefits" className={styles.section}>
      <div className="container">
        <h2 className={styles.heading}>Why Elpuls</h2>
        <p className={styles.subtitle}>Every other price app shows a number. Elpuls turns it into money saved.</p>

        <div className={styles.grid}>
          {BENEFITS.map((b, i) => (
            <div key={b.title} className={styles.card}>
              <div className={styles.node} style={{ animationDelay: `${i * 0.9}s` }}>
                <span className={styles.icon}>{b.icon}</span>
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
