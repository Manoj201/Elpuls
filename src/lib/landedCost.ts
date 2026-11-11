// 2026 standard rate, excl. VAT. Simplification: doesn't model the reduced
// electricity-tax exemption available in parts of northern Sweden.
export const ENERGY_TAX_SEK_PER_KWH_EXCL_VAT = 0.36;

// Representative figure (varies slightly by retailer), excl. VAT.
export const ELCERTIFICATE_SEK_PER_KWH_EXCL_VAT = 0.014;

export const VAT_RATE = 0.25;

/**
 * elprisetjustnu.se's own docs: "Alla priser är utan moms, tillägg och
 * skatter" — the spot price is VAT- and tax-exclusive. This adds the
 * pieces a real Swedish electricity bill actually has: the user's
 * self-reported variable grid fee (nätavgift), the national energy tax,
 * elcertifikat, the retailer's own markup, then 25% VAT on the whole total.
 *
 * `retailerMarkupSekPerKwh` (the elhandelsbolag's "rörliga kostnader" +
 * "fast påslag", confirmed against a real invoice to be a real ~11 öre/kWh
 * gap — see CLAUDE.md §3) is only known once the electricity bill scan
 * feature lands; until then callers pass `null` and this function treats
 * it as 0, same as today's grid-only approximation.
 *
 * This is an affine transform of spot (same +C, ×1.25 applied to every
 * hour), so which hour is cheapest/priciest is unchanged between spot and
 * landed views — only the displayed numbers differ.
 */
export function calculateLandedPrice(
  spotPriceExclVat: number,
  gridFeeVariableSekPerKwh: number,
  retailerMarkupSekPerKwh: number | null = null,
): number {
  const exclVat =
    spotPriceExclVat +
    gridFeeVariableSekPerKwh +
    ENERGY_TAX_SEK_PER_KWH_EXCL_VAT +
    ELCERTIFICATE_SEK_PER_KWH_EXCL_VAT +
    (retailerMarkupSekPerKwh ?? 0);
  return exclVat * (1 + VAT_RATE);
}

export interface LandedPriceBreakdown {
  spot: number;
  gridFee: number;
  energyTax: number;
  elcertifikat: number;
  retailerMarkup: number;
  vat: number;
  total: number;
}

/** Same inputs as calculateLandedPrice, but returns the itemized parts for display (Statistik screen). */
export function landedPriceBreakdown(
  spotPriceExclVat: number,
  gridFeeVariableSekPerKwh: number,
  retailerMarkupSekPerKwh: number | null = null,
): LandedPriceBreakdown {
  const retailerMarkup = retailerMarkupSekPerKwh ?? 0;
  const exclVat = spotPriceExclVat + gridFeeVariableSekPerKwh + ENERGY_TAX_SEK_PER_KWH_EXCL_VAT + ELCERTIFICATE_SEK_PER_KWH_EXCL_VAT + retailerMarkup;
  const vat = exclVat * VAT_RATE;

  return {
    spot: spotPriceExclVat,
    gridFee: gridFeeVariableSekPerKwh,
    energyTax: ENERGY_TAX_SEK_PER_KWH_EXCL_VAT,
    elcertifikat: ELCERTIFICATE_SEK_PER_KWH_EXCL_VAT,
    retailerMarkup,
    vat,
    total: exclVat + vat,
  };
}
