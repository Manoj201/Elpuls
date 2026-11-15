export type ServerLanguage = 'en' | 'sv';

/** Defaults to 'sv' when missing — matches the app's actual behavior before per-user language was tracked, least disruptive while the Firestore mirror (src/i18n/index.ts) backfills existing installs. */
export function resolveServerLanguage(value: unknown): ServerLanguage {
  return value === 'en' ? 'en' : 'sv';
}

export const PRICE_PUBLISHED_COPY: Record<ServerLanguage, (zone: string, dateKey: string) => { title: string; body: string }> = {
  en: (zone, dateKey) => ({
    title: "Tomorrow's electricity prices are here",
    body: `Prices for ${zone} on ${dateKey} are now available.`,
  }),
  sv: (zone, dateKey) => ({
    title: 'Morgondagens elpriser är här',
    body: `Priserna för ${zone} den ${dateKey} är nu tillgängliga.`,
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
    coldSnapEv: 'Cold snap tomorrow morning — preheat your EV before you leave.',
    coldSnapGeneric: 'Cold snap tomorrow morning — dress warm.',
    dryingWindow: 'Windy and clear this afternoon — good laundry-drying window.',
  },
  sv: {
    coldSnapEv: 'Kallt imorgon bitti — förvärm elbilen innan du åker.',
    coldSnapGeneric: 'Kallt imorgon bitti — klä varmt.',
    dryingWindow: 'Blåsigt och klart i eftermiddag — bra tvättorkningsväder.',
  },
};

export const HEATING_PLAN_COPY: Record<ServerLanguage, (bankStart: string, bankEnd: string, coastStart: string, coastEnd: string) => string> = {
  en: (bankStart, bankEnd, coastStart, coastEnd) =>
    `Bank heat ${bankStart}-${bankEnd}, let it drift ${coastStart}-${coastEnd} during the evening peak.`,
  sv: (bankStart, bankEnd, coastStart, coastEnd) =>
    `Lagra värme ${bankStart}-${bankEnd}, låt den sjunka ${coastStart}-${coastEnd} under kvällstoppen.`,
};

export const PRICE_ALERT_HIGH_COPY: Record<ServerLanguage, (zone: string, peakOre: number, peakHourLabel: string) => { title: string; body: string }> = {
  en: (zone, peakOre, peakHourLabel) => ({
    title: 'Price spike tomorrow',
    body: `${zone} peaks at ${peakOre} öre/kWh tomorrow at ${peakHourLabel} — above your alert threshold.`,
  }),
  sv: (zone, peakOre, peakHourLabel) => ({
    title: 'Pristopp imorgon',
    body: `${zone} toppar på ${peakOre} öre/kWh imorgon kl ${peakHourLabel} — över din varningsgräns.`,
  }),
};

export const PRICE_ALERT_LOW_COPY: Record<ServerLanguage, (zone: string, cheapestHourLabel: string) => { title: string; body: string }> = {
  en: (zone, cheapestHourLabel) => ({
    title: 'Super-cheap prices tomorrow',
    body: `${zone} has a negative or very low price tomorrow around ${cheapestHourLabel} — a great time to use electricity.`,
  }),
  sv: (zone, cheapestHourLabel) => ({
    title: 'Superlåga priser imorgon',
    body: `${zone} har ett negativt eller mycket lågt pris imorgon kring kl ${cheapestHourLabel} — ett bra läge att använda el.`,
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

interface SmartPushCopy {
  applianceNow: (names: string, saving: string) => { title: string; body: string };
  applianceTonight: (names: string, clock: string, saving: string) => { title: string; body: string };
  evTonight: (clock: string, saving: string) => { title: string; body: string };
  evAndAppliancesTonight: (names: string, clock: string, saving: string) => { title: string; body: string };
  heatAhead: (bankEnd: string, coastStart: string, coastEnd: string) => { title: string; body: string };
  cheapNow: (ore: string) => { title: string; body: string };
}

export const SMART_PUSH_COPY: Record<ServerLanguage, SmartPushCopy> = {
  sv: {
    applianceNow: (names, saving) => ({
      title: 'Bra läge nu',
      body: `Hej! Starta ${names} nu. Du sparar ungefär ${saving} kr jämfört med i kväll.`,
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
    cheapNow: (ore) => ({
      title: 'Billig el just nu',
      body: `Spotpriset är bara ${ore} öre/kWh just nu, långt under dagens snitt. Bra läge för tvätt, disk eller laddning.`,
    }),
  },
  en: {
    applianceNow: (names, saving) => ({
      title: 'Good time now',
      body: `Hi! Start ${names} now. You save about ${saving} kr compared with this evening.`,
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
    cheapNow: (ore) => ({
      title: 'Cheap power right now',
      body: `The spot price is only ${ore} öre/kWh right now, well below today's average. Good time for laundry, dishes or charging.`,
    }),
  },
};
