import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { DEFAULT_NOTIFICATION_PREFS, useUserStore, type NotificationPrefs } from '../stores/useUserStore';

/** Fills in any missing fields (older profiles, partial Firestore data) with the defaults. */
export function resolveNotificationPrefs(raw: unknown): NotificationPrefs {
  const p = (raw ?? {}) as Partial<NotificationPrefs>;
  return {
    ...DEFAULT_NOTIFICATION_PREFS,
    ...p,
    mutedAppliances: Array.isArray(p.mutedAppliances) ? p.mutedAppliances : [],
  };
}

/**
 * Saves push settings: in the app right away, then to `users/{uid}` (read by
 * smartPushes.ts) and the "prices published" switch to
 * `pushSubscriptions/{uid}` (read by the zone-wide send). Best-effort: a
 * failed write is logged and retried on the next change.
 */
export async function saveNotificationPrefs(uid: string, changes: Partial<NotificationPrefs>): Promise<void> {
  const next = { ...useUserStore.getState().notificationPrefs, ...changes };
  useUserStore.getState().setNotificationPrefs(next);
  try {
    await Promise.all([
      setDoc(doc(db, 'users', uid), { notificationPrefs: next, updatedAt: serverTimestamp() }, { merge: true }),
      setDoc(doc(db, 'pushSubscriptions', uid), { pricesPublished: next.pricesPublished }, { merge: true }),
    ]);
  } catch (err) {
    console.log('Saving notification settings failed:', err);
  }
}

/** Turns pushes for one appliance on or off (preset id or registered appliance id). */
export function setAppliancePushes(uid: string, applianceId: string, enabled: boolean): Promise<void> {
  const muted = useUserStore.getState().notificationPrefs.mutedAppliances;
  const mutedAppliances = enabled ? muted.filter((id) => id !== applianceId) : [...new Set([...muted, applianceId])];
  return saveNotificationPrefs(uid, { mutedAppliances });
}
