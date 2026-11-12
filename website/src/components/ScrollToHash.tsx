import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * React Router's Link doesn't scroll to #hash targets the way a plain <a>
 * does on same-document navigation — it just updates the URL. This mounts
 * once and does the scrolling by hand on every route/hash change.
 */
export function ScrollToHash() {
  const { hash, pathname } = useLocation();

  useEffect(() => {
    if (hash) {
      const el = document.getElementById(hash.slice(1));
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
        return;
      }
    }
    window.scrollTo({ top: 0 });
  }, [hash, pathname]);

  return null;
}
