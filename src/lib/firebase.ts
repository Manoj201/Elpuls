import { initializeApp, getApps, getApp } from 'firebase/app';
// Imported from @firebase/auth directly, not the firebase/auth wrapper: the
// firebase package's exports map for ./auth has no "react-native" condition
// (only node/browser/default), so Metro resolves it to the web build, which
// has no getReactNativePersistence at all (silently undefined at runtime —
// calling it would throw as soon as this module loads). @firebase/auth's
// own exports map does have a proper "react-native" condition.
import { getAuth, initializeAuth } from '@firebase/auth';
// TypeScript's resolver doesn't understand the "react-native" package.json
// export condition (that's Metro-only), so it falls back to the general
// type definitions, which don't declare this function even though it
// exists at runtime under the react-native condition.
// @ts-expect-error -- see above, not a type gap Metro's runtime hits.
import { getReactNativePersistence } from '@firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

const isFirstInit = getApps().length === 0;
export const firebaseApp = isFirstInit ? initializeApp(firebaseConfig) : getApp();

// Without explicit persistence, Firebase Auth forgets the signed-in user on
// every app restart, which would mint a brand new anonymous uid (and orphan
// its Firestore docs) each time. getReactNativePersistence keeps the session
// in AsyncStorage across restarts. initializeAuth must only be called once
// per app instance, hence gating on isFirstInit rather than re-deriving it.
export const auth = isFirstInit
  ? initializeAuth(firebaseApp, { persistence: getReactNativePersistence(AsyncStorage) })
  : getAuth(firebaseApp);

export const db = getFirestore(firebaseApp);
export const functions = getFunctions(firebaseApp);
