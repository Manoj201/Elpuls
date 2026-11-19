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
  /** Set when a tapped push should open Din plan; App switches to Översikt, Home scrolls and clears it. */
  planFocusPending: boolean;
  requestPlanFocus: () => void;
  clearPlanFocus: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  isPaywallVisible: false,
  paywallSource: 'generic',
  ticker: null,
  planFocusPending: false,
  requestPlanFocus: () => set({ planFocusPending: true }),
  clearPlanFocus: () => set({ planFocusPending: false }),
  showPaywall: (source = 'generic') => set({ isPaywallVisible: true, paywallSource: source }),
  hidePaywall: () => set({ isPaywallVisible: false }),
  startTicker: (watts, label) => set({ ticker: { watts, label, startedAt: Date.now() } }),
  stopTicker: () => set({ ticker: null }),
}));
