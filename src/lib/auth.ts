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
 *
 * Deliberately waits for the FIRST onAuthStateChanged callback before
 * deciding whether to sign in — checking `auth.currentUser` synchronously
 * here (the previous bug) is unreliable, since restoring a persisted
 * session from AsyncStorage (see firebase.ts) is inherently async:
 * `currentUser` reads as null on a cold start even when a valid session
 * exists, which minted a brand-new anonymous uid on every app restart and
 * orphaned the previous uid's Firestore profile (TestFlight bug: "closing
 * the app forces a re-login / re-onboarding").
 */
export function ensureAnonymousSignIn(): Promise<string> {
  if (signInPromise) {
    return signInPromise;
  }

  signInPromise = new Promise((resolve, reject) => {
    const unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        unsubscribe();
        if (user) {
          resolve(user.uid);
        } else {
          signInAnonymously(auth)
            .then((credential) => resolve(credential.user.uid))
            .catch(reject);
        }
      },
      reject,
    );
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
