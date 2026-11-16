import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import type Anthropic from '@anthropic-ai/sdk';

const CLAUDE_MODEL = 'claude-haiku-4-5-20251001';
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
}

const NUMBER_OR_NULL = ['number', 'null'];
const DAYS_PER_MONTH = 365 / 12;

/**
 * Fixed fee as printed on the bill (rate + unit + VAT or not) → kr per
 * month incl. VAT. Done here, not by the model: asking the model to convert
 * made it return the period total excl. VAT instead (a real Vattenfall bill
 * gave 549,34 kr for "Abonnemang 6 468 kr/år", which is 673,75 kr/month).
 */
function monthlyInclVat(rate: unknown, per: unknown, includesVat: unknown): number | null {
  if (typeof rate !== 'number' || !Number.isFinite(rate) || rate < 0) return null;
  const perMonth = per === 'year' ? rate / 12 : per === 'day' ? rate * DAYS_PER_MONTH : per === 'month' ? rate : null;
  if (perMonth === null) return null;
  const withVat = includesVat === true ? perMonth : perMonth * 1.25;
  return Math.round(withVat * 100) / 100;
}
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
        max_tokens: 700,
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
                    'Retailer\'s own markup on top of the spot price, in öre/kWh EXCLUDING VAT: the sum of lines like "Påslag", "Fast påslag", "Rörliga kostnader", "Tillägg". NOT the spot price itself, NOT the grid fee, NOT energy tax or elcertifikat. Null if not on this bill.',
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
                text: 'This is a Swedish electricity bill. Many households get two separate bills: one from the electricity supplier (elhandel) and one from the local grid company (elnät); some get one combined invoice. First decide which kind this is. Then report only the fees that appear on this bill and use null for the rest. Also report the kWh used in the billing period and how many days the period covers. Per-kWh fees in öre/kWh excluding VAT. For fixed fees, copy the rate exactly as printed (with its unit and whether it includes VAT); do not convert it. Report your findings using the tool.',
              },
            ],
          },
        ],
      });
    } catch (err) {
      logger.error(`Claude call failed for bill scan: ${err}`);
      throw new HttpsError('internal', 'Could not read the bill. Try again or enter the values manually.');
    }

    const toolUse = message.content.find((block) => block.type === 'tool_use');
    if (!toolUse || toolUse.type !== 'tool_use') {
      logger.error('No tool_use block in Claude response for bill scan');
      throw new HttpsError('internal', 'Could not read the bill. Try again or enter the values manually.');
    }

    const input = toolUse.input as Partial<ScanElectricityBillResult> & Record<string, unknown>;
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);
    const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 60) : null);
    return {
      billType: input.billType === 'retailer' || input.billType === 'grid' ? input.billType : 'combined',
      retailerName: str(input.retailerName),
      gridCompanyName: str(input.gridCompanyName),
      gridFeeVariableOrePerKwh: num(input.gridFeeVariableOrePerKwh),
      gridFeeFixedSekPerMonth: monthlyInclVat(input.gridFixedRate, input.gridFixedPer, input.gridFixedIncludesVat),
      retailerMarkupOrePerKwh: num(input.retailerMarkupOrePerKwh),
      retailerFixedSekPerMonth: monthlyInclVat(input.retailerFixedRate, input.retailerFixedPer, input.retailerFixedIncludesVat),
      consumptionKwh: num(input.consumptionKwh),
      periodDays: num(input.periodDays),
      confidence: input.confidence === 'high' ? 'high' : 'low',
    };
  },
);
