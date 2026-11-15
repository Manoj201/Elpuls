import type { Firestore } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';
import { findCheapestWindow, type PriceHour } from './priceUtils';
import { APPLIANCE_PRESETS, NIGHT_FRIENDLY_PRESETS, durationForRegistered, matchPresetId } from './appliances';
import { findHeatingPlan } from './heatingPlan';
import { SMART_PUSH_COPY, applianceName, joinNames, resolveServerLanguage, type ServerLanguage } from './pushCopy';

/**
 * Smart "good time now" pushes (Pro). Called once per zone right after
 * fetchPrices.ts stores tomorrow's prices. For every Pro subscriber in the
 * zone it plans tomorrow's pushes and writes them to
 * `pendingApplianceNotifications`, where fireDueApplianceNotifications sends
 * each one at its quarter-hour. Advisory only: Elpuls never controls devices.
 *
 * Kinds, most valuable first (the daily cap keeps the top ones):
 *  - appliance: cheapest window per household appliance, with the saving
 *    vs. the evening peak. Windows inside quiet hours become a 21:30-ish
 *    "plan the night" heads-up instead (delayed start / plug in the car).
 *  - heatAhead: start of the morning heat-banking window (electric / heat pump).
 *  - cheapNow: one push when a slot is far below the day's average.
 */

export interface NotificationPrefs {
  pricesPublished: boolean;
  applianceWindows: boolean;
  cheapNow: boolean;
  heatAhead: boolean;
  quietStartHour: number;
  quietEndHour: number;
  maxPerDay: number;
  mutedAppliances: string[];
}

// Keep in sync with DEFAULT_NOTIFICATION_PREFS in src/stores/useUserStore.ts.
export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  pricesPublished: true,
  applianceWindows: true,
  cheapNow: true,
  heatAhead: true,
  quietStartHour: 22,
  quietEndHour: 7,
  maxPerDay: 2,
  mutedAppliances: [],
};

export function resolvePrefs(raw: unknown): NotificationPrefs {
  const p = (raw ?? {}) as Partial<NotificationPrefs>;
  return {
    ...DEFAULT_NOTIFICATION_PREFS,
    ...p,
    mutedAppliances: Array.isArray(p.mutedAppliances) ? p.mutedAppliances : [],
  };
}

const VAT = 1.25;
/** Below this saving (kr) an appliance push isn't worth interrupting someone for. */
const MIN_SAVING_KR = 1;
/** "Cheap now" fires only when a slot costs at most this share of the day average. */
const CHEAP_NOW_RATIO = 0.7;
const EVENING_PEAK_START = 17;
const EVENING_PEAK_END = 20;
/** Heads-up for night windows goes out this many minutes before quiet hours start. */
const HEADS_UP_MINUTES_BEFORE_QUIET = 30;

const stockholmParts = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Stockholm',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: 'numeric',
  minute: 'numeric',
  hourCycle: 'h23',
});

interface LocalTime {
  dateKey: string;
  hour: number;
  minute: number;
}

function local(date: Date): LocalTime {
  const parts = Object.fromEntries(stockholmParts.formatToParts(date).map((p) => [p.type, p.value]));
  return { dateKey: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour), minute: Number(parts.minute) };
}

function clock(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function previousDateKey(dateKey: string): string {
  const d = new Date(`${dateKey}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function isQuiet(hour: number, prefs: NotificationPrefs): boolean {
  return prefs.quietStartHour > prefs.quietEndHour
    ? hour >= prefs.quietStartHour || hour < prefs.quietEndHour
    : hour >= prefs.quietStartHour && hour < prefs.quietEndHour;
}

function average(hours: PriceHour[]): number | null {
  return hours.length === 0 ? null : hours.reduce((s, h) => s + h.price, 0) / hours.length;
}

export interface Candidate {
  kind: 'appliance' | 'applianceNight' | 'heatAhead' | 'cheapNow';
  fireDateKey: string;
  slot: number;
  clock: string;
  /** Higher = more valuable; used to pick the top pushes under the daily cap. */
  value: number;
  names: string[];
  applianceIds: string[];
  saving?: number;
  detail?: Record<string, string>;
}

interface HouseholdAppliance {
  id: string;
  name: string;
  kwh: number;
  durationHours: number;
  isEv: boolean;
  /** Can sensibly run overnight (delayed start / timer / plugged-in car). */
  nightFriendly: boolean;
}

function householdAppliances(
  language: ServerLanguage,
  user: Record<string, unknown>,
  registered: { id: string; label: string; watts: number; durationHours?: number }[],
  prefs: NotificationPrefs,
): HouseholdAppliance[] {
  const hasEv = user.hasEv === true;
  const disabled = Array.isArray(user.disabledDefaultAppliances) ? (user.disabledDefaultAppliances as string[]) : [];
  const replaced = new Set(registered.map((a) => matchPresetId(a.label)).filter((id): id is string => id !== null));

  const defaults = APPLIANCE_PRESETS.filter(
    (p) => p.shiftable && (p.householdDefault || (p.id === 'ev' && hasEv)) && !disabled.includes(p.id) && !replaced.has(p.id),
  ).map((p) => ({
    id: p.id,
    name: applianceName(language, p.id),
    kwh: (p.watts / 1000) * p.typicalDurationHours,
    durationHours: p.typicalDurationHours,
    isEv: p.id === 'ev',
    nightFriendly: NIGHT_FRIENDLY_PRESETS.has(p.id),
  }));

  const own = registered
    .filter((a) => {
      const preset = APPLIANCE_PRESETS.find((p) => p.id === matchPresetId(a.label));
      return preset ? preset.shiftable : true;
    })
    .map((a) => {
      const durationHours = durationForRegistered(a.label, a.durationHours);
      const presetId = matchPresetId(a.label);
      return {
        id: a.id,
        name: a.label,
        kwh: (a.watts / 1000) * durationHours,
        durationHours,
        isEv: presetId === 'ev',
        nightFriendly: presetId !== null && NIGHT_FRIENDLY_PRESETS.has(presetId),
      };
    });

  return [...defaults, ...own].filter((a) => !prefs.mutedAppliances.includes(a.id));
}

/** Exported for testing: plans one user's pushes for one day of prices. */
export function planForUser(
  hours: PriceHour[],
  language: ServerLanguage,
  user: Record<string, unknown>,
  registered: { id: string; label: string; watts: number; durationHours?: number }[],
  prefs: NotificationPrefs,
): Candidate[] {
  const candidates: Candidate[] = [];
  const withLocal = hours.map((h) => ({ h, t: local(new Date(h.hour)) }));
  const dayAvg = average(hours);
  const eveningAvg = average(withLocal.filter((x) => x.t.hour >= EVENING_PEAK_START && x.t.hour < EVENING_PEAK_END).map((x) => x.h));
  const awakeHours = withLocal.filter((x) => !isQuiet(x.t.hour, prefs)).map((x) => x.h);

  // Heads-up time for night windows: e.g. quiet from 22:00 → 21:30.
  const headsUpTotal = prefs.quietStartHour * 60 - HEADS_UP_MINUTES_BEFORE_QUIET;
  const headsUpHour = Math.floor(headsUpTotal / 60);
  const headsUpMinute = headsUpTotal % 60;
  const headsUpSlot = headsUpHour * 4 + Math.floor(headsUpMinute / 15);

  if (prefs.applianceWindows && eveningAvg !== null) {
    for (const appliance of householdAppliances(language, user, registered, prefs)) {
      const awakeWindow = findCheapestWindow(awakeHours, appliance.durationHours);
      const anyWindow = appliance.nightFriendly ? findCheapestWindow(hours, appliance.durationHours) : null;
      const awakeSaving = awakeWindow ? appliance.kwh * (eveningAvg - awakeWindow.averagePrice) * VAT : -Infinity;
      const nightSaving = anyWindow ? appliance.kwh * (eveningAvg - anyWindow.averagePrice) * VAT : -Infinity;
      const nightStart = anyWindow ? local(new Date(anyWindow.start.hour)) : null;

      // Use the night only when it's a night window and clearly better
      // (≥ 1 kr more) than the best daytime option.
      const useNight =
        anyWindow !== null && nightStart !== null && isQuiet(nightStart.hour, prefs) && nightSaving - awakeSaving >= MIN_SAVING_KR;

      if (useNight && nightStart) {
        if (nightSaving < MIN_SAVING_KR) continue;
        const fireDateKey = nightStart.hour < prefs.quietEndHour ? previousDateKey(nightStart.dateKey) : nightStart.dateKey;
        candidates.push({
          kind: 'applianceNight',
          fireDateKey,
          slot: headsUpSlot,
          clock: clock(headsUpHour, headsUpMinute),
          value: nightSaving,
          names: appliance.isEv ? [] : [appliance.name],
          applianceIds: [appliance.id],
          saving: nightSaving,
          detail: { windowClock: clock(nightStart.hour, nightStart.minute), isEv: String(appliance.isEv) },
        });
        continue;
      }

      if (!awakeWindow || awakeSaving < MIN_SAVING_KR) continue;
      const start = local(new Date(awakeWindow.start.hour));
      candidates.push({
        kind: 'appliance',
        fireDateKey: start.dateKey,
        slot: start.hour * 4 + Math.floor(start.minute / 15),
        clock: clock(start.hour, start.minute),
        value: awakeSaving,
        names: [appliance.name],
        applianceIds: [appliance.id],
        saving: awakeSaving,
      });
    }
  }

  const heating = user.heatingType;
  if (prefs.heatAhead && (heating === 'electric' || heating === 'heat_pump')) {
    const plan = findHeatingPlan(hours);
    if (plan) {
      // Fire at the start of the banking window, or when quiet hours end if that's later.
      const fireHour = Math.max(plan.bankStartHour, prefs.quietEndHour);
      if (fireHour < plan.bankEndHour) {
        const dateKey = withLocal[0]?.t.dateKey;
        if (dateKey) {
          candidates.push({
            kind: 'heatAhead',
            fireDateKey: dateKey,
            slot: fireHour * 4,
            clock: clock(fireHour, 0),
            value: 0.5,
            names: [],
            applianceIds: [],
            detail: {
              bankEnd: clock(plan.bankEndHour, 0),
              coastStart: clock(plan.coastStartHour, 0),
              coastEnd: clock(plan.coastEndHour, 0),
            },
          });
        }
      }
    }
  }

  if (prefs.cheapNow && dayAvg !== null && dayAvg > 0) {
    const awake = withLocal.filter((x) => !isQuiet(x.t.hour, prefs));
    const cheapest = awake.reduce<(typeof awake)[number] | null>((best, x) => (!best || x.h.price < best.h.price ? x : best), null);
    if (cheapest && cheapest.h.price <= dayAvg * CHEAP_NOW_RATIO) {
      candidates.push({
        kind: 'cheapNow',
        fireDateKey: cheapest.t.dateKey,
        slot: cheapest.t.hour * 4 + Math.floor(cheapest.t.minute / 15),
        clock: clock(cheapest.t.hour, cheapest.t.minute),
        value: 0.1,
        names: [],
        applianceIds: [],
        detail: { ore: (cheapest.h.price * 100).toFixed(0) },
      });
    }
  }

  return capAndGroup(candidates, prefs.maxPerDay);
}

/** Merges appliance pushes that fire at the same moment, then keeps the most valuable N per day. */
function capAndGroup(candidates: Candidate[], maxPerDay: number): Candidate[] {
  const grouped = new Map<string, Candidate>();
  for (const c of candidates) {
    const key = `${c.fireDateKey}_${c.slot}_${c.kind}`;
    const existing = grouped.get(key);
    if (existing && (c.kind === 'appliance' || c.kind === 'applianceNight')) {
      existing.names.push(...c.names);
      existing.applianceIds.push(...c.applianceIds);
      existing.value += c.value;
      existing.saving = (existing.saving ?? 0) + (c.saving ?? 0);
      if (existing.detail && c.detail && c.detail.isEv === 'true') existing.detail.isEv = 'true';
    } else if (!existing) {
      grouped.set(key, { ...c, names: [...c.names], applianceIds: [...c.applianceIds], detail: c.detail ? { ...c.detail } : undefined });
    }
  }

  // The dryer needs the washed laundry first, so never tell people to start
  // both at once: drop the dryer from a push that already has the washer.
  for (const c of grouped.values()) {
    const washer = c.applianceIds.indexOf('washing_machine');
    const dryer = c.applianceIds.indexOf('dryer');
    if (washer !== -1 && dryer !== -1 && c.applianceIds.length > 1) {
      c.applianceIds.splice(dryer, 1);
      c.names.splice(dryer, 1);
    }
  }

  // A "cheap now" push at the same moment as an appliance push adds nothing.
  const all = [...grouped.values()];
  const busySlots = new Set(all.filter((c) => c.kind === 'appliance').map((c) => `${c.fireDateKey}_${c.slot}`));
  const filtered = all.filter((c) => !(c.kind === 'cheapNow' && busySlots.has(`${c.fireDateKey}_${c.slot}`)));

  const byDay = new Map<string, Candidate[]>();
  for (const c of filtered) {
    const list = byDay.get(c.fireDateKey) ?? [];
    list.push(c);
    byDay.set(c.fireDateKey, list);
  }

  const kept: Candidate[] = [];
  for (const list of byDay.values()) {
    list.sort((a, b) => b.value - a.value);
    kept.push(...list.slice(0, Math.max(0, maxPerDay)));
  }
  return kept;
}

/** Exported for testing. */
export function render(language: ServerLanguage, c: Candidate): { title: string; body: string } {
  const copy = SMART_PUSH_COPY[language];
  const names = joinNames(language, c.names);
  const saving = String(Math.round(c.saving ?? 0));
  switch (c.kind) {
    case 'appliance':
      return copy.applianceNow(names, saving);
    case 'applianceNight': {
      const windowClock = c.detail?.windowClock ?? '';
      const hasEv = c.detail?.isEv === 'true';
      if (hasEv && c.names.length === 0) return copy.evTonight(windowClock, saving);
      if (hasEv) return copy.evAndAppliancesTonight(names, windowClock, saving);
      return copy.applianceTonight(names, windowClock, saving);
    }
    case 'heatAhead':
      return copy.heatAhead(c.detail?.bankEnd ?? '', c.detail?.coastStart ?? '', c.detail?.coastEnd ?? '');
    case 'cheapNow':
      return copy.cheapNow(c.detail?.ore ?? '');
  }
}

export async function scheduleSmartPushes(db: Firestore, zone: string, dateKey: string, hours: PriceHour[]): Promise<void> {
  const subscriptions = await db.collection('pushSubscriptions').where('zone', '==', zone).get();
  let scheduled = 0;

  for (const sub of subscriptions.docs) {
    const uid = sub.id;
    const userSnap = await db.collection('users').doc(uid).get();
    const user = userSnap.data() ?? {};
    // Pro feature, checked on the server.
    if (user.isProSubscriber !== true) continue;

    const prefs = resolvePrefs(user.notificationPrefs);
    if (!prefs.applianceWindows && !prefs.cheapNow && !prefs.heatAhead) continue;

    const language = resolveServerLanguage(user.language);
    const appliancesSnap = await db.collection('users').doc(uid).collection('appliances').get();
    const registered = appliancesSnap.docs.map((d) => {
      const data = d.data();
      return { id: d.id, label: String(data.label ?? ''), watts: Number(data.watts ?? 0), durationHours: data.durationHours as number | undefined };
    });

    const plan = planForUser(hours, language, user, registered, prefs);

    for (const c of plan) {
      const { title, body } = render(language, c);
      await db
        .collection('pendingApplianceNotifications')
        .doc(`${uid}_${c.fireDateKey}_${c.slot}_${c.kind}`)
        .set({
          uid,
          kind: c.kind,
          dateKey: c.fireDateKey,
          windowStartSlot: c.slot,
          windowStartClock: c.clock,
          applianceLabel: c.names[0] ?? null,
          title,
          body,
          language,
          sourceDateKey: dateKey,
        });
      scheduled++;
    }
  }

  logger.info(`Scheduled ${scheduled} smart push(es) for ${zone} ${dateKey}.`);
}
