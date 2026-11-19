import type { DailyPlan, PlanActivity, PlanWindow } from '../hooks/useDailyPlan';
import type { HeatingType } from '../stores/useUserStore';
import { householdDefaultIds, matchPresetId } from './applianceDisplay';

/** Hour the "electricity day" starts: Din plan's day runs 06:00 → 06:00 the next morning. */
export const PLAN_DAY_START_HOUR = 6;

const stockholmDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Stockholm' });
const stockholmHour = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Stockholm', hour: 'numeric', hourCycle: 'h23' });

/** The plan day (YYYY-MM-DD) a moment belongs to: before 06:00 it's still the previous day's night. */
export function planDayKey(now: Date, offsetDays = 0): string {
  const hour = Number(stockholmHour.format(now));
  const shifted = new Date(now.getTime() + ((hour < PLAN_DAY_START_HOUR ? -1 : 0) + offsetDays) * 24 * 3600 * 1000);
  return stockholmDate.format(shifted);
}

export interface HouseholdInfo {
  hasEv: boolean;
  heatingType: HeatingType;
  disabledDefaults: string[];
  /** Labels of registered appliances, matched to presets (e.g. "Pool" → pool heater). */
  registeredLabels: string[];
}

/** Which plan rows apply to this home: its appliances, heating rows for electric/heat pump, and always "avoid". */
export function householdActivities(h: HouseholdInfo): Set<PlanActivity> {
  const set = new Set<PlanActivity>(['avoid']);
  for (const id of householdDefaultIds(h.hasEv)) if (!h.disabledDefaults.includes(id)) set.add(id as PlanActivity);
  for (const label of h.registeredLabels) {
    const id = matchPresetId(label);
    if (id) set.add(id as PlanActivity);
  }
  if (h.heatingType === 'electric' || h.heatingType === 'heat_pump') {
    set.add('heatBank');
    set.add('heatCoast');
  }
  return set;
}

/** This home's rows, sorted; the washer + dryer share one window (as in the pushes), so the dryer row is dropped when it matches. */
function forHome(windows: PlanWindow[], mine: Set<PlanActivity>): PlanWindow[] {
  const own = windows.filter((w) => mine.has(w.activity));
  return own
    .filter((w) => w.activity !== 'dryer' || !own.some((o) => o.activity === 'washing_machine' && o.start.getTime() === w.start.getTime()))
    .sort((a, b) => a.start.getTime() - b.start.getTime());
}

export interface PlanRows {
  /** Daytime: heating, avoid, daytime appliance suggestions. */
  day: PlanWindow[];
  /** Tonight 21:00 → 06:00 (empty until `nightReady`). */
  night: PlanWindow[];
  nightReady: boolean;
}

export function planRows(plan: DailyPlan | null, mine: Set<PlanActivity>): PlanRows {
  return {
    day: forHome(plan?.windows ?? [], mine),
    night: forHome(plan?.nightWindows ?? [], mine),
    nightReady: plan?.nightReady ?? false,
  };
}

/** The washer row's label also names the dryer when they share a window. */
export function sharesWithDryer(w: PlanWindow, all: PlanWindow[], mine: Set<PlanActivity>): boolean {
  return (
    w.activity === 'washing_machine' &&
    mine.has('dryer') &&
    all.some((o) => o.activity === 'dryer' && o.start.getTime() === w.start.getTime())
  );
}

const APPLIANCES = new Set<PlanActivity>(['washing_machine', 'dryer', 'dishwasher', 'ev', 'pool_heater']);

/** Upcoming appliance windows of a plan day for this home, for shading the price chart. */
export function applianceRanges(plan: DailyPlan | null, mine: Set<PlanActivity>, now: Date): { start: Date; end: Date }[] {
  const rows = planRows(plan, mine);
  return [...rows.day, ...rows.night]
    .filter((w) => APPLIANCES.has(w.activity) && w.end.getTime() > now.getTime())
    .map((w) => ({ start: w.start, end: w.end }));
}
