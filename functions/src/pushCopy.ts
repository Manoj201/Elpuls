export type ServerLanguage = 'en' | 'sv';

/** Defaults to 'sv' when missing — matches the app's actual behavior before per-user language was tracked, least disruptive while the Firestore mirror (src/i18n/index.ts) backfills existing installs. */
export function resolveServerLanguage(value: unknown): ServerLanguage {
  return value === 'en' ? 'en' : 'sv';
}

/**
 * Area names instead of zone codes in pushes: testers found "SE3" confusing.
 * Same names as the app (onboarding.zoneName). Swedish uses "i …".
 */
const ZONE_AREA: Record<ServerLanguage, Record<string, string>> = {
  sv: { SE1: 'Norra Norrland', SE2: 'Södra Norrland', SE3: 'Mellansverige', SE4: 'Södra Sverige' },
  en: { SE1: 'Northern Norrland', SE2: 'Southern Norrland', SE3: 'Central Sweden', SE4: 'Southern Sweden' },
};

export function zoneArea(language: ServerLanguage, zone: string): string {
  const code = zone.replace(/^SE-/, '');
  return ZONE_AREA[language][code] ?? code;
}

/** "torsdag 19 november" / "Thursday 19 November" from a YYYY-MM-DD key. */
function dayName(language: ServerLanguage, dateKey: string): string {
  return new Date(`${dateKey}T12:00:00Z`).toLocaleDateString(language === 'sv' ? 'sv-SE' : 'en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Europe/Stockholm',
  });
}

export const PRICE_PUBLISHED_COPY: Record<ServerLanguage, (zone: string, dateKey: string) => { title: string; body: string }> = {
  en: (zone, dateKey) => ({
    title: "Tomorrow's electricity prices are here",
    body: `Prices for ${zoneArea('en', zone)} on ${dayName('en', dateKey)} are now in the app.`,
  }),
  sv: (zone, dateKey) => ({
    title: 'Morgondagens elpriser är här',
    body: `Elpriserna i ${zoneArea('sv', zone)} för ${dayName('sv', dateKey)} finns nu i appen.`,
  }),
};

export const DAILY_BRIEFING_TITLE: Record<ServerLanguage, string> = {
  en: "Today's price briefing",
  sv: 'Dagens elpris-briefing',
};

export const PRICE_RECAP_COPY: Record<ServerLanguage, (cheapestHour: string, priciestHour: string) => string> = {
  en: (cheapestHour, priciestHour) => `Cheapest at ${cheapestHour}, priciest at ${priciestHour}.`,
  sv: (cheapestHour, priciestHour) => `Billigast kl ${cheapestHour}, dyrast kl ${priciestHour}.`,
};

export const APPLIANCE_NOTE_COPY: Record<ServerLanguage, (applianceLabel: string, clock?: string) => string> = {
  en: (applianceLabel, clock) =>
    clock ? `Good time to run ${applianceLabel} at ${clock} today.` : `Good time to run ${applianceLabel} today.`,
  sv: (applianceLabel, clock) =>
    clock ? `Bra läge att köra ${applianceLabel} kl ${clock} idag.` : `Bra läge att köra ${applianceLabel} idag.`,
};

export type WeatherPrepCopyKey = 'coldSnapEv' | 'coldSnapGeneric' | 'dryingWindow';

export const WEATHER_TIP_COPY: Record<ServerLanguage, Record<WeatherPrepCopyKey, string>> = {
  en: {
    coldSnapEv: 'Cold tomorrow morning. Preheat the car while it is still plugged in.',
    coldSnapGeneric: 'Cold tomorrow morning, so heating will use more power than usual.',
    dryingWindow: 'Windy and clear this afternoon, good weather for drying laundry outside.',
  },
  sv: {
    coldSnapEv: 'Kallt imorgon bitti. Förvärm bilen medan den är inkopplad.',
    coldSnapGeneric: 'Kallt imorgon bitti, så uppvärmningen drar mer el än vanligt.',
    dryingWindow: 'Blåsigt och klart i eftermiddag, bra väder att torka tvätt ute.',
  },
};

export const HEATING_PLAN_COPY: Record<ServerLanguage, (bankStart: string, bankEnd: string, coastStart: string, coastEnd: string) => string> = {
  en: (bankStart, bankEnd, coastStart, coastEnd) =>
    `Heat the house ${bankStart}–${bankEnd} and turn it down a little ${coastStart}–${coastEnd}, when power is dearest.`,
  sv: (bankStart, bankEnd, coastStart, coastEnd) =>
    `Värm upp huset ${bankStart}–${bankEnd} och sänk lite ${coastStart}–${coastEnd}, när elen är som dyrast.`,
};

export const PRICE_ALERT_HIGH_COPY: Record<ServerLanguage, (zone: string, peakOre: number, peakHourLabel: string) => { title: string; body: string }> = {
  en: (zone, peakOre, peakHourLabel) => ({
    title: 'Price spike tomorrow',
    body: `In ${zoneArea('en', zone)} the price reaches ${peakOre} öre/kWh tomorrow at ${peakHourLabel}, above your alert limit.`,
  }),
  sv: (zone, peakOre, peakHourLabel) => ({
    title: 'Pristopp imorgon',
    body: `I ${zoneArea('sv', zone)} går priset upp till ${peakOre} öre/kWh imorgon kl ${peakHourLabel}, över din gräns.`,
  }),
};

export const PRICE_ALERT_LOW_COPY: Record<ServerLanguage, (zone: string, cheapestHourLabel: string) => { title: string; body: string }> = {
  en: (zone, cheapestHourLabel) => ({
    title: 'Super-cheap prices tomorrow',
    body: `In ${zoneArea('en', zone)} the price is very low or below zero tomorrow around ${cheapestHourLabel}. A good time to use electricity.`,
  }),
  sv: (zone, cheapestHourLabel) => ({
    title: 'Superlåga priser imorgon',
    body: `I ${zoneArea('sv', zone)} är priset mycket lågt eller under noll imorgon runt kl ${cheapestHourLabel}. Ett bra läge att använda el.`,
  }),
};

export const APPLIANCE_WINDOW_COPY: Record<ServerLanguage, (applianceLabel: string) => { title: string; body: string }> = {
  en: (applianceLabel) => ({
    title: 'Cheap window now',
    body: `Now's a good time to run ${applianceLabel}.`,
  }),
  sv: (applianceLabel) => ({
    title: 'Billigt läge nu',
    body: `Nu är det ett bra läge att köra ${applianceLabel}.`,
  }),
};

// ---- Smart "good time now" pushes (Pro), see smartPushes.ts ----

const APPLIANCE_NAMES: Record<ServerLanguage, Record<string, string>> = {
  sv: {
    washing_machine: 'tvättmaskinen',
    dishwasher: 'diskmaskinen',
    dryer: 'torktumlaren',
    ev: 'billaddningen',
    sauna: 'bastun',
    pool_heater: 'poolvärmen',
  },
  en: {
    washing_machine: 'the washing machine',
    dishwasher: 'the dishwasher',
    dryer: 'the tumble dryer',
    ev: 'the car charging',
    sauna: 'the sauna',
    pool_heater: 'the pool heater',
  },
};

/** Name of a preset appliance as it reads inside a sentence ("diskmaskinen"). */
export function applianceName(language: ServerLanguage, presetId: string): string {
  return APPLIANCE_NAMES[language][presetId] ?? presetId;
}

/** "A", "A och B", "A, B och C" (sv) / "A and B" (en). */
export function joinNames(language: ServerLanguage, names: string[]): string {
  const and = language === 'sv' ? ' och ' : ' and ';
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')}${and}${names[names.length - 1]}`;
}

/** Short nouns for "see the cheapest times tonight for …" (tvätt, disk, bilen). */
const PLAN_READY_NOUNS: Record<ServerLanguage, Record<string, string>> = {
  sv: { laundry: 'tvätt', dishwasher: 'disk', ev: 'bilen', pool_heater: 'poolen' },
  en: { laundry: 'laundry', dishwasher: 'dishes', ev: 'the car', pool_heater: 'the pool' },
};

/**
 * The publish-time push for Pro users who get tonight's plan at 19:00 (about
 * 13:00, when tomorrow's prices arrive). `kinds` are the night slots, e.g.
 * ['washing_machine+dryer', 'dishwasher', 'ev']. Unknown kinds (registered
 * appliances that match no preset) are left out of the list.
 */
export function planReadyCopy(language: ServerLanguage, kinds: string[]): { title: string; body: string } {
  const nouns: string[] = [];
  for (const kind of kinds) {
    const parts = kind.split('+');
    const key = parts.some((p) => p === 'washing_machine' || p === 'dryer') ? 'laundry' : parts[0];
    const noun = PLAN_READY_NOUNS[language][key];
    if (noun && !nouns.includes(noun)) nouns.push(noun);
  }
  const list = joinNames(language, nouns);
  if (language === 'sv') {
    return {
      title: 'Din plan för i natt är klar',
      body: list
        ? `Morgondagens elpriser är här. Se de billigaste tiderna i natt för ${list}.`
        : 'Morgondagens elpriser är här. Se de billigaste tiderna i natt i appen.',
    };
  }
  return {
    title: "Tonight's plan is ready",
    body: list
      ? `Tomorrow's prices are here. See the cheapest times tonight for ${list}.`
      : "Tomorrow's prices are here. See the cheapest times tonight in the app.",
  };
}

interface SmartPushCopy {
  applianceNow: (names: string, until: string, saving: string) => { title: string; body: string };
  applianceTonight: (names: string, clock: string, saving: string) => { title: string; body: string };
  evTonight: (clock: string, saving: string) => { title: string; body: string };
  evAndAppliancesTonight: (names: string, clock: string, saving: string) => { title: string; body: string };
  heatAhead: (bankEnd: string, coastStart: string, coastEnd: string) => { title: string; body: string };
  cheapNow: (ore: string) => { title: string; body: string };
  /** One line in the 19:00 "Kvällens plan" list, e.g. "Diskmaskinen 03:30–05:30". */
  tonightItem: (name: string, start: string, end: string) => string;
  /** The 19:00 push: one line per slot, then the car, then the saving. */
  tonight: (lines: string[], evClock: string | null, saving: string) => { title: string; body: string };
}

export const SMART_PUSH_COPY: Record<ServerLanguage, SmartPushCopy> = {
  sv: {
    applianceNow: (names, until, saving) => ({
      title: 'Bra läge nu',
      body: `Hej! Starta ${names} nu, elen är billig fram till kl ${until}. Du sparar ungefär ${saving} kr jämfört med i kväll.`,
    }),
    applianceTonight: (names, clock, saving) => ({
      title: 'Billigt i natt',
      body: `Ställ in ${names} på fördröjd start till kl ${clock}. Du sparar ungefär ${saving} kr.`,
    }),
    evTonight: (clock, saving) => ({
      title: 'Ladda bilen i natt',
      body: `Billigast att ladda från kl ${clock}. Koppla in bilen innan du går och lägger dig, så sparar du ungefär ${saving} kr.`,
    }),
    evAndAppliancesTonight: (names, clock, saving) => ({
      title: 'Billigt i natt',
      body: `Elen är billigast i natt från kl ${clock}. Koppla in bilen och ställ in ${names} på fördröjd start. Du sparar ungefär ${saving} kr.`,
    }),
    heatAhead: (bankEnd, coastStart, coastEnd) => ({
      title: 'Värm upp huset nu',
      body: `Elen är billig fram till kl ${bankEnd}. Värm upp nu och sänk lite kl ${coastStart} till ${coastEnd}, då blir det dyrt.`,
    }),
    tonightItem: (name, start, end) => `${name} ${start}–${end}`,
    tonight: (lines, evClock, saving) => ({
      title: 'Kvällens plan',
      body: [
        lines.length ? `Billigast i natt, ställ in fördröjd start:\n${lines.map((l) => `• ${l}`).join('\n')}` : null,
        evClock ? `${lines.length ? '• ' : ''}Ladda bilen från kl ${evClock}` : null,
        `Du sparar ungefär ${saving} kr.`,
      ]
        .filter(Boolean)
        .join('\n'),
    }),
    cheapNow: (ore) => ({
      title: 'Billig el just nu',
      body: `Spotpriset är bara ${ore} öre/kWh just nu, långt under dagens snitt. Bra läge för tvätt, disk eller laddning.`,
    }),
  },
  en: {
    applianceNow: (names, until, saving) => ({
      title: 'Good time now',
      body: `Hi! Start ${names} now, power is cheap until ${until}. You save about ${saving} kr compared with this evening.`,
    }),
    applianceTonight: (names, clock, saving) => ({
      title: 'Cheap tonight',
      body: `Set ${names} to delayed start at ${clock}. You save about ${saving} kr.`,
    }),
    evTonight: (clock, saving) => ({
      title: 'Charge the car tonight',
      body: `Cheapest to charge from ${clock}. Plug in before bed and you save about ${saving} kr.`,
    }),
    evAndAppliancesTonight: (names, clock, saving) => ({
      title: 'Cheap tonight',
      body: `Power is cheapest tonight from ${clock}. Plug in the car and set ${names} to delayed start. You save about ${saving} kr.`,
    }),
    heatAhead: (bankEnd, coastStart, coastEnd) => ({
      title: 'Heat the house now',
      body: `Power is cheap until ${bankEnd}. Heat up now and turn down a little from ${coastStart} to ${coastEnd}, when it gets expensive.`,
    }),
    tonightItem: (name, start, end) => `${name} ${start}–${end}`,
    tonight: (lines, evClock, saving) => ({
      title: "Tonight's plan",
      body: [
        lines.length ? `Cheapest tonight, set delayed start:\n${lines.map((l) => `• ${l}`).join('\n')}` : null,
        evClock ? `${lines.length ? '• ' : ''}Charge the car from ${evClock}` : null,
        `You save about ${saving} kr.`,
      ]
        .filter(Boolean)
        .join('\n'),
    }),
    cheapNow: (ore) => ({
      title: 'Cheap power right now',
      body: `The spot price is only ${ore} öre/kWh right now, well below today's average. Good time for laundry, dishes or charging.`,
    }),
  },
};
