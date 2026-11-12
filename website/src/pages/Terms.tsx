import { useTranslation } from 'react-i18next';
import styles from './Privacy.module.css';

/**
 * Ported from the full draft at CLAUDE's Terms of Service doc
 * (https://claude.ai/artifact/Apxxhj3xYC7tys1g3EFqTQ). Edit that doc or
 * this file — whichever you touch, copy the change into the other so they
 * don't drift. Translated via src/i18n/locales/{en,sv}.json. Reuses
 * Privacy.module.css since the layout (prose + headings) is identical.
 */
export function Terms() {
  const { t } = useTranslation();

  return (
    <div className={styles.wrap}>
      <div className={`container ${styles.prose}`}>
        <h1>{t('terms.title')}</h1>
        <span className={styles.updated}>{t('terms.updated')}</span>

        <h2>{t('terms.acceptance.heading')}</h2>
        <p>{t('terms.acceptance.body')}</p>

        <h2>{t('terms.description.heading')}</h2>
        <p>{t('terms.description.body')}</p>

        <h2>{t('terms.eligibility.heading')}</h2>
        <p>{t('terms.eligibility.body')}</p>

        <h2>{t('terms.accounts.heading')}</h2>
        <p>{t('terms.accounts.body')}</p>

        <h2>{t('terms.subscription.heading')}</h2>
        <p>{t('terms.subscription.body')}</p>

        <h2>{t('terms.acceptableUse.heading')}</h2>
        <p>{t('terms.acceptableUse.body')}</p>

        <h2>{t('terms.noDeviceControl.heading')}</h2>
        <p>{t('terms.noDeviceControl.body')}</p>

        <h2>{t('terms.accuracy.heading')}</h2>
        <p>{t('terms.accuracy.body')}</p>

        <h2>{t('terms.ip.heading')}</h2>
        <p>{t('terms.ip.body')}</p>

        <h2>{t('terms.termination.heading')}</h2>
        <p>{t('terms.termination.body')}</p>

        <h2>{t('terms.liability.heading')}</h2>
        <p>{t('terms.liability.body')}</p>

        <h2>{t('terms.changes.heading')}</h2>
        <p>{t('terms.changes.body')}</p>

        <h2>{t('terms.law.heading')}</h2>
        <p>{t('terms.law.body')}</p>

        <h2>{t('terms.contact.heading')}</h2>
        <p>{t('terms.contact.body', { name: 'Manoj Gamachchige' })}</p>
      </div>
    </div>
  );
}
