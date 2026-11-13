import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import { signOutLocally } from './auth';
import { useApplianceStore } from '../stores/useApplianceStore';
import { useCountryStore } from '../stores/useCountryStore';
import { useUserStore } from '../stores/useUserStore';

const deleteMyAccountCallable = httpsCallable<void, { deleted: boolean }>(functions, 'deleteMyAccount');

/**
 * Deletes the signed-in user's account and all their data server-side
 * (see functions/src/deleteAccount.ts), then resets local state so the app
 * behaves like a fresh install — same reset shape as the dev "clear app
 * storage" tool, since there's equally nothing left to show afterward.
 */
export async function deleteMyAccount(): Promise<void> {
  await deleteMyAccountCallable();
  await signOutLocally();

  useUserStore.getState().resetProfile();
  useApplianceStore.setState({ appliances: [] });

  const zones = useCountryStore.getState().config.zones;
  useCountryStore.getState().setZone(zones[0]);
}
