import { useTranslation } from "react-i18next";
import styles from "./Privacy.module.css";

/**
 * Ported from the full draft at CLAUDE's Privacy Policy doc
 * (https://claude.ai/artifact/D3FNoLC54UPgp1xkLPCQgk). Edit that doc or
 * this file — whichever you touch, copy the change into the other so they
 * don't drift. Translated via src/i18n/locales/{en,sv}.json.
 */
export function Privacy() {
  const { t } = useTranslation();

  const collectHeaders = t("privacy.dataWeCollect.tableHeaders", { returnObjects: true }) as string[];
  const collectRows = t("privacy.dataWeCollect.rows", { returnObjects: true }) as string[][];
  const useItems = t("privacy.howWeUse.items", { returnObjects: true }) as string[];
  const thirdPartyHeaders = t("privacy.thirdParties.tableHeaders", { returnObjects: true }) as string[];
  const thirdPartyRows = t("privacy.thirdParties.rows", { returnObjects: true }) as string[][];
  const retentionItems = t("privacy.retention.items", { returnObjects: true }) as { label: string; body: string }[];
  const rightsItems = t("privacy.rights.items", { returnObjects: true }) as { label: string; body: string }[];

  return (
    <div className={styles.wrap}>
      <div className={`container ${styles.prose}`}>
        <h1>{t("privacy.title")}</h1>
        <span className={styles.updated}>{t("privacy.updated")}</span>

        <h2>{t("privacy.overview.heading")}</h2>
        <p>{t("privacy.overview.p1")}</p>
        <p>{t("privacy.overview.p2")}</p>

        <h2>{t("privacy.dataWeCollect.heading")}</h2>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                {collectHeaders.map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {collectRows.map((row) => (
                <tr key={row[0]}>
                  {row.map((cell, i) => (
                    <td key={i}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>{t("privacy.dataWeCollect.note")}</p>

        <h2>{t("privacy.howWeUse.heading")}</h2>
        <ul>
          {useItems.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>{t("privacy.howWeUse.note")}</p>

        <h2>{t("privacy.thirdParties.heading")}</h2>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                {thirdPartyHeaders.map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {thirdPartyRows.map((row) => (
                <tr key={row[0]}>
                  {row.map((cell, i) => (
                    <td key={i}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className={styles.placeholder}>{t("privacy.thirdParties.note")}</p>

        <h2>{t("privacy.retention.heading")}</h2>
        <ul>
          {retentionItems.map((item) => (
            <li key={item.label}>
              <strong>{item.label}</strong>: {item.body}
            </li>
          ))}
        </ul>
        <p className={styles.placeholder}>{t("privacy.retention.note")}</p>

        <h2>{t("privacy.rights.heading")}</h2>
        <p>{t("privacy.rights.intro")}</p>
        <ul>
          {rightsItems.map((item) => (
            <li key={item.label}>
              <strong>{item.label}</strong> {item.body}
            </li>
          ))}
        </ul>
        <p>
          {t("privacy.rights.note")}{" "}
          <span className={styles.placeholder}>{t("privacy.rights.emailPlaceholder")}</span>.
        </p>

        <h2>{t("privacy.children.heading")}</h2>
        <p>{t("privacy.children.body")}</p>

        <h2>{t("privacy.transfers.heading")}</h2>
        <p>{t("privacy.transfers.body")}</p>
        <p className={styles.placeholder}>{t("privacy.transfers.note")}</p>

        <h2>{t("privacy.changes.heading")}</h2>
        <p>{t("privacy.changes.body")}</p>

        <h2>{t("privacy.contact.heading")}</h2>
        <p>{t("privacy.contact.body", { name: "Manoj Gamachchige" })}</p>
        <p className={styles.placeholder}>{t("privacy.contact.emailPlaceholder")}</p>
        <p>{t("privacy.contact.note")}</p>
      </div>
    </div>
  );
}
