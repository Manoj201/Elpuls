import AsyncStorage from '@react-native-async-storage/async-storage';
import { signOutLocally } from './auth';
import { useApplianceStore } from '../stores/useApplianceStore';
import { useCountryStore } from '../stores/useCountryStore';
import { useUserStore } from '../stores/useUserStore';

/**
 * Dev-only: wipes the persisted Firebase Auth session, all local
 * AsyncStorage (language preference, etc.), and in-memory profile state,
 * so the next app init behaves like a fresh install — lets onboarding/
 * login be re-tested without a real reinstall. __DEV__-gated at the call
 * site (SettingsScreen), never reachable in a release build.
 */
export async function clearLocalAppStorage(): Promise<void> {
  await signOutLocally();
  await AsyncStorage.clear();

  useUserStore.getState().resetProfile();
  useApplianceStore.setState({ appliances: [] });

  const zones = useCountryStore.getState().config.zones;
  useCountryStore.getState().setZone(zones[0]);
}
