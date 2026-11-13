import { create } from 'zustand';

export interface ActiveTicker {
  watts: number;
  label: string;
  /** epoch ms; elapsed time is always derived from Date.now() - startedAt */
  startedAt: number;
}

/**
 * Where the paywall was opened from, so its headline matches what the user
 * just tapped (e.g. the explainer teaser vs. the one-time offer after setup).
 */
export type PaywallSource =
  | 'onboarding'
  | 'settings'
  | 'trial'
  | 'explainer'
  | 'proTips'
  | 'stats'
  | 'recommendations'
  | 'generic';

interface UiState {
  isPaywallVisible: boolean;
  paywallSource: PaywallSource;
  ticker: ActiveTicker | null;
  showPaywall: (source?: PaywallSource) => void;
  hidePaywall: () => void;
  startTicker: (watts: number, label: string) => void;
  stopTicker: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  isPaywallVisible: false,
  paywallSource: 'generic',
  ticker: null,
  showPaywall: (source = 'generic') => set({ isPaywallVisible: true, paywallSource: source }),
  hidePaywall: () => set({ isPaywallVisible: false }),
  startTicker: (watts, label) => set({ ticker: { watts, label, startedAt: Date.now() } }),
  stopTicker: () => set({ ticker: null }),
}));
