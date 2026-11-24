import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import type Anthropic from '@anthropic-ai/sdk';
import { checkBill, fixedFeesFromLines, monthlyInclVat, resolveBillType, type BillCheck, type FixedFeeLine } from './billChecks';
import { CLAUDE_MODEL, logStopReason } from './claudeModel';

const SUPPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const PDF_MIME_TYPE = 'application/pdf';
const REPORT_TOOL_NAME = 'report_bill_markup';

interface ScanElectricityBillRequest {
  fileBase64: string;
  mimeType: string;
}

export type BillType = 'retailer' | 'grid' | 'combined';

/**
 * The three original fields are kept as-is so app versions before 1.1
 * (which only read those) keep working. Newer apps also read the bill type,
 * company names and fixed monthly fees, and save only the side of the bill
 * that was scanned, so a household with two bills (elhandel + elnät) can
 * scan both without the second overwriting the first.
 */
export interface ScanElectricityBillResult {
  billType: BillType;
  retailerName: string | null;
  gridCompanyName: string | null;
  gridFeeVariableOrePerKwh: number | null;
  /** Grid subscription fee (abonnemang / fast avgift / effektavgift as a flat fee), kr per month incl. VAT. */
  gridFeeFixedSekPerMonth: number | null;
  retailerMarkupOrePerKwh: number | null;
  /** Retailer's fixed fee (månadsavgift / årsavgift), kr per month incl. VAT. */
  retailerFixedSekPerMonth: number | null;
  /** Electricity used in the billing period (kWh) and how many days that period is, so the app can work out usage per month. */
  consumptionKwh: number | null;
  periodDays: number | null;
  confidence: 'high' | 'low';
  /** Fields that look wrong (checked in code: line totals, ranges, units). The app says "Kontrollera mot fakturan". */
  checks: BillCheck[];
}

const NUMBER_OR_NULL = ['number', 'null'];
const STRING_OR_NULL = ['string', 'null'];

/**
 * Callable from the app: takes a base64 photo or PDF of a Swedish
 * electricity bill (never persisted: read once, sent to Claude, discarded)
 * and extracts what the landed-cost formula needs. Swedish households often
 * get two bills (elhandel from the retailer, elnät from the local grid
 * company), sometimes one combined invoice, so the model first says which
 * kind this is and only fills in that side. The client always shows the
 * values back to the user to confirm or edit before saving.
 */
export const scanElectricityBill = onCall<ScanElectricityBillRequest>(
  { secrets: ['ANTHROPIC_API_KEY'] },
  async (request): Promise<ScanElectricityBillResult> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign-in required.');
    }

    const { fileBase64, mimeType } = request.data ?? ({} as ScanElectricityBillRequest);
    if (!fileBase64 || typeof fileBase64 !== 'string') {
      throw new HttpsError('invalid-argument', 'fileBase64 is required.');
    }
    const isPdf = mimeType === PDF_MIME_TYPE;
    if (!isPdf && !SUPPORTED_IMAGE_TYPES.has(mimeType)) {
      throw new HttpsError('invalid-argument', `Unsupported file type: ${mimeType}`);
    }

    // Lazy-loaded: see generateExplainer.ts for why (ESM transitive dep breaks Cloud Functions discovery if imported eagerly).
    const { default: AnthropicClient } = await import('@anthropic-ai/sdk');
    const anthropic = new AnthropicClient({ apiKey: process.env.ANTHROPIC_API_KEY });

    const fileContent: Anthropic.ContentBlockParam = isPdf
      ? { type: 'document', source: { type: 'base64', media_type: PDF_MIME_TYPE, data: fileBase64 } }
      : { type: 'image', source: { type: 'base64', media_type: mimeType as 'image/jpeg' | 'image/png' | 'image/webp', data: fileBase64 } };

    let message;
    try {
      message = await anthropic.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 2000,
        tool_choice: { type: 'tool', name: REPORT_TOOL_NAME },
        tools: [
          {
            name: REPORT_TOOL_NAME,
            description: 'Report the fees extracted from a Swedish electricity bill.',
            input_schema: {
              type: 'object',
              properties: {
                billType: {
                  type: 'string',
                  enum: ['retailer', 'grid', 'combined'],
                  description:
                    '"retailer" if this is only an elhandel bill (electricity supplier: spot price, påslag, månadsavgift), "grid" if it is only an elnät bill from the local grid company (elöverföring, abonnemang/nätabonnemang, effektavgift, energiskatt is often here too), "combined" if one invoice has both parts.',
                },
                retailerName: {
                  type: STRING_OR_NULL,
                  description: 'Name of the electricity supplier (elhandelsbolag), e.g. "Tibber", "Vattenfall". Null if the bill has no retailer part.',
                },
                gridCompanyName: {
                  type: STRING_OR_NULL,
                  description: 'Name of the grid company (nätbolag), e.g. "Ellevio", "E.ON Energidistribution". Null if the bill has no grid part.',
                },
                gridFeeVariableOrePerKwh: {
                  type: NUMBER_OR_NULL,
                  description:
                    'Grid company\'s variable transfer fee in öre/kWh EXCLUDING VAT, usually "Elöverföring" or "Överföringsavgift". Not energy tax. Null if not on this bill.',
                },
                gridFixedRate: {
                  type: NUMBER_OR_NULL,
                  description:
                    'Grid company\'s fixed fee ("Abonnemang", "Nätabonnemang", "Fast avgift") as the RATE printed in the price column (e.g. "6 468,00 kr/år" → 6468), NOT the period total in the sum column. Null if not on this bill.',
                },
                gridFixedPer: {
                  type: STRING_OR_NULL,
                  enum: ['year', 'month', 'day', null],
                  description: 'What gridFixedRate is per: "year" (kr/år), "month" (kr/mån) or "day" (kr/dygn). Null if not on this bill.',
                },
                gridFixedIncludesVat: {
                  type: ['boolean', 'null'],
                  description: 'True if gridFixedRate already includes VAT (moms). On Swedish bills where moms is a separate line at the end of the section, it does NOT. Null if not on this bill.',
                },
                retailerMarkupOrePerKwh: {
                  type: NUMBER_OR_NULL,
                  description:
                    'Retailer\'s own markup on top of the spot price, in öre/kWh EXCLUDING VAT: ADD UP the rates of lines like "Rörliga kostnader", "Fast påslag", "Fast påslag spot", "Påslag", "Tillägg". NEVER the "Spotpris"/"Medelspotpris" line (that is the market price), NOT the grid fee, NOT energy tax, NOT negative production/self-billing lines (solar sold to the grid). Null if not on this bill.',
                },
                retailerFixedRate: {
                  type: NUMBER_OR_NULL,
                  description:
                    'Retailer\'s fixed fee ("Årsavgift", "Månadsavgift", "Fast avgift") as the RATE printed in the price column (e.g. "6 468,00 kr/år" → 6468), NOT the period total in the sum column. Null if not on this bill.',
                },
                retailerFixedPer: {
                  type: STRING_OR_NULL,
                  enum: ['year', 'month', 'day', null],
                  description: 'What retailerFixedRate is per: "year" (kr/år), "month" (kr/mån) or "day" (kr/dygn). Null if not on this bill.',
                },
                retailerFixedIncludesVat: {
                  type: ['boolean', 'null'],
                  description: 'True if retailerFixedRate already includes VAT (moms). On Swedish bills where moms is a separate line at the end of the section, it does NOT. Null if not on this bill.',
                },
                consumptionKwh: {
                  type: NUMBER_OR_NULL,
                  description: 'Total electricity used in the billing period, in kWh ("Förbrukning", the kWh quantity on the spot price or elöverföring line). Null if not shown.',
                },
                fixedFeeLines: {
                  type: 'array',
                  description:
                    'Every FIXED fee line on the bill (subscription/abonnemang, månadsavgift, årsavgift, fast avgift), from both the grid company and the supplier, exactly as printed. Read each number separately; do not calculate them. Empty if none.',
                  items: {
                    type: 'object',
                    properties: {
                      label: { type: 'string', description: 'The line name as printed, e.g. "Elnätsabonnemang månadsavgift" or "Elavtal årsavgift".' },
                      side: { type: STRING_OR_NULL, enum: ['grid', 'retailer', null], description: 'Which company the line belongs to: the grid company (elnät) or the electricity supplier (elhandel).' },
                      rate: { type: 'number', description: 'The rate printed on the line, kr (e.g. "384 kr" → 384, "6 468,00 kr/år" → 6468).' },
                      per: { type: STRING_OR_NULL, enum: ['year', 'month', 'day', null], description: 'What the rate is per: "årsavgift"/"kr/år" = year, "månadsavgift"/"kr/mån" = month, "kr/dygn" = day.' },
                      includesVat: { type: ['boolean', 'null'], description: 'True only if the printed rate includes VAT.' },
                      days: { type: NUMBER_OR_NULL, description: 'Number of days the line covers if printed ("30 dagar", "31 dygn"), else null.' },
                      sumKr: { type: NUMBER_OR_NULL, description: 'The amount printed for this line in the sum column, kr.' },
                    },
                    required: ['label', 'side', 'rate', 'per', 'includesVat', 'days', 'sumKr'],
                  },
                },
                retailerSubtotalExclVatKr: {
                  type: NUMBER_OR_NULL,
                  description:
                    'The electricity supplier part\'s total EXCLUDING VAT, in kr, as printed: e.g. "Moms 25 % av 1 101,59 kr" → 1101.59, or "Totalt E.ON Energilösningar AB 141,85 kr" when that total is before VAT. Only the supplier (elhandel) part, not the grid part. Null if not printed.',
                },
                totalEnergyPriceOrePerKwh: {
                  type: NUMBER_OR_NULL,
                  description:
                    'If the bill prints a total supplier price per kWh made of spot price plus markup (e.g. "Ditt elpris, rörligt pris 102,46 öre/kWh består av"), that number. Null if not printed.',
                },
                retailerMarkupLines: {
                  type: 'array',
                  description:
                    'REQUIRED whenever retailerMarkupOrePerKwh is not null: each of the retailer\'s markup lines that you added up, exactly as printed: its rate (öre/kWh excl. VAT) and its own amount in kr from the sum/amount column. Include every markup line (e.g. both "Rörliga kostnader" and "Fast påslag"). Read each number separately from the bill; do not calculate them. Empty only if the bill has no markup.',
                  items: {
                    type: 'object',
                    properties: {
                      label: { type: 'string', description: 'The line name, e.g. "Rörliga kostnader".' },
                      orePerKwh: { type: 'number', description: 'The rate printed on that line, öre/kWh.' },
                      sumKr: { type: NUMBER_OR_NULL, description: 'The amount printed on that line, kr. Null if not shown.' },
                    },
                    required: ['label', 'orePerKwh', 'sumKr'],
                  },
                },
                spotPriceOrePerKwh: {
                  type: NUMBER_OR_NULL,
                  description:
                    'The rate of the spot price line ("Spotpris", "Medelspotpris", "Elpris timpris"/"kvartspris") in öre/kWh excluding VAT. This line is the market price, NOT the markup. Always fill it in when the bill has a supplier part. Null only if not on this bill.',
                },
                gridVariableLineSumKr: {
                  type: NUMBER_OR_NULL,
                  description:
                    'The amount in kr EXCLUDING VAT in the sum/amount column of the grid transfer line(s) ("Elöverföring", "Överföringsavgift") for this period; add them up if there are several. Null if not on this bill.',
                },
                retailerMarkupLineSumKr: {
                  type: NUMBER_OR_NULL,
                  description:
                    'The amount in kr EXCLUDING VAT in the sum/amount column of the retailer markup line(s) you added up for retailerMarkupOrePerKwh, together. Null if not on this bill.',
                },
                periodDays: {
                  type: NUMBER_OR_NULL,
                  description: 'Number of days in the billing period that consumptionKwh covers (from the period dates, e.g. 2026-10-01 to 2026-10-31 = 31). Null if unclear.',
                },
                confidence: {
                  type: 'string',
                  enum: ['high', 'low'],
                  description: '"high" if the line items were clearly itemized and legible, "low" if any value had to be inferred or was unclear.',
                },
              },
              required: [
                'billType',
                'retailerName',
                'gridCompanyName',
                'gridFeeVariableOrePerKwh',
                'gridFixedRate',
                'gridFixedPer',
                'gridFixedIncludesVat',
                'retailerMarkupOrePerKwh',
                'retailerFixedRate',
                'retailerFixedPer',
                'retailerFixedIncludesVat',
                'consumptionKwh',
                'fixedFeeLines',
                'totalEnergyPriceOrePerKwh',
                'retailerSubtotalExclVatKr',
                'retailerMarkupLines',
                'spotPriceOrePerKwh',
                'gridVariableLineSumKr',
                'retailerMarkupLineSumKr',
                'periodDays',
                'confidence',
              ],
            },
          },
        ],
        messages: [
          {
            role: 'user',
            content: [
              fileContent,
              {
                type: 'text',
                text: 'This is a Swedish electricity bill. Read numbers exactly as printed (Swedish decimal commas, spaces as thousand separators). Many households get two separate bills: one from the electricity supplier (elhandel) and one from the local grid company (elnät); some get one combined invoice. First decide which kind this is. Then report only the fees that appear on this bill and use null for the rest. Also report the kWh used in the billing period, how many days the period covers, and the kr amounts (excl. VAT) on the grid transfer line(s) and the markup line(s), so the numbers can be checked. Per-kWh fees in öre/kWh excluding VAT. For fixed fees, copy the rate exactly as printed (with its unit and whether it includes VAT); do not convert it. Report your findings using the tool.',
              },
            ],
          },
        ],
      });
    } catch (err) {
      logger.error(`Claude call failed for bill scan: ${err}`);
      throw new HttpsError('internal', 'Could not read the bill. Try again or enter the values manually.');
    }

    logStopReason(message, 'bill scan');

    const toolUse = message.content.find((block) => block.type === 'tool_use');
    if (!toolUse || toolUse.type !== 'tool_use') {
      logger.error('No tool_use block in Claude response for bill scan');
      throw new HttpsError('internal', 'Could not read the bill. Try again or enter the values manually.');
    }

    const input = toolUse.input as Partial<ScanElectricityBillResult> & Record<string, unknown>;
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);
    const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 60) : null);
    // Fixed fees from their printed lines when listed (side by line name, unit
    // checked against the line's amount); otherwise from the single fields.
    const listedFeeLines: FixedFeeLine[] = Array.isArray(input.fixedFeeLines)
      ? (input.fixedFeeLines as Record<string, unknown>[]).slice(0, 8).map((l) => ({
          label: str(l?.label) ?? '',
          side: l?.side === 'grid' || l?.side === 'retailer' ? l.side : null,
          rate: Number(l?.rate),
          per: l?.per === 'year' || l?.per === 'month' || l?.per === 'day' ? l.per : null,
          includesVat: typeof l?.includesVat === 'boolean' ? l.includesVat : null,
          days: num(l?.days),
          sumKr: num(l?.sumKr),
        }))
      : [];
    // Without listed lines, the single rate fields go through the same checks
    // (side, and a unit that gives an impossible fee, e.g. 528 kr "per month").
    const asLine = (side: 'grid' | 'retailer', rate: unknown, per: unknown, includesVat: unknown): FixedFeeLine[] =>
      typeof rate === 'number' && rate > 0
        ? [{ label: '', side, rate, per: per === 'year' || per === 'month' || per === 'day' ? per : null, includesVat: typeof includesVat === 'boolean' ? includesVat : null, days: null, sumKr: null }]
        : [];
    const feeLines: FixedFeeLine[] = listedFeeLines.length
      ? listedFeeLines
      : [
          ...asLine('grid', input.gridFixedRate, input.gridFixedPer, input.gridFixedIncludesVat),
          ...asLine('retailer', input.retailerFixedRate, input.retailerFixedPer, input.retailerFixedIncludesVat),
        ];
    // The billing period's days: printed on the fee lines too ("31 dygn"), when the AI left it out.
    const periodDays =
      num(input.periodDays) ?? feeLines.map((l) => l.days).find((d): d is number => d !== null && d >= 7 && d <= 100) ?? null;
    const fromLines = feeLines.length
      ? fixedFeesFromLines(feeLines, periodDays, input.billType === 'retailer' || input.billType === 'grid' ? input.billType : 'combined')
      : null;
    const { values, checks: valueChecks } = checkBill(
      {
        gridFeeVariableOrePerKwh: num(input.gridFeeVariableOrePerKwh),
        gridFeeFixedSekPerMonth: fromLines ? fromLines.grid : monthlyInclVat(input.gridFixedRate, input.gridFixedPer, input.gridFixedIncludesVat),
        retailerMarkupOrePerKwh: num(input.retailerMarkupOrePerKwh),
        retailerFixedSekPerMonth: fromLines
          ? fromLines.retailer
          : monthlyInclVat(input.retailerFixedRate, input.retailerFixedPer, input.retailerFixedIncludesVat),
        consumptionKwh: num(input.consumptionKwh),
        periodDays,
      },
      {
        gridVariableLineSumKr: num(input.gridVariableLineSumKr),
        retailerMarkupLineSumKr: num(input.retailerMarkupLineSumKr),
        spotPriceOrePerKwh: num(input.spotPriceOrePerKwh),
        totalEnergyPriceOrePerKwh: num(input.totalEnergyPriceOrePerKwh),
        retailerSubtotalExclVatKr: num(input.retailerSubtotalExclVatKr),
        // The supplier's fixed fee for the period, as printed on its line(s), when known.
        retailerFixedPeriodKr: (() => {
          const own = feeLines.filter((l) => l.sumKr !== null && (/elavtal|elhandel/i.test(l.label) || l.side === 'retailer') && !/nät|abonnemang/i.test(l.label));
          return own.length ? own.reduce((sum, l) => sum + (l.sumKr ?? 0), 0) : null;
        })(),
        retailerMarkupLines: Array.isArray(input.retailerMarkupLines)
          ? (input.retailerMarkupLines as { orePerKwh?: unknown; sumKr?: unknown }[])
              .map((l) => ({ label: str((l as { label?: unknown })?.label) ?? '', orePerKwh: Number(l?.orePerKwh), sumKr: num(l?.sumKr) }))
              .filter((l) => Number.isFinite(l.orePerKwh))
              .slice(0, 6)
          : [],
      },
    );
    const modelType = input.billType === 'retailer' || input.billType === 'grid' ? input.billType : 'combined';
    const checks = [...valueChecks, ...(fromLines?.checks ?? []).filter((c) => !valueChecks.some((v) => v.field === c.field))];
    if (checks.length) logger.info(`Bill scan flags: ${checks.map((c) => `${c.field}:${c.reason}`).join(', ')}`);
    return {
      billType: resolveBillType(modelType, values, { retailerName: str(input.retailerName), gridCompanyName: str(input.gridCompanyName) }),
      retailerName: str(input.retailerName),
      gridCompanyName: str(input.gridCompanyName),
      ...values,
      // Any flag means the user should look carefully, whatever the model said.
      confidence: input.confidence === 'high' && checks.length === 0 ? 'high' : 'low',
      checks,
    };
  },
);
