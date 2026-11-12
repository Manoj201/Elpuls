import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
  const featureItems = t("features.items", { returnObjects: true }) as { title: string; body: string }[];
  const featureIcons = ["⚡", "🌦️", "✅", "🔔"] as const;
  const proList = t("pro.list", { returnObjects: true }) as string[];

  return (
    <>
      <section className={styles.hero}>
        <div className={`container ${styles.heroGrid}`}>
          <div className={styles.heroText}>
            <h1 className={styles.heroTitle}>
              {t("hero.titlePre")} <span>{t("hero.titleHighlight")}</span>
            </h1>
            <p className={styles.heroSubtitle}>{t("hero.subtitle")}</p>
            <div className={styles.heroActions}>
              <Link to="/#how-it-works" className="button button-primary">
                {t("hero.ctaPrimary")}
              </Link>
              <Link to="/#pro" className="button button-secondary">
                {t("hero.ctaSecondary")}
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
          <h2 className={styles.sectionHeading}>{t("features.heading")}</h2>
          <p className={styles.sectionSubtitle}>{t("features.subtitle")}</p>
          <div className={styles.featureGrid}>
            {featureItems.map((item, i) => (
              <div key={item.title} className={styles.featureCard}>
                <div className={styles.featureIcon}>{featureIcons[i]}</div>
                <div className={styles.featureTitle}>{item.title}</div>
                <div className={styles.featureBody}>{item.body}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="pro" className={`${styles.section} ${styles.proSection}`}>
        <div className="container">
          <div className={styles.proGrid}>
            <div>
              <h2 className={`${styles.sectionHeading} ${styles.proHeading}`}>
                {t("pro.heading")}
              </h2>
              <p className={styles.proIntro}>{t("pro.intro")}</p>
              <ul className={styles.proList}>
                {proList.map((item) => (
                  <li key={item}>
                    <span className={styles.proCheck}>✓</span> {item}
                  </li>
                ))}
              </ul>
              <div className={styles.priceCard}>
                <div className={styles.priceAmount}>39 kr</div>
                <div className={styles.priceUnit}>{t("pro.priceUnit")}</div>
                <p className={styles.priceTrial}>{t("pro.priceTrial")}</p>
              </div>
            </div>
            <div className={styles.proVisual}>
              <PhoneMockup label={t("pro.screenshotLabel")} src="/screenshots/overview.png" />
            </div>
          </div>
        </div>
      </section>

      <section className={styles.ctaSection}>
        <div className="container">
          <GaugeGraphic />
          <h2 className={styles.sectionHeading}>{t("cta.heading")}</h2>
          <p className={styles.sectionSubtitle}>{t("cta.subtitle")}</p>
          <div className={styles.ctaBadges}>
            <span className={styles.badge}>
              <AppleIcon />
              {t("cta.appStore")}
            </span>
            <span className={styles.badge}>
              <PlayIcon />
              {t("cta.googlePlay")}
            </span>
          </div>
        </div>
      </section>
    </>
  );
}
