import { Link } from "react-router-dom";
import { PhoneMockup } from "../components/PhoneMockup";
import { HeroPhoneSlider } from "../components/HeroPhoneSlider";
import { GaugeGraphic } from "../components/GaugeGraphic";
import { HowItWorks } from "../components/HowItWorks";
import { Benefits } from "../components/Benefits";
import styles from "./Home.module.css";

function AppleIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 384 512"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <polygon points="5,3 5,21 21,12" />
    </svg>
  );
}

export function Home() {
  return (
    <>
      <section className={styles.hero}>
        <div className={`container ${styles.heroGrid}`}>
          <div className={styles.heroText}>
            <h1 className={styles.heroTitle}>
              Know when your electricity is <span>cheap</span>
            </h1>
            <p className={styles.heroSubtitle}>
              Elpuls shows live Swedish spot prices, explains why they move
              using weather data, and tells you when to run the dishwasher,
              charge the car, or bank some heat. No hardware, no provider
              switching.
            </p>
            <div className={styles.heroActions}>
              <Link to="/#how-it-works" className="button button-primary">
                See how it works
              </Link>
              <Link to="/#pro" className="button button-secondary">
                Elpuls Pro
              </Link>
            </div>
          </div>
          <div className={styles.heroPhoneCol}>
            <HeroPhoneSlider />
          </div>
        </div>
      </section>

      <HowItWorks />

      <Benefits />

      <section id="features" className={styles.section}>
        <div className="container">
          <h2 className={styles.sectionHeading}>
            Price, weather, and a reason why
          </h2>
          <p className={styles.sectionSubtitle}>
            Every other price app shows you a number. Elpuls explains it, and
            tells you what to do about it.
          </p>
          <div className={styles.featureGrid}>
            <div className={styles.featureCard}>
              <div className={styles.featureIcon}>⚡</div>
              <div className={styles.featureTitle}>Live spot prices</div>
              <div className={styles.featureBody}>
                Today and tomorrow's prices for your zone (SE1–SE4), straight
                from Nord Pool, with the cheapest and priciest hour highlighted.
              </div>
            </div>
            <div className={styles.featureCard}>
              <div className={styles.featureIcon}>🌦️</div>
              <div className={styles.featureTitle}>AI price explainer</div>
              <div className={styles.featureBody}>
                A plain-language reason why today's prices look the way they do,
                linked to actual weather conditions in your zone.
              </div>
            </div>
            <div className={styles.featureCard}>
              <div className={styles.featureIcon}>✅</div>
              <div className={styles.featureTitle}>
                Cost check before you start
              </div>
              <div className={styles.featureBody}>
                See the cost of running an appliance now versus waiting for the
                next cheap window, before you turn it on.
              </div>
            </div>
            <div className={styles.featureCard}>
              <div className={styles.featureIcon}>🔔</div>
              <div className={styles.featureTitle}>Alerts you set yourself</div>
              <div className={styles.featureBody}>
                Get notified when tomorrow's prices are published, when a price
                spike crosses your threshold, or when prices go negative.
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="pro" className={`${styles.section} ${styles.proSection}`}>
        <div className="container">
          <div className={styles.proGrid}>
            <div>
              <h2 className={`${styles.sectionHeading} ${styles.proHeading}`}>
                Elpuls Pro
              </h2>
              <p className={styles.proIntro}>
                For households that want to actively save, not just glance at a
                number.
              </p>
              <ul className={styles.proList}>
                <li>
                  <span className={styles.proCheck}>✓</span> AI price explainer,
                  every day
                </li>
                <li>
                  <span className={styles.proCheck}>✓</span> Solar bonus hours
                  for your own panels
                </li>
                <li>
                  <span className={styles.proCheck}>✓</span> Appliance
                  recommendations for everything you own
                </li>
                <li>
                  <span className={styles.proCheck}>✓</span> Heating plan — when
                  to bank heat, when to let it drift
                </li>
                <li>
                  <span className={styles.proCheck}>✓</span> Monthly cost
                  breakdown and zone comparison
                </li>
              </ul>
              <div className={styles.priceCard}>
                <div className={styles.priceAmount}>39 kr</div>
                <div className={styles.priceUnit}>/ month</div>
                <p className={styles.priceTrial}>
                  7-day free trial, cancel anytime.
                </p>
              </div>
            </div>
            <div className={styles.proVisual}>
              <PhoneMockup label="Overview" src="/screenshots/overview.png" />
            </div>
          </div>
        </div>
      </section>

      <section className={styles.ctaSection}>
        <div className="container">
          <GaugeGraphic />
          <h2 className={styles.sectionHeading}>Launching soon in Sweden</h2>
          <p className={styles.sectionSubtitle}>
            Elpuls isn't live in the App Store or Play Store yet.
          </p>
          <div className={styles.ctaBadges}>
            <span className={styles.badge}>
              <AppleIcon />
              App Store — coming soon
            </span>
            <span className={styles.badge}>
              <PlayIcon />
              Google Play — coming soon
            </span>
          </div>
        </div>
      </section>
    </>
  );
}
