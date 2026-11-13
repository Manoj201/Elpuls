// @firebase/auth directly, not firebase/auth — see src/lib/firebase.ts.
import {
  EmailAuthProvider,
  linkWithCredential,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInAnonymously,
  signInWithEmailAndPassword,
  signOut,
} from '@firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Purchases from 'react-native-purchases';
import { deleteDoc, doc } from 'firebase/firestore';
import { auth, db } from './firebase';
import { useUserStore } from '../stores/useUserStore';
import { useApplianceStore } from '../stores/useApplianceStore';

let signInPromise: Promise<string> | null = null;

/**
 * Set when an email account signs out on this phone, so the Login screen can
 * lead with "Sign in" for a returning person instead of "Create account".
 * Cleared when the account is deleted. Holds no personal data.
 */
export const RETURNING_USER_KEY = 'elpuls.returningUser';

export async function isReturningUser(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(RETURNING_USER_KEY)) === '1';
  } catch {
    return false;
  }
}

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

/** True when the current session is a guest (anonymous) user, not an email account. */
export function isGuest(): boolean {
  return auth.currentUser?.isAnonymous ?? true;
}

/** Email of the signed-in account, or null for guests. */
export function currentEmail(): string | null {
  return auth.currentUser?.isAnonymous ? null : (auth.currentUser?.email ?? null);
}

/**
 * Turns the current guest into an email account. Keeps the same uid, so
 * the onboarding profile, appliances and push subscription all carry over.
 */
export async function linkGuestToEmail(email: string, password: string): Promise<string> {
  await ensureAnonymousSignIn();
  const credential = EmailAuthProvider.credential(email.trim(), password);
  const result = await linkWithCredential(auth.currentUser!, credential);
  return result.user.uid;
}

/** Signs in to an existing email account (replaces the current guest session). */
export async function signInWithEmail(email: string, password: string): Promise<string> {
  const result = await signInWithEmailAndPassword(auth, email.trim(), password);
  signInPromise = Promise.resolve(result.user.uid);
  return result.user.uid;
}

export async function sendPasswordReset(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email.trim());
}

/**
 * Signs out of an email account and wipes this device's cached profile,
 * then starts a fresh guest session so the Login screen has a uid to
 * onboard with if the user picks "Continue as guest". Returns that uid.
 */
export async function signOutUser(): Promise<string> {
  try {
    await Purchases.logOut();
  } catch {
    // Not configured (no API key) or already anonymous in RevenueCat — fine.
  }
  if (auth.currentUser && !auth.currentUser.isAnonymous) {
    await AsyncStorage.setItem(RETURNING_USER_KEY, '1').catch(() => {});
  }
  // Stop this phone receiving the signed-out account's notifications.
  const previousUid = auth.currentUser?.uid;
  if (previousUid) {
    await deleteDoc(doc(db, 'pushSubscriptions', previousUid)).catch(() => {});
  }
  await signOut(auth);
  signInPromise = null;
  useUserStore.getState().resetProfile();
  useApplianceStore.setState({ appliances: [] });
  return ensureAnonymousSignIn();
}

/** Maps a Firebase Auth error to an i18n key under `authErrors`. */
export function authErrorKey(err: unknown): string {
  const code = (err as { code?: string } | null)?.code ?? '';
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-login-credentials':
      return 'authErrors.invalidCredentials';
    case 'auth/email-already-in-use':
    case 'auth/credential-already-in-use':
      return 'authErrors.emailInUse';
    case 'auth/invalid-email':
      return 'authErrors.invalidEmail';
    case 'auth/weak-password':
      return 'authErrors.weakPassword';
    case 'auth/missing-password':
      return 'authErrors.missingPassword';
    case 'auth/network-request-failed':
      return 'authErrors.network';
    case 'auth/too-many-requests':
      return 'authErrors.tooManyRequests';
    case 'auth/requires-recent-login':
      return 'authErrors.recentLogin';
    default:
      return 'authErrors.generic';
  }
}
