import { useEffect } from 'react';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { registerForPushNotificationsAsync } from '../lib/notifications';
import { db } from '../lib/firebase';
import { useCountryStore } from '../stores/useCountryStore';
import { useUserStore } from '../stores/useUserStore';

/**
 * Keeps `pushSubscriptions/{uid}` up to date so Cloud Functions can notify
 * the user about THEIR price zone. Uses the user's home zone from their
 * onboarding profile (useUserStore) — not useCountryStore's zone, which also
 * changes when someone just taps SE1–SE4 on Översikt to look at another
 * zone (that used to move their notifications to the browsed zone).
 * Nothing is registered until onboarding has set a home zone.
 */
export function usePushRegistration() {
  const zone = useUserStore((s) => s.zone);
  const countryCode = useCountryStore((s) => s.countryCode);
  // The uid App.tsx settled on (guest or signed-in account). Reading it from
  // the store — rather than re-running ensureAnonymousSignIn here — keeps
  // the subscription on the right account after sign-in/sign-out.
  const uid = useUserStore((s) => s.uid);

  useEffect(() => {
    if (!uid || !zone) return;
    let cancelled = false;

    async function register() {
      try {
        const expoPushToken = await registerForPushNotificationsAsync();
        if (cancelled || !expoPushToken) return;

        await setDoc(
          doc(db, 'pushSubscriptions', uid!),
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
  }, [zone, countryCode, uid]);
}
