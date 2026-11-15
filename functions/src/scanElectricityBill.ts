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
  confidence: 'high' | 'low';
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
                gridFeeFixedSekPerMonth: {
                  type: NUMBER_OR_NULL,
                  description:
                    'Grid company\'s fixed subscription fee ("Abonnemang", "Nätabonnemang", "Fast avgift") in kr per MONTH INCLUDING 25% VAT. Convert: yearly ÷ 12, and multiply by 1.25 if the bill states it excluding VAT. Null if not on this bill.',
                },
                retailerMarkupOrePerKwh: {
                  type: NUMBER_OR_NULL,
                  description:
                    'Retailer\'s own markup on top of the spot price, in öre/kWh EXCLUDING VAT: the sum of lines like "Påslag", "Fast påslag", "Rörliga kostnader", "Tillägg". NOT the spot price itself, NOT the grid fee, NOT energy tax or elcertifikat. Null if not on this bill.',
                },
                retailerFixedSekPerMonth: {
                  type: NUMBER_OR_NULL,
                  description:
                    'Retailer\'s fixed fee ("Månadsavgift", "Årsavgift", "Fast avgift") in kr per MONTH INCLUDING 25% VAT. Convert: yearly ÷ 12, and multiply by 1.25 if stated excluding VAT. Null if not on this bill.',
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
                'gridFeeFixedSekPerMonth',
                'retailerMarkupOrePerKwh',
                'retailerFixedSekPerMonth',
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
                text: 'This is a Swedish electricity bill. Many households get two separate bills: one from the electricity supplier (elhandel) and one from the local grid company (elnät); some get one combined invoice. First decide which kind this is. Then report only the fees that appear on this bill and use null for the rest. Per-kWh fees in öre/kWh excluding VAT; fixed fees in kr per month including VAT (convert yearly fees and add 25% VAT if needed). Report your findings using the tool.',
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

    const input = toolUse.input as Partial<ScanElectricityBillResult>;
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);
    const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 60) : null);
    return {
      billType: input.billType === 'retailer' || input.billType === 'grid' ? input.billType : 'combined',
      retailerName: str(input.retailerName),
      gridCompanyName: str(input.gridCompanyName),
      gridFeeVariableOrePerKwh: num(input.gridFeeVariableOrePerKwh),
      gridFeeFixedSekPerMonth: num(input.gridFeeFixedSekPerMonth),
      retailerMarkupOrePerKwh: num(input.retailerMarkupOrePerKwh),
      retailerFixedSekPerMonth: num(input.retailerFixedSekPerMonth),
      confidence: input.confidence === 'high' ? 'high' : 'low',
    };
  },
);
