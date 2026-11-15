export interface AppliancePreset {
  id: string;
  label: string;
  watts: number;
  /** Typical run length for the pre-use cost check's fixed-duration estimate. */
  typicalDurationHours: number;
  /** true = keep the live counting-up ticker (EV charging); false = pre-use decision check instead. */
  liveTracking: boolean;
  /** false = fixed-schedule (e.g. cooking) — decision check shows "now" only, no "wait until" comparison. */
  shiftable: boolean;
  /**
   * Part of the standard household Elpuls assumes when the user hasn't added
   * their own appliances (every home has hot water, laundry, dishes and a
   * kitchen). EV is added only when the profile says hasEv; sauna and pool
   * only when the user adds them.
   */
  householdDefault: boolean;
}

export const APPLIANCE_PRESETS: AppliancePreset[] = [
  { id: 'ev', label: 'EV charging', watts: 3600, typicalDurationHours: 1, liveTracking: true, shiftable: true, householdDefault: false },
  { id: 'washing_machine', label: 'Washing machine', watts: 2000, typicalDurationHours: 1.5, liveTracking: false, shiftable: true, householdDefault: true },
  { id: 'dishwasher', label: 'Dishwasher', watts: 1800, typicalDurationHours: 2, liveTracking: false, shiftable: true, householdDefault: true },
  { id: 'dryer', label: 'Tumble dryer', watts: 3000, typicalDurationHours: 1, liveTracking: false, shiftable: true, householdDefault: true },
  { id: 'oven', label: 'Oven / cooking', watts: 2200, typicalDurationHours: 1, liveTracking: false, shiftable: false, householdDefault: true },
  { id: 'sauna', label: 'Sauna', watts: 6000, typicalDurationHours: 1, liveTracking: false, shiftable: true, householdDefault: false },
  { id: 'pool_heater', label: 'Pool heater', watts: 3000, typicalDurationHours: 3, liveTracking: false, shiftable: true, householdDefault: false },
];
