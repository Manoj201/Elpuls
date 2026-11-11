import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';

const CLAUDE_MODEL = 'claude-haiku-4-5-20251001';
const SUPPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const REPORT_TOOL_NAME = 'report_appliance_watts';

interface ScanAppliancePhotoRequest {
  imageBase64: string;
  mimeType: string;
}

export interface ScanAppliancePhotoResult {
  applianceType: string;
  wattsDetected: number | null;
  confidence: 'high' | 'low';
  source: 'label' | 'estimate';
}

/**
 * Callable from the app: takes a base64 photo (never persisted — read once,
 * sent to Claude, discarded) of a household appliance, ideally its rating/
 * nameplate label, and returns the detected wattage. Client always shows
 * this back to the user to confirm/edit before saving (CLAUDE.md §11
 * accuracy bar) — this function never writes to Firestore itself.
 */
export const scanAppliancePhoto = onCall<ScanAppliancePhotoRequest>(
  { secrets: ['ANTHROPIC_API_KEY'] },
  async (request): Promise<ScanAppliancePhotoResult> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign-in required.');
    }

    const { imageBase64, mimeType } = request.data ?? ({} as ScanAppliancePhotoRequest);
    if (!imageBase64 || typeof imageBase64 !== 'string') {
      throw new HttpsError('invalid-argument', 'imageBase64 is required.');
    }
    if (!mimeType || !SUPPORTED_IMAGE_TYPES.has(mimeType)) {
      throw new HttpsError('invalid-argument', `Unsupported image type: ${mimeType}`);
    }

    // Lazy-loaded: see generateExplainer.ts for why (ESM transitive dep breaks Cloud Functions discovery if imported eagerly).
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    let message;
    try {
      message = await anthropic.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 400,
        tool_choice: { type: 'tool', name: REPORT_TOOL_NAME },
        tools: [
          {
            name: REPORT_TOOL_NAME,
            description: 'Report the appliance type and wattage detected in the photo.',
            input_schema: {
              type: 'object',
              properties: {
                applianceType: {
                  type: 'string',
                  description: 'Short label for the appliance, e.g. "Dishwasher", "Washing machine", "EV charger".',
                },
                wattsDetected: {
                  type: ['number', 'null'],
                  description:
                    'The wattage read from the rating label, or a typical estimate for this appliance type if no label is legible. Null only if the photo is unusable.',
                },
                confidence: {
                  type: 'string',
                  enum: ['high', 'low'],
                  description: '"high" if the label was clearly legible, "low" if estimated or uncertain.',
                },
                source: {
                  type: 'string',
                  enum: ['label', 'estimate'],
                  description: '"label" if read directly off a printed rating label, "estimate" if inferred from the appliance type.',
                },
              },
              required: ['applianceType', 'wattsDetected', 'confidence', 'source'],
            },
          },
        ],
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: mimeType as 'image/jpeg' | 'image/png' | 'image/webp', data: imageBase64 },
              },
              {
                type: 'text',
                text: 'This is a photo of a household electrical appliance, ideally showing its rating/nameplate label. Read the wattage (W) off the label if visible — look for "W", "Watt", or compute from voltage × amps (V × A) if only those are printed. If no label is legible, identify the appliance type from the photo and estimate a typical wattage for that type of appliance. Report your findings using the tool.',
              },
            ],
          },
        ],
      });
    } catch (err) {
      logger.error(`Claude call failed for appliance scan: ${err}`);
      throw new HttpsError('internal', 'Could not read the photo. Try again or enter it manually.');
    }

    const toolUse = message.content.find((block) => block.type === 'tool_use');
    if (!toolUse || toolUse.type !== 'tool_use') {
      logger.error('No tool_use block in Claude response for appliance scan');
      throw new HttpsError('internal', 'Could not read the photo. Try again or enter it manually.');
    }

    return toolUse.input as ScanAppliancePhotoResult;
  },
);
