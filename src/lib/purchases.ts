import { Platform } from 'react-native';
import Purchases, { LOG_LEVEL, PURCHASES_ERROR_CODE, type CustomerInfo, type PurchasesPackage } from 'react-native-purchases';
import { doc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { useUserStore } from '../stores/useUserStore';

/** RevenueCat entitlement identifier — whatever product/offering is configured in the dashboard just needs to grant this. */
export const PRO_ENTITLEMENT_ID = 'pro';

let configured = false;

/**
 * Why the last getCurrentOfferingPackage() call came back empty, or null if it
 * succeeded. Surfaced in small print on the paywall so a disabled subscribe
 * button in a TestFlight/release build is diagnosable without a debugger.
 */
let lastOfferingIssue: string | null = null;

export function getLastOfferingIssue(): string | null {
  return lastOfferingIssue;
}

function apiKeyForPlatform(): string | null {
  const key = Platform.OS === 'ios' ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY : process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY;
  return key && key.length > 0 ? key : null;
}

function syncProStatus(info: CustomerInfo): void {
  const entitlement = info.entitlements.active[PRO_ENTITLEMENT_ID] ?? null;
  const isProSubscriber = entitlement !== null;
  useUserStore.getState().setProStatus({
    isProSubscriber,
    periodType: entitlement?.periodType ?? null,
    expirationMillis: entitlement?.expirationDateMillis ?? null,
  });

  // Best-effort mirror so Cloud Functions (e.g. the daily briefing) can
  // gate on Pro status server-side — RevenueCat's own status never reaches
  // Firestore otherwise. Never allowed to block the purchase/restore flow.
  const uid = useUserStore.getState().uid;
  if (uid) {
    setDoc(doc(db, 'users', uid), { isProSubscriber }, { merge: true }).catch((err) => {
      console.log('Failed to mirror Pro status to Firestore:', err);
    });
  }
}

/**
 * Configures RevenueCat for the signed-in user. No-ops (free tier only) when
 * no real API key is set — lets the app run normally before the external
 * RevenueCat + App Store Connect/Play Console setup exists (CLAUDE.md §12).
 * Never throws — a misconfigured/placeholder key must not block app boot.
 */
export async function configurePurchases(uid: string): Promise<void> {
  const apiKey = apiKeyForPlatform();
  if (!apiKey) {
    console.log('RevenueCat: no API key configured for this platform, skipping (free tier only).');
    return;
  }

  try {
    if (configured) {
      // Already configured this session (e.g. guest → signed-in): switch the
      // RevenueCat user instead of configuring a second instance and
      // registering a duplicate listener.
      const { customerInfo } = await Purchases.logIn(uid);
      syncProStatus(customerInfo);
      return;
    }
    if (__DEV__) {
      Purchases.setLogLevel(LOG_LEVEL.DEBUG);
    }
    Purchases.configure({ apiKey, appUserID: uid });
    configured = true;
    Purchases.addCustomerInfoUpdateListener(syncProStatus);
    const info = await Purchases.getCustomerInfo();
    syncProStatus(info);
  } catch (err) {
    console.log('RevenueCat configure failed:', err);
  }
}

/**
 * The package to show on the paywall. Prefers the monthly package (matches
 * CLAUDE.md §3's "~39 kr/month" plan) and falls back to whatever the current
 * offering has, so this doesn't break if the dashboard product ends up
 * configured under a different package type. Returns null if RevenueCat
 * isn't configured (no API key) or no real offering exists yet.
 */
export async function getCurrentOfferingPackage(): Promise<PurchasesPackage | null> {
  if (!configured) {
    lastOfferingIssue = apiKeyForPlatform() ? 'RevenueCat not configured yet' : 'No RevenueCat API key in this build';
    return null;
  }
  try {
    const offerings = await Purchases.getOfferings();
    const current = offerings.current;
    if (!current) {
      const ids = Object.keys(offerings.all);
      lastOfferingIssue = ids.length ? `No current offering (found: ${ids.join(', ')})` : 'No offerings returned';
      return null;
    }
    const pkg = current.monthly ?? current.availablePackages[0] ?? null;
    lastOfferingIssue = pkg ? null : `Offering "${current.identifier}" has no packages`;
    return pkg;
  } catch (err) {
    console.log('RevenueCat getOfferings failed:', err);
    const e = err as { code?: string | number; message?: string; underlyingErrorMessage?: string };
    lastOfferingIssue = [e.code != null ? `[${e.code}]` : null, e.message, e.underlyingErrorMessage].filter(Boolean).join(' ') || String(err);
    return null;
  }
}

export async function purchasePackage(pkg: PurchasesPackage): Promise<void> {
  const { customerInfo } = await Purchases.purchasePackage(pkg);
  syncProStatus(customerInfo);
}

/** Trial length used in copy when the store gives no intro offer details. Matches App Store Connect. */
export const DEFAULT_TRIAL_DAYS = 14;

/**
 * Free-trial length in days from the store's introductory offer, or null
 * when the package has no free intro offer (e.g. the user already used it).
 */
export function getTrialDays(pkg: PurchasesPackage | null): number | null {
  const intro = pkg?.product.introPrice;
  if (!intro || intro.price !== 0) return null;
  const units = intro.periodNumberOfUnits;
  switch (intro.periodUnit) {
    case 'DAY':
      return units;
    case 'WEEK':
      return units * 7;
    case 'MONTH':
      return units * 30;
    case 'YEAR':
      return units * 365;
    default:
      return null;
  }
}

/** Restores purchases; resolves true only if Pro is actually active afterwards. */
export async function restorePurchases(): Promise<boolean> {
  const info = await Purchases.restorePurchases();
  syncProStatus(info);
  return Boolean(info.entitlements.active[PRO_ENTITLEMENT_ID]);
}

/**
 * Classifies a purchase/restore error. 'otherAccount' = this Apple ID's
 * active subscription is linked to a different Elpuls account (RevenueCat
 * "Transfer if there are no active subscriptions" keeps it there), so the
 * user needs to sign in to that account instead.
 */
export function purchaseErrorKind(err: unknown): 'cancelled' | 'otherAccount' | 'other' {
  const code = String((err as { code?: string | number } | null)?.code ?? '');
  if ((err as { userCancelled?: boolean } | null)?.userCancelled || code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR) {
    return 'cancelled';
  }
  if (
    code === PURCHASES_ERROR_CODE.RECEIPT_ALREADY_IN_USE_ERROR ||
    code === PURCHASES_ERROR_CODE.RECEIPT_IN_USE_BY_OTHER_SUBSCRIBER_ERROR
  ) {
    return 'otherAccount';
  }
  return 'other';
}

export async function openManageSubscriptions(): Promise<void> {
  await Purchases.showManageSubscriptions();
}
