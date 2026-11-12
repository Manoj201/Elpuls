import { create } from 'zustand';

export type HeatingType = 'district' | 'electric' | 'heat_pump' | 'other' | null;

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
  /** Self-reported, optional (Settings only, not part of onboarding) — feeds the Contract health check, since no real consumption-metering data source exists yet. */
  estimatedMonthlyKwh: number | null;
  /** User-set "warn when price peaks exceed X öre/kWh" threshold (Settings only). Null means the high-price alert is off. */
  priceAlertHighThresholdOre: number | null;
  /** Opt-in "tip me about negative/very low prices" toggle (Settings only). */
  priceAlertLowEnabled: boolean;
  isProSubscriber: boolean;
  proPeriodType: ProPeriodType;
  proExpirationMillis: number | null;
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
  setEstimatedMonthlyKwh: (estimatedMonthlyKwh: number | null) => void;
  setPriceAlertPrefs: (priceAlertHighThresholdOre: number | null, priceAlertLowEnabled: boolean) => void;
  setGridFee: (gridFeeFixedSekPerMonth: number | null, gridFeeVariableSekPerKwh: number | null) => void;
  setProStatus: (status: { isProSubscriber: boolean; periodType: ProPeriodType; expirationMillis: number | null }) => void;
}

export const useUserStore = create<UserState>((set) => ({
  uid: null,
  zone: null,
  heatingType: null,
  hasEv: false,
  hasSolar: false,
  gridFeeFixedSekPerMonth: null,
  gridFeeVariableSekPerKwh: null,
  retailerMarkupSekPerKwh: null,
  estimatedMonthlyKwh: null,
  priceAlertHighThresholdOre: null,
  priceAlertLowEnabled: false,
  isProSubscriber: false,
  proPeriodType: null,
  proExpirationMillis: null,
  setUid: (uid) => set({ uid }),
  setOnboardingInfo: (info) => set(info),
  setRetailerMarkup: (retailerMarkupSekPerKwh) => set({ retailerMarkupSekPerKwh }),
  setEstimatedMonthlyKwh: (estimatedMonthlyKwh) => set({ estimatedMonthlyKwh }),
  setPriceAlertPrefs: (priceAlertHighThresholdOre, priceAlertLowEnabled) =>
    set({ priceAlertHighThresholdOre, priceAlertLowEnabled }),
  setGridFee: (gridFeeFixedSekPerMonth, gridFeeVariableSekPerKwh) => set({ gridFeeFixedSekPerMonth, gridFeeVariableSekPerKwh }),
  setProStatus: ({ isProSubscriber, periodType, expirationMillis }) =>
    set({ isProSubscriber, proPeriodType: periodType, proExpirationMillis: expirationMillis }),
}));
