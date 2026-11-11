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
}

export const APPLIANCE_PRESETS: AppliancePreset[] = [
  { id: 'ev', label: 'EV charging', watts: 3600, typicalDurationHours: 1, liveTracking: true, shiftable: true },
  { id: 'washing_machine', label: 'Washing machine', watts: 2000, typicalDurationHours: 1.5, liveTracking: false, shiftable: true },
  { id: 'dishwasher', label: 'Dishwasher', watts: 1800, typicalDurationHours: 2, liveTracking: false, shiftable: true },
  { id: 'dryer', label: 'Tumble dryer', watts: 3000, typicalDurationHours: 1, liveTracking: false, shiftable: true },
  { id: 'oven', label: 'Oven / cooking', watts: 2200, typicalDurationHours: 1, liveTracking: false, shiftable: false },
  { id: 'sauna', label: 'Sauna', watts: 6000, typicalDurationHours: 1, liveTracking: false, shiftable: true },
  { id: 'pool_heater', label: 'Pool heater', watts: 3000, typicalDurationHours: 3, liveTracking: false, shiftable: true },
];
