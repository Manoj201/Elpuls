import * as Device from 'expo-device';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';

/**
 * Show pushes while Elpuls is open, too. Without a handler iOS stays silent
 * for a push that arrives with the app in the foreground (found 2026-11-18:
 * the 19:00 "Kvällens plan" was delivered while the app was open and never
 * appeared). Set at import time so it's in place before any push arrives.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Requests notification permissions and returns an Expo push token, or null
 * if permissions were denied or push isn't available (e.g. simulator, or
 * Expo Go on SDK 53+ which no longer supports receiving remote push).
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (!Device.isDevice) {
    console.log('Push notifications require a physical device; skipping registration.');
    return null;
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) {
    console.log('No EAS projectId configured yet; skipping push registration.');
    return null;
  }

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;

  if (status !== 'granted') {
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
  }

  if (status !== 'granted') {
    console.log('Notification permission denied.');
    return null;
  }

  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  return token;
}
