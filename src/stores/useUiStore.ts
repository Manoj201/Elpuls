import { create } from 'zustand';

export interface ActiveTicker {
  watts: number;
  label: string;
  /** epoch ms; elapsed time is always derived from Date.now() - startedAt */
  startedAt: number;
}

interface UiState {
  isPaywallVisible: boolean;
  ticker: ActiveTicker | null;
  showPaywall: () => void;
  hidePaywall: () => void;
  startTicker: (watts: number, label: string) => void;
  stopTicker: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  isPaywallVisible: false,
  ticker: null,
  showPaywall: () => set({ isPaywallVisible: true }),
  hidePaywall: () => set({ isPaywallVisible: false }),
  startTicker: (watts, label) => set({ ticker: { watts, label, startedAt: Date.now() } }),
  stopTicker: () => set({ ticker: null }),
}));
