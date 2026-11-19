import { useTranslation } from "react-i18next";
import { PhoneMockup } from "../components/PhoneMockup";
import { HeroPhoneSlider, screenshotLang } from "../components/HeroPhoneSlider";
import { GaugeGraphic } from "../components/GaugeGraphic";
import { Icon } from "../components/Icon";
import { Pipeline } from "../components/Pipeline";
import { Reveal, useCountUp, useInView } from "../components/motion";
import styles from "./Home.module.css";

/** No country code: Apple sends each visitor to their own store (Elpuls is sold in Sweden). */
export const APP_STORE_URL = "https://apps.apple.com/app/elpuls/id6834149193";

type Part = { label: string; value: number };
type ShowItem = { key: string; tier: "free" | "pro"; ai?: boolean; title: string; body: string; bullets: string[] };
type Notif = { time: string; title: string; body: string };
type Faq = { q: string; a: string };

export function AppStoreButton({ label, large = false }: { label: string; large?: boolean }) {
  return (
    <a
      href={APP_STORE_URL}
      className={`${styles.storeButton} ${large ? styles.storeButtonLarge : ""}`}
      target="_blank"
      rel="noopener noreferrer"
    >
      <Icon name="apple" size={large ? 26 : 22} filled />
      <span>{label}</span>
    </a>
  );
}

/* ---------- Hero ---------- */

function Hero() {
  const { t } = useTranslation();
  const trust = t("hero.trust", { returnObjects: true }) as string[];

  return (
    <section className={styles.hero}>
      <div className={styles.aurora} aria-hidden="true">
        <span className={styles.blobA} />
        <span className={styles.blobB} />
        <span className={styles.blobC} />
      </div>
      <div className={`container ${styles.heroGrid}`}>
        <div className={styles.heroText}>
          <p className={`${styles.eyebrow} ${styles.fadeUp}`}>
            <Icon name="sparkles" size={16} /> {t("hero.eyebrow")}
          </p>
          <h1 className={`${styles.heroTitle} ${styles.fadeUp}`} style={{ animationDelay: "80ms" }}>
            {t("hero.titlePre")} <span className={styles.gradientText}>{t("hero.titleHighlight")}</span>
          </h1>
          <p className={`${styles.heroSubtitle} ${styles.fadeUp}`} style={{ animationDelay: "160ms" }}>
            {t("hero.subtitle")}
          </p>
          <div className={`${styles.heroActions} ${styles.fadeUp}`} style={{ animationDelay: "240ms" }}>
            <AppStoreButton label={t("hero.ctaDownload")} />
            <a href="#how-it-works" className="button button-secondary">
              {t("hero.ctaSecondary")}
            </a>
          </div>
          <ul className={`${styles.trustRow} ${styles.fadeUp}`} style={{ animationDelay: "320ms" }}>
            {trust.map((item) => (
              <li key={item}>
                <Icon name="check" size={16} /> {item}
              </li>
            ))}
          </ul>
        </div>

        <div className={styles.heroVisual}>
          <HeroPhoneSlider alt={t("hero.phoneAlt")} />
          {/* Example cards beside the phone, never over the screenshot (decorative; the facts are in the text). */}
          <div className={styles.floatStack} aria-hidden="true">
            <div className={`${styles.floatCard} ${styles.floatPrice}`}>
              <span className={styles.floatLabel}>{t("hero.floatPriceLabel")}</span>
              <span className={styles.floatValue}>{t("hero.floatPriceValue")}</span>
              <span className={styles.floatSub}>{t("hero.floatPriceSub")}</span>
            </div>
            <div className={`${styles.floatCard} ${styles.floatNotif}`}>
              <span className={styles.notifIcon}>
                <img src="/icon.png" alt="" />
              </span>
              <span>
                <strong>{t("hero.floatNotifTitle")}</strong>
                <span className={styles.floatSub}>{t("hero.floatNotifBody")}</span>
              </span>
            </div>
            <div className={`${styles.floatCard} ${styles.floatSaving}`}>
              <Icon name="bolt" size={16} /> {t("hero.floatSaving")}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- Real price ---------- */

const PART_COLORS = ["var(--text-muted)", "var(--purple)", "#4f7bff", "#c084fc", "var(--teal)"];

function RealPrice() {
  const { t } = useTranslation();
  const parts = t("realPrice.parts", { returnObjects: true }) as Part[];
  const points = t("realPrice.points", { returnObjects: true }) as string[];
  const total = parts.reduce((s, p) => s + p.value, 0);
  const { ref, inView } = useInView<HTMLDivElement>(0.35);
  const shown = useCountUp(total, inView, 1600);
  const spot = parts[0]?.value ?? 0;

  return (
    <section className={styles.section} id="real-price">
      <div className={`container ${styles.split}`}>
        <Reveal className={styles.splitText}>
          <p className={styles.kicker}>{t("realPrice.eyebrow")}</p>
          <h2 className={styles.h2Left}>{t("realPrice.heading")}</h2>
          <p className={styles.lead}>{t("realPrice.body")}</p>
          <ul className={styles.checkList}>
            {points.map((p) => (
              <li key={p}>
                <span className={styles.checkDot}>
                  <Icon name="check" size={14} />
                </span>
                {p}
              </li>
            ))}
          </ul>
        </Reveal>

        <Reveal delay={120}>
          <div className={`${styles.exampleCard} ${inView ? styles.isBuilt : ""}`} ref={ref}>
            <div className={styles.exampleHead}>
              <span className={styles.exampleTag}>{t("realPrice.exampleTag")}</span>
              <p>{t("realPrice.exampleIntro")}</p>
            </div>

            <div className={styles.compareRow}>
              <span>{t("realPrice.spotLabel")}</span>
              <div className={styles.compareTrack}>
                <div className={styles.compareSpot} style={{ width: `${(spot / total) * 100}%` }} />
              </div>
              <strong>{spot}</strong>
            </div>
            <div className={styles.compareRow}>
              <span>{t("realPrice.totalLabel")}</span>
              <div className={styles.compareTrack}>
                {parts.map((p, i) => (
                  <div
                    key={p.label}
                    className={styles.segment}
                    style={{
                      width: `${(p.value / total) * 100}%`,
                      background: PART_COLORS[i],
                      transitionDelay: `${i * 220}ms`,
                    }}
                  />
                ))}
              </div>
              <strong>{shown}</strong>
            </div>

            <ul className={styles.legend}>
              {parts.map((p, i) => (
                <li key={p.label} style={{ transitionDelay: `${i * 220 + 200}ms` }}>
                  <span className={styles.swatch} style={{ background: PART_COLORS[i] }} />
                  <span>{p.label}</span>
                  <span className={styles.legendValue}>{p.value}</span>
                </li>
              ))}
            </ul>

            <div className={styles.totalRow}>
              <span>{t("realPrice.totalLabel")}</span>
              <span className={styles.totalValue}>
                {shown} <small>{t("realPrice.unit")}</small>
              </span>
            </div>
            <p className={styles.exampleNote}>{t("realPrice.note")}</p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ---------- How it works ---------- */

const STEP_ICONS = ["map", "camera", "bolt"];

function HowItWorks() {
  const { t } = useTranslation();
  const steps = t("how.steps", { returnObjects: true }) as { title: string; body: string }[];
  return (
    <section className={styles.section} id="how-it-works">
      <div className="container">
        <Reveal>
          <h2 className={styles.h2}>{t("how.heading")}</h2>
          <p className={styles.subtitle}>{t("how.subtitle")}</p>
        </Reveal>
        <ol className={styles.steps}>
          {steps.map((s, i) => (
            <Reveal as="li" key={s.title} delay={i * 140} className={styles.step}>
              <div className={styles.stepBadge}>
                <Icon name={STEP_ICONS[i]} size={22} />
                <span className={styles.stepNumber}>{i + 1}</span>
              </div>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ---------- Feature showcase ---------- */

function Showcase() {
  const { t, i18n } = useTranslation();
  const items = t("showcase.items", { returnObjects: true }) as ShowItem[];
  const lang = screenshotLang(i18n.language);
  return (
    <section className={styles.section} id="features">
      <div className="container">
        <Reveal>
          <h2 className={styles.h2}>{t("showcase.heading")}</h2>
          <p className={styles.subtitle}>{t("showcase.subtitle")}</p>
        </Reveal>
        <div className={styles.showList}>
          {items.map((item, i) => (
            <div key={item.key} className={`${styles.showRow} ${i % 2 ? styles.showRowFlip : ""}`}>
              <Reveal className={styles.showPhone} delay={80}>
                <div className={styles.phoneGlow} aria-hidden="true" />
                <PhoneMockup label={item.title} src={`/screenshots/${lang}/${item.key}.png`} hideLabel />
              </Reveal>
              <Reveal className={styles.showText} delay={180}>
                <div className={styles.chips}>
                  <span className={item.tier === "pro" ? styles.chipPro : styles.chipFree}>
                    {item.tier === "pro" ? t("showcase.pro") : t("showcase.free")}
                  </span>
                  {item.ai && (
                    <span className={styles.chipAi}>
                      <Icon name="sparkles" size={13} /> {t("showcase.ai")}
                    </span>
                  )}
                </div>
                <h3 className={styles.showTitle}>{item.title}</h3>
                <p className={styles.lead}>{item.body}</p>
                <ul className={styles.checkList}>
                  {item.bullets.map((b) => (
                    <li key={b}>
                      <span className={styles.checkDot}>
                        <Icon name="check" size={14} />
                      </span>
                      {b}
                    </li>
                  ))}
                </ul>
              </Reveal>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- Notifications ---------- */

function Notifications() {
  const { t } = useTranslation();
  const items = t("notifications.items", { returnObjects: true }) as Notif[];
  const points = t("notifications.points", { returnObjects: true }) as string[];
  return (
    <section className={`${styles.section} ${styles.notifSection}`}>
      <div className={`container ${styles.split}`}>
        <Reveal className={styles.splitText}>
          <p className={styles.kicker}>
            <Icon name="bell" size={16} /> {t("notifications.eyebrow")}
          </p>
          <h2 className={styles.h2Left}>{t("notifications.heading")}</h2>
          <p className={styles.lead}>{t("notifications.body")}</p>
          <ul className={styles.checkList}>
            {points.map((p) => (
              <li key={p}>
                <span className={styles.checkDot}>
                  <Icon name="check" size={14} />
                </span>
                {p}
              </li>
            ))}
          </ul>
        </Reveal>
        <div className={styles.notifStack}>
          <p className={styles.exampleTag}>{t("notifications.tag")}</p>
          {items.map((n, i) => (
            <Reveal key={n.title} delay={i * 260} className={styles.notifReveal}>
              <div className={styles.notif}>
                <span className={styles.notifIcon}>
                  <img src="/icon.png" alt="" />
                </span>
                <div className={styles.notifBody}>
                  <div className={styles.notifHead}>
                    <strong>Elpuls</strong>
                    <span>{n.time}</span>
                  </div>
                  <div className={styles.notifTitle}>{n.title}</div>
                  <p>{n.body}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- Trust ---------- */

function Trust() {
  const { t } = useTranslation();
  const items = t("trust.items", { returnObjects: true }) as { icon: string; title: string; body: string }[];
  return (
    <section className={styles.section}>
      <div className="container">
        <Reveal>
          <h2 className={styles.h2}>{t("trust.heading")}</h2>
          <p className={styles.subtitle}>{t("trust.subtitle")}</p>
        </Reveal>
        <div className={styles.trustGrid}>
          {items.map((item, i) => (
            <Reveal key={item.title} delay={i * 100} className={styles.trustCard}>
              <span className={styles.trustIcon}>
                <Icon name={item.icon} size={22} />
              </span>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- Pricing ---------- */

function Pricing() {
  const { t } = useTranslation();
  const free = t("pricing.free", { returnObjects: true }) as { name: string; price: string; unit: string; features: string[] };
  const proList = t("pro.list", { returnObjects: true }) as string[];
  return (
    <section className={styles.section} id="pro">
      <div className="container">
        <Reveal>
          <h2 className={styles.h2}>{t("pricing.heading")}</h2>
          <p className={styles.subtitle}>{t("pricing.subtitle")}</p>
        </Reveal>
        <div className={styles.priceGrid}>
          <Reveal className={styles.planCard}>
            <h3 className={styles.planName}>{free.name}</h3>
            <div className={styles.planPrice}>
              {free.price} <small>{free.unit}</small>
            </div>
            <ul className={styles.checkList}>
              {free.features.map((f) => (
                <li key={f}>
                  <span className={styles.checkDot}>
                    <Icon name="check" size={14} />
                  </span>
                  {f}
                </li>
              ))}
            </ul>
            <a href={APP_STORE_URL} className={`button button-secondary ${styles.planButton}`} target="_blank" rel="noopener noreferrer">
              {t("pricing.cta")}
            </a>
          </Reveal>
          <Reveal delay={120} className={`${styles.planCard} ${styles.planPro}`}>
            <span className={styles.planBadge}>{t("pricing.proBadge")}</span>
            <h3 className={styles.planName}>{t("pricing.proName")}</h3>
            <div className={styles.planPrice}>
              {t("pricing.proPrice")} <small>{t("pricing.proUnit")}</small>
            </div>
            <ul className={styles.checkList}>
              {proList.map((f) => (
                <li key={f}>
                  <span className={`${styles.checkDot} ${styles.checkDotPro}`}>
                    <Icon name="check" size={14} />
                  </span>
                  {f}
                </li>
              ))}
            </ul>
            <a href={APP_STORE_URL} className={`button button-primary ${styles.planButton}`} target="_blank" rel="noopener noreferrer">
              {t("pricing.cta")}
            </a>
            <p className={styles.planNote}>{t("pricing.proTrial")}</p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* ---------- FAQ ---------- */

function FaqSection() {
  const { t } = useTranslation();
  const items = t("faq.items", { returnObjects: true }) as Faq[];
  return (
    <section className={styles.section} id="faq">
      <div className={`container ${styles.faqWrap}`}>
        <Reveal>
          <h2 className={styles.h2}>{t("faq.heading")}</h2>
        </Reveal>
        <div className={styles.faqList}>
          {items.map((item, i) => (
            <Reveal key={item.q} delay={i * 60}>
              <details className={styles.faqItem}>
                <summary>
                  <span>{item.q}</span>
                  <span className={styles.faqChevron}>
                    <Icon name="chevron" size={20} />
                  </span>
                </summary>
                <p>{item.a}</p>
              </details>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- Final call to action ---------- */

function FinalCta() {
  const { t } = useTranslation();
  return (
    <section className={styles.ctaSection} id="download">
      <div className={styles.ctaGlow} aria-hidden="true" />
      <div className="container">
        <Reveal>
          <GaugeGraphic />
          <h2 className={styles.h2}>{t("cta.heading")}</h2>
          <p className={styles.subtitle}>{t("cta.subtitle")}</p>
          <div className={styles.ctaBadges}>
            <AppStoreButton label={t("cta.appStore")} large />
            <span className={styles.badgeSoon}>{t("cta.googlePlay")}</span>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export function Home() {
  return (
    <>
      <Hero />
      <RealPrice />
      <HowItWorks />
      <Pipeline />
      <Showcase />
      <Notifications />
      <Trust />
      <Pricing />
      <FaqSection />
      <FinalCta />
    </>
  );
}
