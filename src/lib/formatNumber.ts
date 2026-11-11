import type { SupportedLanguage } from '../i18n';

const LOCALE_BY_LANGUAGE: Record<SupportedLanguage, string> = {
  en: 'en-US',
  sv: 'sv-SE',
};

/** Formats a price with the decimal separator convention for the given UI language (comma for Swedish, period for English). */
export function formatPrice(value: number, language: SupportedLanguage): string {
  return value.toLocaleString(LOCALE_BY_LANGUAGE[language], {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Formats a per-kWh rate in öre instead of kr — e.g. "76,2" rather than
 * "0,76" — matching how Swedish spot-price apps conventionally display
 * rates (elprisetjustnu.se, Tibber, etc). Only for rates; a computed total
 * cost (running an appliance for N hours, an EV charging session) should
 * still use formatPrice/kr — "420 öre" reads oddly for an actual amount,
 * "4,20 kr" doesn't.
 */
export function formatOre(valueSekPerKwh: number, language: SupportedLanguage): string {
  return (valueSekPerKwh * 100).toLocaleString(LOCALE_BY_LANGUAGE[language], {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}
