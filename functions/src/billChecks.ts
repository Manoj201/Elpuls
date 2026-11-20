/**
 * Plausibility checks for a scanned electricity bill, done in code (not by
 * the AI), so a misread value is flagged before the user saves it. Each
 * flagged field gets a reason; the app shows "Kontrollera mot fakturan" next
 * to it. Values are only changed for one safe case: a per-kWh fee clearly
 * read in kr instead of öre (×100), and that change is flagged too.
 */

export type BillField =
  | 'gridFeeVariableOrePerKwh'
  | 'gridFeeFixedSekPerMonth'
  | 'retailerMarkupOrePerKwh'
  | 'retailerFixedSekPerMonth'
  | 'consumption';

export type CheckReason =
  /** rate × kWh doesn't match the amount on that line. */
  | 'lineMismatch'
  /** Outside what Swedish bills normally show. */
  | 'outOfRange'
  /** Read in kr instead of öre; converted. */
  | 'unitFixed'
  /** The grid fee equals the energy tax: probably the wrong line. */
  | 'looksLikeTax'
  /** The markup is as high as a spot price: probably the spot line. */
  | 'looksLikeSpot'
  /** A fixed fee's unit (year/month/day) was taken from the amount on its line. */
  | 'periodFixed'
  /** Nothing on the bill could confirm the value (no lines, no matching totals). */
  | 'unverified';

export interface BillCheck {
  field: BillField;
  reason: CheckReason;
}

export interface BillValues {
  gridFeeVariableOrePerKwh: number | null;
  gridFeeFixedSekPerMonth: number | null;
  retailerMarkupOrePerKwh: number | null;
  retailerFixedSekPerMonth: number | null;
  consumptionKwh: number | null;
  periodDays: number | null;
}

export interface LineSums {
  /** Amount (kr, excl. VAT) in the sum column of the grid's per-kWh transfer line(s). */
  gridVariableLineSumKr: number | null;
  /** Amount (kr, excl. VAT) of the retailer's markup line(s) together. */
  retailerMarkupLineSumKr: number | null;
  /** The spot price line's rate (öre/kWh), to catch it being taken as the markup at any price level. */
  spotPriceOrePerKwh?: number | null;
  /** Each markup line as printed (rate and amount), checked one by one. */
  retailerMarkupLines?: { label: string; orePerKwh: number; sumKr: number | null }[];
  /** A printed total price per kWh for the supplier part ("Ditt elpris … öre/kWh består av"), = spot + markup. */
  totalEnergyPriceOrePerKwh?: number | null;
  /** The supplier part's total before VAT ("Moms 25 % av 1 101,59 kr"), kr. */
  retailerSubtotalExclVatKr?: number | null;
  /** The supplier's fixed fee for this bill's period, kr excl. VAT (from its line). */
  retailerFixedPeriodKr?: number | null;
}

/** Energy tax per kWh excl. VAT (2025: 43.9 öre, 2026: 36.0 öre; lower in parts of the north). */
const ENERGY_TAX_ORE = [43.9, 36.0, 34.4, 26.4];
/** Line names that are markup even when they mention spot ("Fast påslag spot"). */
const MARKUP_LABEL = /påslag|rörlig|tillägg/i;
/** Line names that are never part of the retailer's markup. */
const NOT_MARKUP_LABEL = /spot|elpris|energiskatt|skatt|elöverföring|överföring|abonnemang|nätavgift|moms|årsavgift|månadsavgift|fast avgift|självfakturering|ersättning|inmatning|produktion/i;
/** rate × kWh may differ this much from the line's amount (rounding, a price change mid-period). */
const LINE_TOLERANCE = 0.08;
const RANGES: Record<Exclude<BillField, 'consumption'>, [number, number]> = {
  gridFeeVariableOrePerKwh: [3, 120],
  gridFeeFixedSekPerMonth: [30, 4000],
  retailerMarkupOrePerKwh: [0, 60],
  retailerFixedSekPerMonth: [0, 300],
};

function close(a: number, b: number, tolerance: number): boolean {
  if (b === 0) return Math.abs(a) < 0.5;
  return Math.abs(a - b) / Math.abs(b) <= tolerance;
}

/**
 * A per-kWh fee against its line amount. Returns the value to use and the
 * reason it was flagged (null = fine or not checkable).
 */
function checkPerKwh(
  ore: number,
  kwh: number | null,
  lineSumKr: number | null,
): { value: number; reason: CheckReason | null } {
  if (kwh && kwh > 0 && lineSumKr && lineSumKr > 0) {
    if (close((ore * kwh) / 100, lineSumKr, LINE_TOLERANCE)) return { value: ore, reason: null };
    // Read in kr (0,356) instead of öre (35,6)?
    if (close((ore * 100 * kwh) / 100, lineSumKr, LINE_TOLERANCE)) return { value: Math.round(ore * 100 * 100) / 100, reason: 'unitFixed' };
    return { value: ore, reason: 'lineMismatch' };
  }
  return { value: ore, reason: null };
}

/** Runs every check; returns the (possibly corrected) values and the flags. */
export function checkBill(values: BillValues, sums: LineSums): { values: BillValues; checks: BillCheck[] } {
  const out = { ...values };
  const checks: BillCheck[] = [];
  const flag = (field: BillField, reason: CheckReason) => {
    if (!checks.some((c) => c.field === field)) checks.push({ field, reason });
  };

  // Grid transfer fee (öre/kWh).
  if (out.gridFeeVariableOrePerKwh !== null) {
    let v = out.gridFeeVariableOrePerKwh;
    const line = checkPerKwh(v, out.consumptionKwh, sums.gridVariableLineSumKr);
    v = line.value;
    // Without a line amount: a transfer fee under 1 öre is a kr value.
    if (!line.reason && v > 0 && v < 1) {
      v = Math.round(v * 100 * 100) / 100;
      flag('gridFeeVariableOrePerKwh', 'unitFixed');
    }
    if (line.reason) flag('gridFeeVariableOrePerKwh', line.reason);
    if (ENERGY_TAX_ORE.some((tax) => Math.abs(v - tax) < 0.05)) flag('gridFeeVariableOrePerKwh', 'looksLikeTax');
    const [lo, hi] = RANGES.gridFeeVariableOrePerKwh;
    if (v < lo || v > hi) flag('gridFeeVariableOrePerKwh', 'outOfRange');
    out.gridFeeVariableOrePerKwh = v;
  }

  // Retailer markup from its lines: the code adds the rates up (not the AI),
  // and every line must match its own amount (rate × kWh). One misread digit
  // on a photo (4,05 → 5,05) then shows up, even if the AI also "adjusts"
  // the total to match (seen 2026-11-20).
  // Only real markup lines: never the spot price, energy tax, grid or fixed
  // fees, VAT or solar self-billing, by name or by value (the AI sometimes
  // lists them; seen 2026-11-20 on photos).
  const spotOre = sums.spotPriceOrePerKwh ?? null;
  const lines = (sums.retailerMarkupLines ?? []).filter(
    (l) =>
      Number.isFinite(l.orePerKwh) &&
      l.orePerKwh > 0 &&
      l.orePerKwh <= RANGES.retailerMarkupOrePerKwh[1] &&
      (MARKUP_LABEL.test(l.label) || !NOT_MARKUP_LABEL.test(l.label)) &&
      !(spotOre !== null && Math.abs(l.orePerKwh - spotOre) < 0.05) &&
      !ENERGY_TAX_ORE.some((tax) => Math.abs(l.orePerKwh - tax) < 0.05),
  );
  const listed = (sums.retailerMarkupLines ?? []).length;
  if (listed > 0 && lines.length === 0) {
    // Every listed line was something else (spot, tax, grid…): no markup on this bill.
    out.retailerMarkupOrePerKwh = null;
  }
  // Whether anything on the bill confirmed the markup (its own lines, the printed total price, the subtotal).
  let markupVerified = false;
  if (lines.length > 0) {
    markupVerified = true;
    out.retailerMarkupOrePerKwh = Math.round(lines.reduce((s, l) => s + l.orePerKwh, 0) * 100) / 100;
    const kwh = out.consumptionKwh;
    if (kwh && kwh > 0) {
      for (const l of lines) {
        if (l.sumKr !== null && l.sumKr > 0 && !close((l.orePerKwh * kwh) / 100, l.sumKr, LINE_TOLERANCE)) {
          flag('retailerMarkupOrePerKwh', 'lineMismatch');
        }
      }
    }
  }

  // Retailer markup (öre/kWh). Under 1 öre can be real, so only the line check may convert it.
  if (out.retailerMarkupOrePerKwh !== null && lines.length === 0) {
    const line = checkPerKwh(out.retailerMarkupOrePerKwh, out.consumptionKwh, sums.retailerMarkupLineSumKr);
    out.retailerMarkupOrePerKwh = line.value;
    if (line.reason) flag('retailerMarkupOrePerKwh', line.reason);
    // The lines' total matched rate × kWh: that confirms it too.
    else if (sums.retailerMarkupLineSumKr && out.consumptionKwh) markupVerified = true;
  }
  if (out.retailerMarkupOrePerKwh !== null) {
    // Spot + markup must add up to a printed total price per kWh, when the bill has one
    // (catches a markup line that was left out).
    const total = sums.totalEnergyPriceOrePerKwh ?? null;
    if (total !== null && total > 0 && (sums.spotPriceOrePerKwh ?? null) !== null) {
      if (Math.abs((sums.spotPriceOrePerKwh as number) + out.retailerMarkupOrePerKwh - total) > 0.15) flag('retailerMarkupOrePerKwh', 'lineMismatch');
      else markupVerified = true;
    }
    // The supplier part's total before VAT, printed elsewhere on the bill:
    // (spot + markup) × kWh + the fixed fee must add up to it. Catches a
    // misread rate even when the AI also "adjusts" the line amounts to match
    // (seen 2026-11-20 on a photo: 4,05 read as 5,05 with a made-up 61,36 kr).
    const subtotal = sums.retailerSubtotalExclVatKr ?? null;
    const spotRate = sums.spotPriceOrePerKwh ?? null;
    if (subtotal !== null && subtotal > 0 && spotRate !== null && out.consumptionKwh) {
      const fixedPeriod =
        sums.retailerFixedPeriodKr ??
        (out.retailerFixedSekPerMonth !== null && out.periodDays
          ? (out.retailerFixedSekPerMonth / 1.25) * (out.periodDays / (365 / 12))
          : 0);
      const expected = ((spotRate + out.retailerMarkupOrePerKwh) * out.consumptionKwh) / 100 + fixedPeriod;
      const diff = Math.abs(expected - subtotal);
      // A big gap means the wrong total was read (e.g. the whole bill's, grid
      // included), not a wrong markup: then this check says nothing.
      if (diff <= Math.max(2, subtotal * 0.004)) markupVerified = true;
      else if (diff <= subtotal * 0.25) flag('retailerMarkupOrePerKwh', 'lineMismatch');
    }
    const spot = sums.spotPriceOrePerKwh ?? null;
    if (spot !== null && spot > 0 && Math.abs(out.retailerMarkupOrePerKwh - spot) < 0.05) flag('retailerMarkupOrePerKwh', 'looksLikeSpot');
    if (out.retailerMarkupOrePerKwh > RANGES.retailerMarkupOrePerKwh[1]) flag('retailerMarkupOrePerKwh', 'looksLikeSpot');
    // Never trust a markup nothing could confirm (seen: a photo where the AI listed
    // no lines and no spot price, and silently dropped one markup line).
    if (!markupVerified) flag('retailerMarkupOrePerKwh', 'unverified');
  }

  for (const field of ['gridFeeFixedSekPerMonth', 'retailerFixedSekPerMonth'] as const) {
    const v = out[field];
    if (v === null) continue;
    const [lo, hi] = RANGES[field];
    if (v < lo || v > hi) flag(field, 'outOfRange');
  }

  // Usage: per month between 20 and 8 000 kWh, period between 1 and 100 days.
  if (out.consumptionKwh !== null) {
    const days = out.periodDays;
    if (days !== null && (days < 1 || days > 100)) {
      flag('consumption', 'outOfRange');
    } else if (days) {
      const perMonth = (out.consumptionKwh / days) * (365 / 12);
      if (perMonth < 20 || perMonth > 8000) flag('consumption', 'outOfRange');
    }
  }

  return { values: out, checks };
}

/**
 * Which side(s) a bill covers, from what was actually found: a "combined"
 * answer with no supplier values is a grid bill (and the other way round).
 * Saving a "combined" result writes both sides, so a misread type would wipe
 * the side scanned from the other bill (seen 2026-11-20 on a photo of a grid
 * bill's price page).
 */
export function resolveBillType(
  modelType: 'retailer' | 'grid' | 'combined',
  values: BillValues,
  names: { retailerName: string | null; gridCompanyName: string | null },
): 'retailer' | 'grid' | 'combined' {
  const hasRetailer = values.retailerMarkupOrePerKwh !== null || values.retailerFixedSekPerMonth !== null;
  const hasGrid = values.gridFeeVariableOrePerKwh !== null || values.gridFeeFixedSekPerMonth !== null;
  if (hasGrid && !hasRetailer) return 'grid';
  if (hasRetailer && !hasGrid) return 'retailer';
  if (!hasGrid && !hasRetailer) return names.gridCompanyName && !names.retailerName ? 'grid' : names.retailerName && !names.gridCompanyName ? 'retailer' : modelType;
  return 'combined';
}

// ---------------------------------------------------------------- fixed fees

export type FeePer = 'year' | 'month' | 'day';

export interface FixedFeeLine {
  label: string;
  /** The AI's guess; the line name wins when it's clear. */
  side: 'grid' | 'retailer' | null;
  rate: number;
  per: FeePer | null;
  includesVat: boolean | null;
  /** Days or the period the line covers, and its amount in kr. */
  days: number | null;
  sumKr: number | null;
}

const DAYS_PER_YEAR = 365;
const DAYS_PER_MONTH = 365 / 12;
const GRID_LABEL = /nät|abonnemang|säkring|effekt/i;
const RETAILER_LABEL = /elavtal|elhandel|elhandels/i;
/** Lines that are never a fixed fee: VAT, taxes, totals, rounding, per-kWh lines (seen: "Moms" listed as a fee on a photo). */
const NOT_FEE_LABEL = /moms|skatt|summa|totalt|öresutjämning|avrundning|överföring|spot|påslag|rörlig|ersättning|produktion|kwh/i;
const FEE_TOLERANCE = 0.1;

/** Kr per month incl. VAT from a rate as printed. */
export function monthlyInclVat(rate: unknown, per: unknown, includesVat: unknown): number | null {
  if (typeof rate !== 'number' || !Number.isFinite(rate) || rate < 0) return null;
  const perMonth = per === 'year' ? rate / 12 : per === 'day' ? rate * DAYS_PER_MONTH : per === 'month' ? rate : null;
  if (perMonth === null) return null;
  const withVat = includesVat === true ? perMonth : perMonth * 1.25;
  return Math.round(withVat * 100) / 100;
}

/** What a rate comes to for `days` days. */
function periodAmount(rate: number, per: FeePer, days: number): number {
  return per === 'year' ? (rate * days) / DAYS_PER_YEAR : per === 'month' ? (rate * days) / DAYS_PER_MONTH : rate * days;
}

/**
 * The grid's and the supplier's fixed fees from the fee lines as printed.
 * The line name decides the side when it's clear ("Elnätsabonnemang" → grid,
 * "Elavtal årsavgift" → supplier), and the unit is checked against the
 * line's own amount: 384 kr/year × 30/365 = 31,56 kr fits, 384 kr/day doesn't.
 * A wrong unit is corrected when exactly one unit fits (and flagged).
 * Seen 2026-11-20 on a phone photo of an E.ON bill: the two fees swapped
 * sides and a yearly fee read as per day.
 */
export function fixedFeesFromLines(
  lines: FixedFeeLine[],
  periodDays: number | null,
  /** The AI's bill type: on a single-company bill, an unclear line ("Årsavgift") belongs to that company. */
  billType: 'retailer' | 'grid' | 'combined' = 'combined',
): { grid: number | null; retailer: number | null; checks: BillCheck[] } {
  const checks: BillCheck[] = [];
  const total: Record<'grid' | 'retailer', number | null> = { grid: null, retailer: null };
  for (const l of lines) {
    if (!Number.isFinite(l.rate) || l.rate <= 0) continue;
    if (NOT_FEE_LABEL.test(l.label)) continue;
    const side =
      GRID_LABEL.test(l.label) && !RETAILER_LABEL.test(l.label)
        ? 'grid'
        : RETAILER_LABEL.test(l.label)
          ? 'retailer'
          : billType !== 'combined'
            ? billType
            : l.side;
    if (side === null) continue;
    const field: BillField = side === 'grid' ? 'gridFeeFixedSekPerMonth' : 'retailerFixedSekPerMonth';
    let per: FeePer | null = l.per;
    const days = l.days ?? periodDays;
    if (l.sumKr !== null && l.sumKr > 0 && days && days > 0) {
      // Compare excl. VAT with excl. VAT: the printed amount is the line's own (excl. VAT on Swedish bills).
      const base = l.includesVat === true ? l.rate / 1.25 : l.rate;
      const fits = (p: FeePer) => close(periodAmount(base, p, days), l.sumKr as number, FEE_TOLERANCE) || close(periodAmount(l.rate, p, days), l.sumKr as number, FEE_TOLERANCE);
      if (per === null || !fits(per)) {
        const candidates = (['year', 'month', 'day'] as FeePer[]).filter(fits);
        if (candidates.length === 1) {
          if (per !== null) checks.push({ field, reason: 'periodFixed' });
          per = candidates[0];
        } else if (per !== null) {
          checks.push({ field, reason: 'lineMismatch' });
        }
      }
    }
    let monthly = monthlyInclVat(l.rate, per, l.includesVat);
    // A unit that gives an impossible fee (528 kr "per month" from the supplier)
    // when another unit gives a normal one: use that, and flag it. Year first.
    const [lo, hi] = RANGES[field as Exclude<BillField, 'consumption'>];
    if (monthly !== null && (monthly < lo || monthly > hi)) {
      for (const alt of ['year', 'month', 'day'] as FeePer[]) {
        if (alt === per) continue;
        const m = monthlyInclVat(l.rate, alt, l.includesVat);
        if (m !== null && m >= lo && m <= hi) {
          monthly = m;
          if (!checks.some((c) => c.field === field)) checks.push({ field, reason: 'periodFixed' });
          break;
        }
      }
    }
    if (monthly !== null) total[side] = Math.round(((total[side] ?? 0) + monthly) * 100) / 100;
  }
  return { grid: total.grid, retailer: total.retailer, checks };
}
