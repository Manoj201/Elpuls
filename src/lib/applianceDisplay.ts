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

// Registered appliances get generic defaults — asking the user to configure
// typical duration/shiftability at registration time would add friction to
// what's meant to be a quick "snap a photo" flow.
export function toAppliancePreset(appliance: { id: string; label: string; watts: number }): AppliancePreset {
  return { id: appliance.id, label: appliance.label, watts: appliance.watts, typicalDurationHours: 1.5, liveTracking: false, shiftable: true };
}
