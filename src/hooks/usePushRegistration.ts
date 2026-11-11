import { useEffect } from 'react';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { ensureAnonymousSignIn } from '../lib/auth';
import { registerForPushNotificationsAsync } from '../lib/notifications';
import { db } from '../lib/firebase';
import { useCountryStore } from '../stores/useCountryStore';
import { useUserStore } from '../stores/useUserStore';

/**
 * On mount, and whenever the selected price zone changes, ensures the user
 * has a (possibly anonymous) Firebase Auth session and an up-to-date push
 * subscription in Firestore so Cloud Functions can notify them when tomorrow's
 * prices for their zone are published.
 */
export function usePushRegistration() {
  const zone = useCountryStore((s) => s.zone);
  const countryCode = useCountryStore((s) => s.countryCode);
  const setUid = useUserStore((s) => s.setUid);

  useEffect(() => {
    let cancelled = false;

    async function register() {
      try {
        const uid = await ensureAnonymousSignIn();
        if (cancelled) return;
        setUid(uid);

        const expoPushToken = await registerForPushNotificationsAsync();
        if (cancelled || !expoPushToken) return;

        await setDoc(
          doc(db, 'pushSubscriptions', uid),
          { zone, countryCode, expoPushToken, updatedAt: serverTimestamp() },
          { merge: true },
        );
      } catch (err) {
        console.log('Push registration failed:', err);
      }
    }

    register();

    return () => {
      cancelled = true;
    };
  }, [zone, countryCode, setUid]);
}
