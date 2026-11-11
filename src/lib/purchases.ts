import { Platform } from 'react-native';
import Purchases, { LOG_LEVEL, type CustomerInfo, type PurchasesPackage } from 'react-native-purchases';
import { doc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { useUserStore } from '../stores/useUserStore';

/** RevenueCat entitlement identifier — whatever product/offering is configured in the dashboard just needs to grant this. */
export const PRO_ENTITLEMENT_ID = 'pro';

let configured = false;

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
  if (!configured) return null;
  try {
    const offerings = await Purchases.getOfferings();
    const current = offerings.current;
    if (!current) return null;
    return current.monthly ?? current.availablePackages[0] ?? null;
  } catch (err) {
    console.log('RevenueCat getOfferings failed:', err);
    return null;
  }
}

export async function purchasePackage(pkg: PurchasesPackage): Promise<void> {
  const { customerInfo } = await Purchases.purchasePackage(pkg);
  syncProStatus(customerInfo);
}

export async function restorePurchases(): Promise<void> {
  const info = await Purchases.restorePurchases();
  syncProStatus(info);
}

export async function openManageSubscriptions(): Promise<void> {
  await Purchases.showManageSubscriptions();
}
