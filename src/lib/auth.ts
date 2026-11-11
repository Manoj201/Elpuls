// @firebase/auth directly, not firebase/auth — see src/lib/firebase.ts.
import { onAuthStateChanged, signInAnonymously, signOut } from '@firebase/auth';
import { auth } from './firebase';

let signInPromise: Promise<string> | null = null;

/**
 * Ensures the app has a Firebase Auth user, signing in anonymously if
 * needed. Anonymous accounts get a stable uid we can attach data to
 * (push subscriptions, later onboarding profile) before a real login
 * screen exists; they link cleanly to a real account later via
 * linkWithCredential.
 */
export function ensureAnonymousSignIn(): Promise<string> {
  if (signInPromise) {
    return signInPromise;
  }

  signInPromise = new Promise((resolve, reject) => {
    const unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        if (user) {
          unsubscribe();
          resolve(user.uid);
        }
      },
      reject,
    );

    if (!auth.currentUser) {
      signInAnonymously(auth).catch((err) => {
        unsubscribe();
        reject(err);
      });
    }
  });

  return signInPromise;
}

/**
 * Dev-only: signs out and clears the memoized sign-in promise, so the next
 * ensureAnonymousSignIn() call creates a brand-new anonymous user instead
 * of returning the cached one. Used by the Settings "clear app storage"
 * dev tool to let onboarding/login be re-tested without a real reinstall.
 */
export async function signOutLocally(): Promise<void> {
  await signOut(auth);
  signInPromise = null;
}
