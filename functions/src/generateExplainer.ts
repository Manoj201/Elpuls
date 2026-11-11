import { onSchedule } from 'firebase-functions/v2/scheduler';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';
import { assessPriceRisk, type PriceRiskAssessment, type WeatherHour } from './priceRisk';

const SWEDISH_ZONES = ['SE1', 'SE2', 'SE3', 'SE4'];
const CLAUDE_MODEL = 'claude-haiku-4-5-20251001';
const REPORT_TOOL_NAME = 'report_explainer';

interface PriceHour {
  hour: string;
  price: number;
}

interface ExplainerToolResult {
  text_sv: string;
  text_en: string;
}

const stockholmDateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Stockholm' });

function todayStockholmDateKey(): string {
  return stockholmDateFormatter.format(new Date());
}

function buildPrompt(params: {
  zone: string;
  risk: PriceRiskAssessment | null;
  avgPrice: number;
  minPrice: number;
  maxPrice: number;
}): string {
  const { zone, risk, avgPrice, minPrice, maxPrice } = params;
  const factorsText =
    risk && risk.factors.length > 0 ? risk.factors.join(', ') : 'inga tydliga väderdrivna riskfaktorer';

  return [
    `Du är Elpuls, en assistent för elpriser till svenska hushåll i elområde ${zone}.`,
    `Dagens spotpriser ligger i snitt på ${avgPrice.toFixed(2)} kr/kWh, mellan ${minPrice.toFixed(2)} och ${maxPrice.toFixed(2)} kr/kWh.`,
    `Väderdrivna prisriskfaktorer: ${factorsText}.`,
    'Förklara för en konsument varför priserna ser ut som de gör idag och ge ett kort praktiskt råd, i högst 2 korta meningar, ren text utan markdown. Var konkret och saklig, undvik svävande formuleringar. Rapportera samma förklaring på både svenska och engelska via verktyget.',
  ].join(' ');
}

/**
 * Once daily, generates a short bilingual AI explainer for each zone's
 * already-published prices (one Claude Haiku call per zone/day, cached in
 * Firestore — never per user). Runs after the 06:00 weather refresh so both
 * today's price doc (written yesterday when it was "tomorrow") and today's
 * weather are available. Does not send a push itself — sendDailyBriefings
 * is the Pro-gated notification that reads this doc.
 */
export const generateExplainer = onSchedule(
  { schedule: '0 7 * * *', timeZone: 'Europe/Stockholm', secrets: ['ANTHROPIC_API_KEY'] },
  async () => {
    const db = getFirestore();
    const dateKey = todayStockholmDateKey();
    // Lazy-loaded (not a top-level import): the SDK pulls in an ESM-only
    // transitive dependency (standardwebhooks -> @stablelib/base64) via its
    // beta webhooks module, which breaks Cloud Functions' discovery step if
    // required eagerly at module load — deferring to inside the handler
    // sidesteps that entirely since discovery never executes handler bodies.
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    for (const zone of SWEDISH_ZONES) {
      const docId = `SE-${zone}-${dateKey}`;
      const explainerRef = db.collection('explainers').doc(docId);

      try {
        await explainerRef.create({ status: 'pending', createdAt: FieldValue.serverTimestamp() });
      } catch (err) {
        const code = (err as { code?: number })?.code;
        if (code === 6 /* ALREADY_EXISTS */) {
          logger.info(`Explainer for ${zone} on ${dateKey} already generated, skipping.`);
          continue;
        }
        throw err;
      }

      try {
        const [priceSnap, weatherSnap] = await Promise.all([
          db.collection('prices').doc(docId).get(),
          db.collection('weather').doc(`SE-${zone}`).get(),
        ]);

        const priceHours = (priceSnap.data()?.hours ?? []) as PriceHour[];
        const weatherHours = (weatherSnap.data()?.hours ?? []) as WeatherHour[];

        if (priceHours.length === 0) {
          logger.warn(`No price data for ${zone} on ${dateKey}, skipping explainer.`);
          await explainerRef.delete();
          continue;
        }

        const risk = assessPriceRisk(weatherHours, dateKey);
        const prices = priceHours.map((h) => h.price);
        const avgPrice = prices.reduce((sum, p) => sum + p, 0) / prices.length;
        const minPrice = Math.min(...prices);
        const maxPrice = Math.max(...prices);

        const message = await anthropic.messages.create({
          model: CLAUDE_MODEL,
          max_tokens: 400,
          tool_choice: { type: 'tool', name: REPORT_TOOL_NAME },
          tools: [
            {
              name: REPORT_TOOL_NAME,
              description: "Report today's price explainer in both Swedish and English.",
              input_schema: {
                type: 'object',
                properties: {
                  text_sv: { type: 'string', description: 'Max 2 short sentences, plain text, in Swedish.' },
                  text_en: {
                    type: 'string',
                    description: 'Max 2 short sentences, plain text, in English — same explanation as text_sv, just localized, not a literal translation.',
                  },
                },
                required: ['text_sv', 'text_en'],
              },
            },
          ],
          messages: [{ role: 'user', content: buildPrompt({ zone, risk, avgPrice, minPrice, maxPrice }) }],
        });

        const toolUse = message.content.find((block) => block.type === 'tool_use');
        if (!toolUse || toolUse.type !== 'tool_use') {
          logger.error(`No tool_use block in explainer response for ${zone}`);
          await explainerRef.delete();
          continue;
        }

        const { text_sv: textSv, text_en: textEn } = toolUse.input as ExplainerToolResult;
        if (!textSv || !textEn) {
          logger.error(`Empty explainer text for ${zone}`);
          await explainerRef.delete();
          continue;
        }

        await explainerRef.set({
          zone,
          date: dateKey,
          text_sv: textSv,
          text_en: textEn,
          level: risk?.level ?? 'low',
          factors: risk?.factors ?? [],
          generatedAt: FieldValue.serverTimestamp(),
        });

        logger.info(`Generated explainer for ${zone} (sv): ${textSv}`);
      } catch (err) {
        logger.error(`Failed to generate explainer for ${zone}: ${err}`);
        await explainerRef.delete().catch(() => {});
      }
    }
  },
);
