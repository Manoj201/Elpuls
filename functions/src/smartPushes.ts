import type { Firestore } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';
import { findCheapestWindow, type CheapestWindow, type PriceHour } from './priceUtils';
import { APPLIANCE_PRESETS, NIGHT_FRIENDLY_PRESETS, durationForRegistered, matchPresetId } from './appliances';
import { buildPlanWindows, isFlatDay } from './dailyPlan';
import { isProUser } from './proStatus';
import { SMART_PUSH_COPY, applianceName, joinNames, resolveServerLanguage, type ServerLanguage } from './pushCopy';

/**
 * Smart "good time now" pushes (Pro). Called once per zone right after
 * fetchPrices.ts stores tomorrow's prices. For every Pro subscriber in the
 * zone it plans tomorrow's pushes and writes them to
 * `pendingApplianceNotifications`, where fireDueApplianceNotifications sends
 * each one at its quarter-hour. Advisory only: Elpuls never controls devices.
 *
 * Kinds, most valuable first (the daily cap keeps the top ones):
 *  - tonight: every evening at 19:00, "Kvällens plan": each appliance's
 *    cheapest start time tonight (21:00–06:00) for delayed start, plus the
 *    car. Most households run these while they sleep.
 *  - appliance: a daytime push at the start of the day's cheapest window
 *    (washer with the dryer after it, pool, sauna…; not dishwasher or car).
 *    Both are suggestions; each day is planned on its own.
 *  - heatAhead: start of Din plan's heat-up window (electric / heat pump).
 *  - cheapNow: one push when a slot is far below the day's average.
 */

export interface NotificationPrefs {
  pricesPublished: boolean;
  applianceWindows: boolean;
  cheapNow: boolean;
  heatAhead: boolean;
  /** Pro: the 07:10 morning briefing (dailyBriefing.ts). */
  dailyBriefing: boolean;
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
  dailyBriefing: true,
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
  /** 'applianceNight' (21:30 heads-up) is no longer planned since 2026-11-18; kept for typing old records. */
  kind: 'appliance' | 'applianceNight' | 'tonight' | 'heatAhead' | 'cheapNow';
  fireDateKey: string;
  slot: number;
  clock: string;
  /** Higher = more valuable; used to pick the top pushes under the daily cap. */
  value: number;
  /** Display names, aligned with applianceIds/kinds ('' for the EV, which the copy names separately). */
  names: string[];
  /** Preset kind per appliance (e.g. 'dryer'), also for registered ones matched by name. */
  kinds?: string[];
  /** Start time per appliance (HH:MM), aligned with kinds. */
  clocks?: string[];
  applianceIds: string[];
  saving?: number;
  detail?: Record<string, string>;
  /** 'tonight' only: each appliance's start time tonight, in time order. */
  tonight?: TonightItem[];
}

export interface TonightItem {
  name: string;
  kind: string;
  isEv: boolean;
  /** Start and end of the window, HH:MM. */
  clock: string;
  endClock: string;
  saving: number;
  startMs: number;
}

/** One time slot to suggest: a single appliance, or washer + dryer together. */
interface Slot {
  ids: string[];
  kinds: string[];
  names: string[];
  kwh: number;
  durationHours: number;
  isEv: boolean;
  nightFriendly: boolean;
}

/**
 * Washer and dryer share one slot long enough for both (e.g. 23:00–01:30);
 * when to dry is up to the household (many wash one night, dry the next).
 */
function toSlots(apps: HouseholdAppliance[]): Slot[] {
  const washer = apps.find((a) => a.kind === 'washing_machine');
  const dryer = apps.find((a) => a.kind === 'dryer');
  const slots: Slot[] = [];
  for (const a of apps) {
    if (washer && dryer && a === dryer) continue;
    if (washer && dryer && a === washer) {
      slots.push({
        ids: [washer.id, dryer.id],
        kinds: [washer.kind, dryer.kind],
        names: [washer.name, dryer.name],
        kwh: washer.kwh + dryer.kwh,
        durationHours: washer.durationHours + dryer.durationHours,
        isEv: false,
        nightFriendly: washer.nightFriendly || dryer.nightFriendly,
      });
      continue;
    }
    slots.push({ ids: [a.id], kinds: [a.kind], names: [a.name], kwh: a.kwh, durationHours: a.durationHours, isEv: a.isEv, nightFriendly: a.nightFriendly });
  }
  return slots;
}

/** The evening push "Kvällens plan" goes out at this hour; "tonight" is 21:00–06:00. */
const TONIGHT_HOUR = 19;
const NIGHT_FROM_HOUR = 21;
/** The night ends at 06:00, the start of the next "electricity day" (same as Din plan and the app). */
const NIGHT_TO_HOUR = 6;
/** Below this total saving (kr) the evening plan isn't sent (flat evening/night). */
const MIN_TONIGHT_KR = 3;
/** A daytime appliance push needs at least this saving (kr); "about 1 kr" isn't worth interrupting. */
const MIN_DAY_KR = 2;

interface HouseholdAppliance {
  id: string;
  /** Preset kind ('dryer', 'ev', …); a registered appliance's own id when it matches no preset. */
  kind: string;
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
    kind: p.id,
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
        kind: presetId ?? a.id,
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
  /** The day before `hours` (today, when tomorrow's prices are planned): its evening is the start of "tonight". */
  todayHours: PriceHour[] = [],
): Candidate[] {
  const candidates: Candidate[] = [];
  const withLocal = hours.map((h) => ({ h, t: local(new Date(h.hour)) }));
  const dayAvg = average(hours);
  const eveningAvg = average(withLocal.filter((x) => x.t.hour >= EVENING_PEAK_START && x.t.hour < EVENING_PEAK_END).map((x) => x.h));
  const awakeHours = withLocal.filter((x) => !isQuiet(x.t.hour, prefs)).map((x) => x.h);

  if (prefs.applianceWindows && eveningAvg !== null) {
    // The dryer goes after the wash (like Din plan): handle it last, and only
    // look for its window after the washing machine's chosen window ends.
    const household = householdAppliances(language, user, registered, prefs);

    // "Tonight" = this evening 21:00 → tomorrow 06:00: today's evening prices
    // plus the start of the day being planned. Most households set things to
    // run while they sleep, so every evening at 19:00 one push lists each
    // appliance's cheapest time tonight (tester feedback 2026-11-18).
    const prevEvening = todayHours.filter((h) => local(new Date(h.hour)).hour >= NIGHT_FROM_HOUR);
    const nightHours = prevEvening.length ? [...prevEvening, ...hours.filter((h) => local(new Date(h.hour)).hour < NIGHT_TO_HOUR)] : [];
    // The saving is against this evening's peak, when people would otherwise run things.
    const tonightPeak =
      average(todayHours.filter((h) => { const hr = local(new Date(h.hour)).hour; return hr >= EVENING_PEAK_START && hr < EVENING_PEAK_END; })) ??
      eveningAvg;

    // Each day stands on its own; these are suggestions, the user picks.
    // Daytime: the planned day's cheapest window per slot (not the dishwasher
    // or the car, which households run at night). Tonight (19:00 push): every
    // night-friendly slot, cheapest window between 21:00 and 06:00. Only
    // published prices are used, never forecasts.
    const slots = toSlots(household);
    const pick = (pool: PriceHour[], list: Slot[]) =>
      list
        .map((slot) => ({ slot, window: findCheapestWindow(pool, slot.durationHours) }))
        .filter((x): x is { slot: Slot; window: CheapestWindow } => x.window !== null);
    const hhmm = (d: Date) => {
      const t = local(d);
      return clock(t.hour, t.minute);
    };

    // Flat day: timing barely matters, so no daytime appliance pushes.
    const dayFlat = isFlatDay(hours);
    // Daytime = after quiet hours until the evening peak (17:00); the evening
    // and night belong to the 19:00 plan.
    const dayHours = awakeHours.filter((h) => local(new Date(h.hour)).hour < EVENING_PEAK_START);
    for (const { slot, window } of dayFlat ? [] : pick(dayHours, slots.filter((x) => !x.kinds.includes('dishwasher') && !x.isEv))) {
      const daySaving = slot.kwh * (eveningAvg - window.averagePrice) * VAT;
      if (daySaving < MIN_DAY_KR) continue;
      const start = local(new Date(window.start.hour));
      candidates.push({
        kind: 'appliance',
        fireDateKey: start.dateKey,
        slot: start.hour * 4 + Math.floor(start.minute / 15),
        clock: clock(start.hour, start.minute),
        value: daySaving,
        names: [...slot.names],
        applianceIds: [...slot.ids],
        kinds: [...slot.kinds],
        saving: daySaving,
        detail: { untilClock: hhmm(window.end) },
      });
    }

    const tonight: TonightItem[] = nightHours.length
      ? pick(nightHours, slots.filter((x) => x.nightFriendly)).map(({ slot, window }) => ({
          name: joinNames(language, slot.names),
          kind: slot.kinds.join('+'),
          isEv: slot.isEv,
          clock: hhmm(new Date(window.start.hour)),
          endClock: hhmm(window.end),
          saving: Math.max(0, slot.kwh * (tonightPeak - window.averagePrice) * VAT),
          startMs: new Date(window.start.hour).getTime(),
        }))
      : [];

    const tonightSaving = tonight.reduce((sum, i) => sum + i.saving, 0);
    // Only worth a push when tonight is clearly cheaper than this evening.
    if (tonight.length && tonightSaving >= MIN_TONIGHT_KR && todayHours.length) {
      const todayKey = local(new Date(todayHours[0].hour)).dateKey;
      tonight.sort((x, y) => x.startMs - y.startMs);
      candidates.push({
        kind: 'tonight',
        fireDateKey: todayKey,
        slot: TONIGHT_HOUR * 4,
        clock: clock(TONIGHT_HOUR, 0),
        // Always kept under the daily cap: it's the one push that covers the night.
        value: tonightSaving + 1000,
        names: tonight.map((i) => (i.isEv ? '' : i.name)),
        kinds: tonight.map((i) => i.kind),
        applianceIds: [],
        saving: tonightSaving,
        tonight,
      });
    }
  }

  const heating = user.heatingType;
  if (prefs.heatAhead && (heating === 'electric' || heating === 'heat_pump')) {
    // Same windows as "Din plan" (buildPlanWindows), so the push and the
    // plan card never give different times: heat up in the cheapest 3 hours
    // before the evening stretch, not a fixed 06-09.
    const planWindows = buildPlanWindows(hours);
    const bank = planWindows.find((w) => w.activity === 'heatBank');
    const coast = planWindows.find((w) => w.activity === 'heatCoast');
    if (bank && coast) {
      const bankStartMs = new Date(bank.start).getTime();
      const bankEndMs = new Date(bank.end).getTime();
      // First quarter-hour of the bank window outside quiet hours.
      const fire = withLocal.find((x) => {
        const t = new Date(x.h.hour).getTime();
        return t >= bankStartMs && t < bankEndMs && !isQuiet(x.t.hour, prefs);
      });
      if (fire) {
        const end = local(new Date(bankEndMs));
        const coastStart = local(new Date(coast.start));
        const coastEnd = local(new Date(coast.end));
        candidates.push({
          kind: 'heatAhead',
          fireDateKey: fire.t.dateKey,
          slot: fire.t.hour * 4 + Math.floor(fire.t.minute / 15),
          clock: clock(fire.t.hour, fire.t.minute),
          value: 0.5,
          names: [],
          applianceIds: [],
          detail: {
            bankEnd: clock(end.hour, end.minute),
            coastStart: clock(coastStart.hour, coastStart.minute),
            coastEnd: clock(coastEnd.hour, coastEnd.minute),
          },
        });
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

  return capAndGroup(candidates, prefs.maxPerDay, prefs.applianceWindows);
}

/** Merges appliance pushes that fire at the same moment, then keeps the most valuable N per day. */
function capAndGroup(candidates: Candidate[], maxPerDay: number, eveningPlanOn: boolean): Candidate[] {
  const grouped = new Map<string, Candidate>();
  for (const c of candidates) {
    const key = `${c.fireDateKey}_${c.slot}_${c.kind}`;
    const existing = grouped.get(key);
    if (existing && (c.kind === 'appliance' || c.kind === 'applianceNight')) {
      existing.names.push(...c.names);
      existing.applianceIds.push(...c.applianceIds);
      existing.kinds = [...(existing.kinds ?? []), ...(c.kinds ?? [])];
      existing.clocks = [...(existing.clocks ?? []), ...(c.clocks ?? [])];
      existing.value += c.value;
      existing.saving = (existing.saving ?? 0) + (c.saving ?? 0);
      if (existing.detail && c.detail && c.detail.isEv === 'true') existing.detail.isEv = 'true';
    } else if (!existing) {
      grouped.set(key, { ...c, names: [...c.names], applianceIds: [...c.applianceIds], kinds: [...(c.kinds ?? [])], clocks: [...(c.clocks ?? [])], detail: c.detail ? { ...c.detail } : undefined });
    }
  }

  // Never two pushes in the same quarter-hour: "cheap now" adds nothing next
  // to another push, and an appliance push sharing the heat-up moment goes
  // out one quarter-hour later (still inside its cheap window).
  const all = [...grouped.values()];
  const heatSlots = new Set(all.filter((c) => c.kind === 'heatAhead').map((c) => `${c.fireDateKey}_${c.slot}`));
  for (const c of all) {
    if (c.kind === 'appliance' && heatSlots.has(`${c.fireDateKey}_${c.slot}`)) {
      c.slot += 1;
      c.clock = clock(Math.floor(c.slot / 4), (c.slot % 4) * 15);
    }
  }
  const busySlots = new Set(all.filter((c) => c.kind !== 'cheapNow').map((c) => `${c.fireDateKey}_${c.slot}`));
  const filtered = all.filter((c) => !(c.kind === 'cheapNow' && busySlots.has(`${c.fireDateKey}_${c.slot}`)));

  const byDay = new Map<string, Candidate[]>();
  for (const c of filtered) {
    const list = byDay.get(c.fireDateKey) ?? [];
    list.push(c);
    byDay.set(c.fireDateKey, list);
  }

  // The daily limit counts the 19:00 evening plan too. That push for the
  // planned day is made by the *next* run, so when it's on, one place per
  // day is kept free for it; the evening plan itself is always kept.
  const kept: Candidate[] = [];
  const reserve = eveningPlanOn ? 1 : 0;
  for (const list of byDay.values()) {
    const evening = list.filter((c) => c.kind === 'tonight');
    const others = list.filter((c) => c.kind !== 'tonight').sort((a, b) => b.value - a.value);
    kept.push(...evening, ...others.slice(0, Math.max(0, maxPerDay - reserve)));
  }
  return kept;
}

/** Exported for testing. */
export function render(language: ServerLanguage, c: Candidate): { title: string; body: string } {
  const copy = SMART_PUSH_COPY[language];
  const named = c.names.filter(Boolean);
  const names = joinNames(language, named);
  const saving = String(Math.round(c.saving ?? 0));
  switch (c.kind) {
    case 'appliance':
      return copy.applianceNow(names, c.detail?.untilClock ?? '', saving);
    case 'applianceNight': {
      const windowClock = c.detail?.windowClock ?? '';
      const hasEv = c.detail?.isEv === 'true';
      if (hasEv && named.length === 0) return copy.evTonight(windowClock, saving);
      if (hasEv) return copy.evAndAppliancesTonight(names, windowClock, saving);
      return copy.applianceTonight(names, windowClock, saving);
    }
    case 'tonight': {
      const items = c.tonight ?? [];
      const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
      const lines = items.filter((i) => !i.isEv).map((i) => copy.tonightItem(cap(i.name), i.clock, i.endClock));
      const ev = items.find((i) => i.isEv);
      return copy.tonight(lines, ev?.clock ?? null, saving);
    }
    case 'heatAhead':
      return copy.heatAhead(c.detail?.bankEnd ?? '', c.detail?.coastStart ?? '', c.detail?.coastEnd ?? '');
    case 'cheapNow':
      return copy.cheapNow(c.detail?.ore ?? '');
  }
}

/** Pro users who get tonight's plan at 19:00 today: they get "Din plan för i natt är klar" at publish time (publishPushes.ts). */
export type PlanReadyInfo = { kinds: string[] };

export async function scheduleSmartPushes(
  db: Firestore,
  zone: string,
  dateKey: string,
  hours: PriceHour[],
): Promise<Map<string, PlanReadyInfo>> {
  const planReady = new Map<string, PlanReadyInfo>();
  const subscriptions = await db.collection('pushSubscriptions').where('zone', '==', zone).get();
  let scheduled = 0;
  // Today's prices: their evening (21:00–24:00) is the first part of "tonight".
  const todaySnap = await db.collection('prices').doc(`SE-${zone}-${previousDateKey(dateKey)}`).get();
  const todayHours = ((todaySnap.data()?.hours ?? []) as PriceHour[]).map((h) => ({ hour: h.hour, price: Number(h.price) }));

  // Now (Stockholm), to catch an evening plan that's already late: prices
  // that arrive after 19:00 (price site down) still get tonight's plan.
  const nowLocal = local(new Date());
  const nowSlot = nowLocal.hour * 4 + Math.floor(nowLocal.minute / 15);

  for (const sub of subscriptions.docs) {
    const uid = sub.id;
    try {
    const userSnap = await db.collection('users').doc(uid).get();
    const user = userSnap.data() ?? {};
    // Pro feature, checked on the server.
    if (!isProUser(user)) continue;

    const prefs = resolvePrefs(user.notificationPrefs);
    if (!prefs.applianceWindows && !prefs.cheapNow && !prefs.heatAhead) continue;

    const language = resolveServerLanguage(user.language);
    const appliancesSnap = await db.collection('users').doc(uid).collection('appliances').get();
    const registered = appliancesSnap.docs.map((d) => {
      const data = d.data();
      return { id: d.id, label: String(data.label ?? ''), watts: Number(data.watts ?? 0), durationHours: data.durationHours as number | undefined };
    });

    const plan = planForUser(hours, language, user, registered, prefs, todayHours);

    for (const c of plan) {
      // On time (the usual ~13:00 publish, before 19:00 and outside quiet
      // hours): announce tonight's plan now. When prices are late, the 19:00
      // plan itself is the only push (it moves to the next quarter-hour).
      if (
        c.kind === 'tonight' &&
        c.fireDateKey === nowLocal.dateKey &&
        c.slot > nowSlot &&
        !isQuiet(nowLocal.hour, prefs)
      ) {
        planReady.set(uid, { kinds: c.kinds ?? [] });
      }
      if (c.kind === 'tonight' && c.fireDateKey === nowLocal.dateKey && c.slot <= nowSlot) {
        // Late: send at the next quarter-hour, unless quiet hours have started.
        if (nowSlot + 1 >= prefs.quietStartHour * 4) continue;
        c.slot = nowSlot + 1;
        c.clock = clock(Math.floor(c.slot / 4), (c.slot % 4) * 15);
      }
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
          applianceLabel: c.names.find(Boolean) ?? null,
          title,
          body,
          language,
          sourceDateKey: dateKey,
        });
      scheduled++;
    }
    } catch (err) {
      // One broken profile must not stop everyone else's pushes.
      logger.error(`Smart push planning failed for uid ${uid}: ${err}`);
    }
  }

  logger.info(`Scheduled ${scheduled} smart push(es) for ${zone} ${dateKey}; ${planReady.size} plan-ready.`);
  return planReady;
}
