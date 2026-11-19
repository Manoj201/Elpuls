import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ScrollToHash } from './ScrollToHash';
import { LanguageSwitcher } from './LanguageSwitcher';
import { Icon } from './Icon';
import styles from './Layout.module.css';

const APP_STORE_URL = 'https://apps.apple.com/app/elpuls/id6834149193';

/** Home-page sections in the nav, in page order. */
const SECTIONS = [
  { id: 'features', key: 'nav.features' },
  { id: 'pro', key: 'nav.pro' },
  { id: 'faq', key: 'nav.faq' },
] as const;

/**
 * Scroll state: whether the page has moved, how far down it is (0–1), and
 * (home page only) which section is being read: the last one whose top has
 * passed 40 % of the window height, while its bottom is still below it.
 */
function useScroll(trackSections: boolean) {
  const [state, setState] = useState<{ scrolled: boolean; progress: number; active: string | null }>({
    scrolled: false,
    progress: 0,
    active: null,
  });
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const y = window.scrollY;
      let active: string | null = null;
      if (trackSections) {
        const line = window.innerHeight * 0.4;
        for (const s of SECTIONS) {
          const r = document.getElementById(s.id)?.getBoundingClientRect();
          if (r && r.top <= line && r.bottom > line) active = s.id;
        }
      }
      setState((prev) => {
        const next = { scrolled: y > 8, progress: max > 0 ? Math.min(1, y / max) : 0, active };
        return prev.scrolled === next.scrolled && prev.active === next.active && Math.abs(prev.progress - next.progress) < 0.002
          ? prev
          : next;
      });
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(raf);
    };
  }, [trackSections]);
  return state;
}

export function Layout({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const isHome = pathname === '/';
  const { scrolled, progress, active } = useScroll(isHome);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const firstMenuLink = useRef<HTMLAnchorElement>(null);

  // Close the menu on navigation.
  useEffect(() => setMenuOpen(false), [pathname]);

  // While the menu is open: Escape closes it, focus moves into it, the page doesn't scroll.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        menuButton.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    firstMenuLink.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [menuOpen]);

  // Close the menu if the window grows to desktop width.
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 861px)');
    const onChange = () => mq.matches && setMenuOpen(false);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return (
    <>
      <ScrollToHash />
      <a href="#main" className={styles.skipLink}>
        {t('nav.skip')}
      </a>

      <header className={`${styles.header} ${scrolled || menuOpen ? styles.headerScrolled : ''}`}>
        <div className={styles.bar}>
          <Link to="/" className={styles.logo} aria-label="Elpuls">
            <img src="/icon.png" alt="" className={styles.logoIcon} width={32} height={32} />
            <span>Elpuls</span>
          </Link>

          <nav className={styles.nav} aria-label={t('nav.label')}>
            {SECTIONS.map((s) => (
              <Link
                key={s.id}
                to={`/#${s.id}`}
                className={`${styles.navLink} ${active === s.id ? styles.navLinkActive : ''}`}
                aria-current={active === s.id ? 'location' : undefined}
              >
                {t(s.key)}
              </Link>
            ))}
          </nav>

          <div className={styles.actions}>
            <div className={styles.desktopOnly}>
              <LanguageSwitcher />
            </div>
            <a href={APP_STORE_URL} className={styles.cta} target="_blank" rel="noopener noreferrer">
              <Icon name="apple" size={16} filled />
              <span>{t('nav.download')}</span>
            </a>
            <button
              ref={menuButton}
              type="button"
              className={`${styles.menuButton} ${menuOpen ? styles.menuButtonOpen : ''}`}
              aria-expanded={menuOpen}
              aria-controls="mobile-menu"
              aria-label={menuOpen ? t('nav.closeMenu') : t('nav.openMenu')}
              onClick={() => setMenuOpen((o) => !o)}
            >
              <span />
              <span />
              <span />
            </button>
          </div>

          {/* How far down the page you are. */}
          <span className={styles.progress} style={{ transform: `scaleX(${progress})` }} aria-hidden="true" />
        </div>

        <div id="mobile-menu" className={`${styles.menu} ${menuOpen ? styles.menuOpen : ''}`}>
          <nav aria-label={t('nav.label')}>
            <ul className={styles.menuList}>
              {SECTIONS.map((s, i) => (
                <li key={s.id} style={{ transitionDelay: `${60 + i * 50}ms` }}>
                  <Link
                    ref={i === 0 ? firstMenuLink : undefined}
                    to={`/#${s.id}`}
                    className={`${styles.menuLink} ${active === s.id ? styles.menuLinkActive : ''}`}
                    onClick={() => setMenuOpen(false)}
                  >
                    {t(s.key)}
                    <Icon name="chevron" size={18} />
                  </Link>
                </li>
              ))}
              <li style={{ transitionDelay: '210ms' }}>
                <Link to="/privacy" className={styles.menuLink} onClick={() => setMenuOpen(false)}>
                  {t('nav.privacy')}
                  <Icon name="chevron" size={18} />
                </Link>
              </li>
            </ul>
          </nav>
          <div className={styles.menuFooter}>
            <div className={styles.menuLang}>
              <span>{t('nav.language')}</span>
              <LanguageSwitcher />
            </div>
            <a href={APP_STORE_URL} className={styles.menuCta} target="_blank" rel="noopener noreferrer">
              <Icon name="apple" size={20} filled />
              {t('hero.ctaDownload')}
            </a>
          </div>
        </div>
      </header>
      {menuOpen && <div className={styles.scrim} onClick={() => setMenuOpen(false)} aria-hidden="true" />}

      <main id="main">{children}</main>

      <footer className={styles.footer}>
        <div className={`container ${styles.footerInner}`}>
          <span>&copy; {new Date().getFullYear()} Elpuls</span>
          <div className={styles.footerLinks}>
            <Link to="/terms">{t('footer.termsOfService')}</Link>
            <Link to="/privacy">{t('footer.privacyPolicy')}</Link>
          </div>
        </div>
      </footer>
    </>
  );
}
