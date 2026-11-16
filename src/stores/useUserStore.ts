import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type HeatingType = 'district' | 'electric' | 'heat_pump' | 'other' | null;

/** Which pushes the user wants. Keep defaults in sync with functions/src/smartPushes.ts. */
export interface NotificationPrefs {
  /** Free: "tomorrow's prices are out". */
  pricesPublished: boolean;
  /** Pro: cheapest window per household appliance (and the 21:30 "plan the night" heads-up). */
  applianceWindows: boolean;
  /** Pro: one push when power is far below the day's average. */
  cheapNow: boolean;
  /** Pro: heat the house ahead of the evening peak (electric / heat pump homes). */
  heatAhead: boolean;
  /** Pro: the 07:10 morning briefing (dailyBriefing.ts). */
  dailyBriefing: boolean;
  quietStartHour: number;
  quietEndHour: number;
  maxPerDay: number;
  /** Appliance ids (preset or registered) the user doesn't want pushes for. */
  mutedAppliances: string[];
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  pricesPublished: true,
  applianceWindows: true,
  cheapNow: true,
  heatAhead: true,
  dailyBriefing: true,
  quietStartHour: 22,
  quietEndHour: 7,
  maxPerDay: 2,
  mutedAppliances: [],
};

/** Mirrors RevenueCat's PeriodType — kept as a plain string union here so this store doesn't depend on the SDK's types. */
export type ProPeriodType = 'NORMAL' | 'TRIAL' | 'INTRO' | 'PREPAID' | null;

interface UserState {
  uid: string | null;
  zone: string | null;
  heatingType: HeatingType;
  hasEv: boolean;
  hasSolar: boolean;
  gridFeeFixedSekPerMonth: number | null;
  gridFeeVariableSekPerKwh: number | null;
  /** The electricity retailer's own markup (rörliga kostnader + fast påslag), öre/kWh-derived. Set by the electricity bill scan flow; null until the user has scanned a bill. */
  retailerMarkupSekPerKwh: number | null;
  /** Retailer's fixed fee (månads-/årsavgift), kr per month incl. VAT. From the bill scan or typed in. */
  retailerFixedSekPerMonth: number | null;
  /** Electricity supplier and grid company names, read from scanned bills. */
  retailerName: string | null;
  gridCompanyName: string | null;
  /** Self-reported, optional (Settings only, not part of onboarding) — feeds the Contract health check, since no real consumption-metering data source exists yet. */
  estimatedMonthlyKwh: number | null;
  /** Standard-household appliances the user said they don't have (preset ids, e.g. 'dryer'). */
  disabledDefaultAppliances: string[];
  notificationPrefs: NotificationPrefs;
  /** Price chart style the user picked: hourly bars or the 15-minute area chart. Per phone. */
  chartView: 'hourly' | 'quarter';
  /** Home hero: spot price or what you pay. Null = not picked yet: show what you pay once the grid fee is known. Per phone. */
  priceView: 'spot' | 'landed' | null;
  /** User-set "warn when price peaks exceed X öre/kWh" threshold (Settings only). Null means the high-price alert is off. */
  priceAlertHighThresholdOre: number | null;
  /** Opt-in "tip me about negative/very low prices" toggle (Settings only). */
  priceAlertLowEnabled: boolean;
  isProSubscriber: boolean;
  proPeriodType: ProPeriodType;
  proExpirationMillis: number | null;
  /**
   * Free-trial days this Apple ID can still get, from the store (null = no
   * trial available, e.g. it was already used). Not persisted; refreshed
   * when purchases are configured. Starts at the configured default so new
   * users see the offer before the store answers.
   */
  trialDays: number | null;
  /** When onboarding was completed on this device (epoch ms). Persisted locally so a returning user is never sent back to login/onboarding, even offline or if the auth uid changes. */
  onboardedAt: number | null;
  /** When the user picked Create account / Sign in / Continue as guest on the Login screen (epoch ms). Until then the app always opens on Login — a background guest session alone doesn't count. Cleared on sign-out and account deletion. */
  entryChosenAt: number | null;
  /** When the welcome intro was finished or skipped (epoch ms). */
  introSeenAt: number | null;
  /** When the one-time Pro offer after onboarding was shown (epoch ms). */
  proOfferSeenAt: number | null;
  /** When the user dismissed the Home setup checklist (epoch ms). */
  setupDismissedAt: number | null;
  /** When the Home "Så fungerar Elpuls" card was closed or the guide opened (epoch ms). Per phone. */
  guideCardHiddenAt: number | null;
  /** True once the persisted profile has been read back from AsyncStorage on app start. Not persisted itself. */
  hasHydrated: boolean;
  setUid: (uid: string | null) => void;
  setOnboardingInfo: (info: {
    zone: string;
    heatingType: HeatingType;
    hasEv: boolean;
    hasSolar: boolean;
    gridFeeFixedSekPerMonth: number | null;
    gridFeeVariableSekPerKwh: number | null;
  }) => void;
  setRetailerMarkup: (retailerMarkupSekPerKwh: number | null) => void;
  /** Merges values from one scanned or typed-in bill; fields left out are kept. */
  setBillDetails: (details: Partial<BillDetails>) => void;
  setEstimatedMonthlyKwh: (estimatedMonthlyKwh: number | null) => void;
  setPriceAlertPrefs: (priceAlertHighThresholdOre: number | null, priceAlertLowEnabled: boolean) => void;
  setDisabledDefaultAppliances: (ids: string[]) => void;
  setNotificationPrefs: (prefs: NotificationPrefs) => void;
  setChartView: (view: 'hourly' | 'quarter') => void;
  setPriceView: (view: 'spot' | 'landed' | null) => void;
  setGridFee: (gridFeeFixedSekPerMonth: number | null, gridFeeVariableSekPerKwh: number | null) => void;
  setProStatus: (status: { isProSubscriber: boolean; periodType: ProPeriodType; expirationMillis: number | null }) => void;
  setTrialDays: (days: number | null) => void;
  /** Clears every profile field and the onboarded flag — used by sign-out, account deletion and the dev reset tool. */
  resetProfile: () => void;
  markEntryChosen: () => void;
  markIntroSeen: () => void;
  markProOfferSeen: () => void;
  dismissSetup: () => void;
  /** Shows the Home setup checklist again (from the guide). */
  restoreSetup: () => void;
  hideGuideCard: () => void;
}

export type BillDetails = Pick<
  UserState,
  | 'gridFeeFixedSekPerMonth'
  | 'gridFeeVariableSekPerKwh'
  | 'retailerMarkupSekPerKwh'
  | 'retailerFixedSekPerMonth'
  | 'retailerName'
  | 'gridCompanyName'
>;

/** The profile fields that make up a saved onboarding profile — persisted locally and mirrored to users/{uid}. */
export type UserProfile = Pick<
  UserState,
  | 'zone'
  | 'heatingType'
  | 'hasEv'
  | 'hasSolar'
  | 'gridFeeFixedSekPerMonth'
  | 'gridFeeVariableSekPerKwh'
  | 'retailerMarkupSekPerKwh'
  | 'retailerFixedSekPerMonth'
  | 'retailerName'
  | 'gridCompanyName'
  | 'estimatedMonthlyKwh'
  | 'priceAlertHighThresholdOre'
  | 'priceAlertLowEnabled'
  | 'disabledDefaultAppliances'
>;

const EMPTY_PROFILE: UserProfile & {
  onboardedAt: number | null;
  entryChosenAt: number | null;
  proOfferSeenAt: number | null;
  setupDismissedAt: number | null;
} = {
  zone: null,
  heatingType: null,
  hasEv: false,
  hasSolar: false,
  gridFeeFixedSekPerMonth: null,
  gridFeeVariableSekPerKwh: null,
  retailerMarkupSekPerKwh: null,
  retailerFixedSekPerMonth: null,
  retailerName: null,
  gridCompanyName: null,
  estimatedMonthlyKwh: null,
  priceAlertHighThresholdOre: null,
  priceAlertLowEnabled: false,
  disabledDefaultAppliances: [],
  onboardedAt: null,
  entryChosenAt: null,
  proOfferSeenAt: null,
  setupDismissedAt: null,
};

/** Snapshot of the current profile, in the shape written to users/{uid}. */
export function selectProfile(state: UserState): UserProfile {
  return {
    zone: state.zone,
    heatingType: state.heatingType,
    hasEv: state.hasEv,
    hasSolar: state.hasSolar,
    gridFeeFixedSekPerMonth: state.gridFeeFixedSekPerMonth,
    gridFeeVariableSekPerKwh: state.gridFeeVariableSekPerKwh,
    retailerMarkupSekPerKwh: state.retailerMarkupSekPerKwh,
    retailerFixedSekPerMonth: state.retailerFixedSekPerMonth,
    retailerName: state.retailerName,
    gridCompanyName: state.gridCompanyName,
    estimatedMonthlyKwh: state.estimatedMonthlyKwh,
    priceAlertHighThresholdOre: state.priceAlertHighThresholdOre,
    priceAlertLowEnabled: state.priceAlertLowEnabled,
    disabledDefaultAppliances: state.disabledDefaultAppliances,
  };
}

export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
  uid: null,
  zone: null,
  heatingType: null,
  hasEv: false,
  hasSolar: false,
  gridFeeFixedSekPerMonth: null,
  gridFeeVariableSekPerKwh: null,
  retailerMarkupSekPerKwh: null,
  retailerFixedSekPerMonth: null,
  retailerName: null,
  gridCompanyName: null,
  estimatedMonthlyKwh: null,
  priceAlertHighThresholdOre: null,
  priceAlertLowEnabled: false,
  disabledDefaultAppliances: [],
  notificationPrefs: DEFAULT_NOTIFICATION_PREFS,
  chartView: 'hourly',
  priceView: null,
  isProSubscriber: false,
  proPeriodType: null,
  proExpirationMillis: null,
  trialDays: 14,
  onboardedAt: null,
  entryChosenAt: null,
  introSeenAt: null,
  proOfferSeenAt: null,
  setupDismissedAt: null,
  guideCardHiddenAt: null,
  hasHydrated: false,
  setUid: (uid) => set({ uid }),
  setOnboardingInfo: (info) => set((state) => ({ ...info, onboardedAt: state.onboardedAt ?? Date.now() })),
  setRetailerMarkup: (retailerMarkupSekPerKwh) => set({ retailerMarkupSekPerKwh }),
  setBillDetails: (details) => set(details),
  setEstimatedMonthlyKwh: (estimatedMonthlyKwh) => set({ estimatedMonthlyKwh }),
  setPriceAlertPrefs: (priceAlertHighThresholdOre, priceAlertLowEnabled) =>
    set({ priceAlertHighThresholdOre, priceAlertLowEnabled }),
  setDisabledDefaultAppliances: (disabledDefaultAppliances) => set({ disabledDefaultAppliances }),
  setNotificationPrefs: (notificationPrefs) => set({ notificationPrefs }),
  setChartView: (chartView) => set({ chartView }),
  setPriceView: (priceView) => set({ priceView }),
  setGridFee: (gridFeeFixedSekPerMonth, gridFeeVariableSekPerKwh) => set({ gridFeeFixedSekPerMonth, gridFeeVariableSekPerKwh }),
  setProStatus: ({ isProSubscriber, periodType, expirationMillis }) =>
    set({ isProSubscriber, proPeriodType: periodType, proExpirationMillis: expirationMillis }),
  setTrialDays: (trialDays) => set({ trialDays }),
  resetProfile: () =>
    set({
      ...EMPTY_PROFILE,
      notificationPrefs: DEFAULT_NOTIFICATION_PREFS,
      uid: null,
      isProSubscriber: false,
      proPeriodType: null,
      proExpirationMillis: null,
    }),
  markEntryChosen: () => set((state) => ({ entryChosenAt: state.entryChosenAt ?? Date.now() })),
  markIntroSeen: () => set((state) => ({ introSeenAt: state.introSeenAt ?? Date.now() })),
  markProOfferSeen: () => set((state) => ({ proOfferSeenAt: state.proOfferSeenAt ?? Date.now() })),
  dismissSetup: () => set({ setupDismissedAt: Date.now() }),
  restoreSetup: () => set({ setupDismissedAt: null }),
  hideGuideCard: () => set((state) => ({ guideCardHiddenAt: state.guideCardHiddenAt ?? Date.now() })),
    }),
    {
      name: 'elpuls-user-profile',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      // Profile only — uid comes from Firebase Auth and Pro status from
      // RevenueCat on every launch, so neither is cached here.
      // introSeenAt deliberately survives resetProfile (sign-out): someone
      // who has seen the intro once doesn't need it again on this phone.
      partialize: (state) => ({
        ...selectProfile(state),
        onboardedAt: state.onboardedAt,
        entryChosenAt: state.entryChosenAt,
        introSeenAt: state.introSeenAt,
        proOfferSeenAt: state.proOfferSeenAt,
        setupDismissedAt: state.setupDismissedAt,
        guideCardHiddenAt: state.guideCardHiddenAt,
        notificationPrefs: state.notificationPrefs,
        chartView: state.chartView,
        priceView: state.priceView,
      }),
      onRehydrateStorage: () => () => {
        useUserStore.setState({ hasHydrated: true });
      },
    },
  ),
);
