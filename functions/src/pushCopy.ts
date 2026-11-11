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

export const APPLIANCE_NOTE_COPY: Record<ServerLanguage, (applianceLabel: string) => string> = {
  en: (applianceLabel) => `Good time to run ${applianceLabel} today.`,
  sv: (applianceLabel) => `Bra läge att köra ${applianceLabel} idag.`,
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
