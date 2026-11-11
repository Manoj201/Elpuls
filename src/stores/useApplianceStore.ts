import { create } from 'zustand';
import { collection, deleteDoc, doc, getDocs, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

export interface RegisteredAppliance {
  id: string;
  label: string;
  watts: number;
  source: 'label' | 'estimate' | 'manual';
  /** Opt-in for the proactive appliance-start push notification (Pro). Only registered appliances can opt in — the static presets have no per-user Firestore doc to store this on. */
  notifyEnabled: boolean;
}

interface ApplianceState {
  appliances: RegisteredAppliance[];
  fetchAppliances: (uid: string) => Promise<void>;
  setNotifyEnabled: (uid: string, applianceId: string, enabled: boolean) => Promise<void>;
  updateAppliance: (uid: string, applianceId: string, update: { label: string; watts: number }) => Promise<void>;
  deleteAppliance: (uid: string, applianceId: string) => Promise<void>;
}

export const useApplianceStore = create<ApplianceState>((set, get) => ({
  appliances: [],
  fetchAppliances: async (uid) => {
    const snap = await getDocs(collection(db, 'users', uid, 'appliances'));
    const appliances = snap.docs.map((d) => ({
      id: d.id,
      label: d.data().label as string,
      watts: d.data().watts as number,
      source: (d.data().source as RegisteredAppliance['source']) ?? 'manual',
      notifyEnabled: Boolean(d.data().notifyEnabled),
    }));
    set({ appliances });
  },
  setNotifyEnabled: async (uid, applianceId, enabled) => {
    await updateDoc(doc(db, 'users', uid, 'appliances', applianceId), { notifyEnabled: enabled });
    set({
      appliances: get().appliances.map((a) => (a.id === applianceId ? { ...a, notifyEnabled: enabled } : a)),
    });
  },
  updateAppliance: async (uid, applianceId, update) => {
    await updateDoc(doc(db, 'users', uid, 'appliances', applianceId), update);
    set({
      appliances: get().appliances.map((a) => (a.id === applianceId ? { ...a, ...update } : a)),
    });
  },
  deleteAppliance: async (uid, applianceId) => {
    await deleteDoc(doc(db, 'users', uid, 'appliances', applianceId));
    set({ appliances: get().appliances.filter((a) => a.id !== applianceId) });
  },
}));
