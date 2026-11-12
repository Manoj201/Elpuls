import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ScrollToHash } from './ScrollToHash';
import styles from './Layout.module.css';

export function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      <ScrollToHash />

      <header className={styles.header}>
        <div className={`container ${styles.headerInner}`}>
          <Link to="/" className={styles.logo}>
            <img src="/icon.png" alt="" className={styles.logoIcon} />
            Elpuls
          </Link>
          <nav className={styles.nav}>
            <Link to="/#features">Features</Link>
            <Link to="/#pro">Pro</Link>
            <Link to="/privacy">Privacy</Link>
          </nav>
        </div>
      </header>

      <main>{children}</main>

      <footer className={styles.footer}>
        <div className={`container ${styles.footerInner}`}>
          <span>&copy; {new Date().getFullYear()} Elpuls</span>
          <div className={styles.footerLinks}>
            <Link to="/privacy">Privacy Policy</Link>
          </div>
        </div>
      </footer>
    </>
  );
}
