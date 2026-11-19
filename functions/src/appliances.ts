/**
 * Server copy of the appliance presets in src/config/appliances.ts and the
 * name matching in src/lib/applianceDisplay.ts (separate TS projects, same
 * dual-copy pattern as priceRisk). Only what push scheduling needs:
 * durations, "can it wait?", and which presets make up the standard
 * household. Keep in sync with the app.
 */
export interface ServerAppliancePreset {
  id: string;
  watts: number;
  typicalDurationHours: number;
  shiftable: boolean;
  householdDefault: boolean;
}

export const APPLIANCE_PRESETS: ServerAppliancePreset[] = [
  { id: 'ev', watts: 3600, typicalDurationHours: 1, shiftable: true, householdDefault: false },
  { id: 'washing_machine', watts: 2000, typicalDurationHours: 1.5, shiftable: true, householdDefault: true },
  { id: 'dishwasher', watts: 1800, typicalDurationHours: 2, shiftable: true, householdDefault: true },
  { id: 'dryer', watts: 3000, typicalDurationHours: 1, shiftable: true, householdDefault: true },
  { id: 'oven', watts: 2200, typicalDurationHours: 1, shiftable: false, householdDefault: true },
  { id: 'sauna', watts: 6000, typicalDurationHours: 1, shiftable: true, householdDefault: false },
  { id: 'pool_heater', watts: 3000, typicalDurationHours: 3, shiftable: true, householdDefault: false },
];

const FALLBACK_DURATION_HOURS = 1.5;

/**
 * Appliances people commonly run overnight with delayed start or a timer:
 * the car, dishes, laundry washed in the evening and dried overnight, the pool.
 * (A washer and dryer are still never suggested in the same push; see capAndGroup.)
 */
export const NIGHT_FRIENDLY_PRESETS = new Set(['ev', 'dishwasher', 'washing_machine', 'dryer', 'pool_heater']);

/**
 * Most households run the dishwasher after dinner or overnight, not in the
 * middle of the day (tester feedback 2026-11-18). Its window must lie within
 * 21:00–06:00, so it starts between 21:00 and about 04:00. Same rule in Din
 * plan (dailyPlan.ts) and the app's savings estimate (src/lib/savings.ts).
 */
export const DISHWASHER_FROM_HOUR = 21;
export const DISHWASHER_TO_HOUR = 6;
export function dishwasherHour(hour: number): boolean {
  return hour >= DISHWASHER_FROM_HOUR || hour < DISHWASHER_TO_HOUR;
}

const PRESET_KEYWORDS: { id: string; words: string[] }[] = [
  { id: 'dishwasher', words: ['disk', 'dishwasher'] },
  { id: 'dryer', words: ['tork', 'dryer'] },
  { id: 'washing_machine', words: ['tvätt', 'tvatt', 'washing', 'washer'] },
  { id: 'oven', words: ['ugn', 'spis', 'häll', 'oven', 'stove', 'hob', 'cooker'] },
  { id: 'ev', words: ['laddbox', 'elbil', 'charger', 'wallbox', ' ev'] },
  { id: 'sauna', words: ['bastu', 'sauna'] },
  { id: 'pool_heater', words: ['pool'] },
];

export function matchPresetId(label: string): string | null {
  const name = ` ${label.toLowerCase()}`;
  for (const { id, words } of PRESET_KEYWORDS) {
    if (words.some((w) => name.includes(w))) return id;
  }
  return null;
}

/** Run length for a registered appliance: its own setting, else its matching preset's, else 1.5 h. */
export function durationForRegistered(label: string, durationHours?: number): number {
  if (typeof durationHours === 'number' && durationHours > 0) return durationHours;
  const preset = APPLIANCE_PRESETS.find((p) => p.id === matchPresetId(label));
  return preset?.typicalDurationHours ?? FALLBACK_DURATION_HOURS;
}
