/**
 * Server copy of the appliance presets in src/config/appliances.ts and the
 * name matching in src/lib/applianceDisplay.ts (separate TS projects, same
 * dual-copy pattern as priceRisk). Only what push scheduling needs:
 * durations, "can it wait?", and which presets make up the standard
 * household. Keep in sync with the app.
 */
export interface ServerAppliancePreset {
  id: string;
  typicalDurationHours: number;
  shiftable: boolean;
  householdDefault: boolean;
}

export const APPLIANCE_PRESETS: ServerAppliancePreset[] = [
  { id: 'ev', typicalDurationHours: 1, shiftable: true, householdDefault: false },
  { id: 'washing_machine', typicalDurationHours: 1.5, shiftable: true, householdDefault: true },
  { id: 'dishwasher', typicalDurationHours: 2, shiftable: true, householdDefault: true },
  { id: 'dryer', typicalDurationHours: 1, shiftable: true, householdDefault: true },
  { id: 'oven', typicalDurationHours: 1, shiftable: false, householdDefault: true },
  { id: 'sauna', typicalDurationHours: 1, shiftable: true, householdDefault: false },
  { id: 'pool_heater', typicalDurationHours: 3, shiftable: true, householdDefault: false },
];

const FALLBACK_DURATION_HOURS = 1.5;

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
