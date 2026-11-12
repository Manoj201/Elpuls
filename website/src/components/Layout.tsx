import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ScrollToHash } from './ScrollToHash';
import { LanguageSwitcher } from './LanguageSwitcher';
import styles from './Layout.module.css';

export function Layout({ children }: { children: ReactNode }) {
  const { t } = useTranslation();

  return (
    <>
      <ScrollToHash />

      <header className={styles.header}>
        <div className={`container ${styles.headerInner}`}>
          <Link to="/" className={styles.logo}>
            <img src="/icon.png" alt="" className={styles.logoIcon} />
            Elpuls
          </Link>
          <div className={styles.headerRight}>
            <nav className={styles.nav}>
              <Link to="/#features">{t('nav.features')}</Link>
              <Link to="/#pro">{t('nav.pro')}</Link>
              <Link to="/privacy">{t('nav.privacy')}</Link>
            </nav>
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      <main>{children}</main>

      <footer className={styles.footer}>
        <div className={`container ${styles.footerInner}`}>
          <span>&copy; {new Date().getFullYear()} Elpuls</span>
          <div className={styles.footerLinks}>
            <Link to="/privacy">{t('footer.privacyPolicy')}</Link>
          </div>
        </div>
      </footer>
    </>
  );
}
