import type { ComponentType } from 'react';
import {
  IconChargingPile,
  IconFlame,
  IconPool,
  IconSteam,
  IconToolsKitchen2,
  IconWash,
  IconWind,
} from '@tabler/icons-react-native';
import { APPLIANCE_PRESETS, type AppliancePreset } from '../config/appliances';

export const APPLIANCE_ICONS: Record<string, ComponentType<{ size?: number; color?: string }>> = {
  ev: IconChargingPile,
  washing_machine: IconWash,
  dishwasher: IconToolsKitchen2,
  dryer: IconWind,
  oven: IconFlame,
  sauna: IconSteam,
  pool_heater: IconPool,
};

const PRESET_IDS = new Set(APPLIANCE_PRESETS.map((p) => p.id));

// Preset appliance labels go through the fixed `ticker.appliances.<id>`
// translation keys; appliances registered via photo scan have dynamic ids
// with no matching key, so they render their own stored label instead.
export function resolveApplianceLabel(appliance: AppliancePreset, t: (key: string) => string): string {
  return PRESET_IDS.has(appliance.id) ? t(`ticker.appliances.${appliance.id}`) : appliance.label;
}

/** Default run length for a registered appliance we can't match to a preset. */
const FALLBACK_DURATION_HOURS = 1.5;

// Swedish and English words in a registered appliance's name that tell us
// which preset it is (the photo scan names it, e.g. "Diskmaskin" or
// "Bosch dishwasher"). First match wins, so a combined "tvätt- och
// torkmaskin" counts as a dryer (the longer, more power-hungry cycle).
const PRESET_KEYWORDS: { id: string; words: string[] }[] = [
  { id: 'dishwasher', words: ['disk', 'dishwasher'] },
  { id: 'dryer', words: ['tork', 'dryer'] },
  { id: 'washing_machine', words: ['tvätt', 'tvatt', 'washing', 'washer'] },
  { id: 'oven', words: ['ugn', 'spis', 'häll', 'oven', 'stove', 'hob', 'cooker'] },
  { id: 'ev', words: ['laddbox', 'elbil', 'charger', 'wallbox', ' ev'] },
  { id: 'sauna', words: ['bastu', 'sauna'] },
  { id: 'pool_heater', words: ['pool'] },
];

/** The preset a registered appliance most likely is, from its name; null if unknown. */
export function matchPresetId(label: string): string | null {
  const name = ` ${label.toLowerCase()}`;
  for (const { id, words } of PRESET_KEYWORDS) {
    if (words.some((w) => name.includes(w))) return id;
  }
  return null;
}

// Registered appliances borrow duration and "can it wait?" from their
// matching preset, so a scanned dishwasher gets 2 h like the preset; the
// user's own duration wins when they set one.
export function toAppliancePreset(appliance: { id: string; label: string; watts: number; durationHours?: number }): AppliancePreset {
  const presetId = matchPresetId(appliance.label);
  const preset = presetId ? APPLIANCE_PRESETS.find((p) => p.id === presetId) : undefined;
  return {
    id: appliance.id,
    label: appliance.label,
    watts: appliance.watts,
    typicalDurationHours: appliance.durationHours ?? preset?.typicalDurationHours ?? FALLBACK_DURATION_HOURS,
    liveTracking: false,
    shiftable: preset?.shiftable ?? true,
    householdDefault: false,
  };
}

/**
 * The appliances Elpuls plans around for this home: the standard household
 * (washing machine, dishwasher, dryer, oven, plus EV when the
 * profile has one) minus any the user switched off, with a registered
 * appliance replacing the default it matches (its real wattage wins), plus
 * every other registered appliance. Gives useful advice on day one, before
 * the user has added anything.
 */
export function getHouseholdAppliances(input: {
  hasEv: boolean;
  disabledDefaults: string[];
  registered: { id: string; label: string; watts: number; durationHours?: number }[];
}): AppliancePreset[] {
  const replaced = new Set(input.registered.map((a) => matchPresetId(a.label)).filter((id): id is string => id !== null));
  const defaults = APPLIANCE_PRESETS.filter(
    (p) =>
      (p.householdDefault || (p.id === 'ev' && input.hasEv)) &&
      !input.disabledDefaults.includes(p.id) &&
      !replaced.has(p.id),
  );
  return [...defaults, ...input.registered.map(toAppliancePreset)];
}

/** Preset ids that make up the standard household for this profile (for the Settings switches). */
export function householdDefaultIds(hasEv: boolean): string[] {
  return APPLIANCE_PRESETS.filter((p) => p.householdDefault || (p.id === 'ev' && hasEv)).map((p) => p.id);
}
