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

export interface ScanElectricityBillResult {
  gridFeeVariableOrePerKwh: number | null;
  retailerMarkupOrePerKwh: number | null;
  confidence: 'high' | 'low';
}

/**
 * Callable from the app: takes a base64 photo or PDF of a Swedish
 * electricity bill (never persisted — read once, sent to Claude, discarded)
 * and extracts the two per-kWh numbers CLAUDE.md §3 identified as missing
 * from the landed-cost formula — the grid's variable fee (nätavgift /
 * "elöverföring") and the retailer's own markup (their "rörliga kostnader"
 * + "fast påslag" combined). Deliberately not extracting fixed annual fees
 * — nothing in the app uses those yet. Client always shows this back to
 * the user to confirm/edit before saving.
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
        max_tokens: 400,
        tool_choice: { type: 'tool', name: REPORT_TOOL_NAME },
        tools: [
          {
            name: REPORT_TOOL_NAME,
            description: 'Report the grid fee and retailer markup extracted from a Swedish electricity bill.',
            input_schema: {
              type: 'object',
              properties: {
                gridFeeVariableOrePerKwh: {
                  type: ['number', 'null'],
                  description:
                    'The grid company\'s variable fee in öre/kWh, usually itemized as "Elöverföring" on the elnät (grid) side of the bill. Null if not found.',
                },
                retailerMarkupOrePerKwh: {
                  type: ['number', 'null'],
                  description:
                    'The electricity retailer\'s own markup on top of the spot price, in öre/kWh — sum any "Rörliga kostnader" and "Fast påslag" (or similarly named) line items on the elhandel (retailer) side of the bill. This is NOT the spot price itself and NOT the grid fee. Null if not found.',
                },
                confidence: {
                  type: 'string',
                  enum: ['high', 'low'],
                  description: '"high" if the line items were clearly itemized and legible, "low" if any value had to be inferred or was unclear.',
                },
              },
              required: ['gridFeeVariableOrePerKwh', 'retailerMarkupOrePerKwh', 'confidence'],
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
                text: 'This is a Swedish electricity bill ("Faktura el och elnät"), with two sides: the grid company (elnät) and the electricity retailer (elhandel). Extract exactly two per-kWh figures, in öre/kWh: (1) the grid\'s variable fee, usually labeled "Elöverföring"; (2) the retailer\'s own markup on top of the spot price — sum line items like "Rörliga kostnader" and "Fast påslag" (do not include the spot price itself, energy tax, VAT, or elcertifikat). Report your findings using the tool.',
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

    return toolUse.input as ScanElectricityBillResult;
  },
);
