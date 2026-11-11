export interface WeatherHour {
  hour: string; // ISO string, as stored in the weather/{SE-ZONE} doc
  tempC: number;
  windMs: number;
  cloudCoverPct: number;
}

export interface PriceRiskAssessment {
  level: 'low' | 'medium' | 'high';
  factors: string[];
}

type Severity = 'none' | 'medium' | 'high';

const stockholmDateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Stockholm' });

/**
 * Cloud Functions run in UTC; a naive UTC-string-prefix match on an hour
 * near midnight would land on the wrong Stockholm calendar date (e.g. local
 * 01:00 CEST is still 23:00 UTC the previous day). This resolves the actual
 * Stockholm-local date for a given instant.
 */
function toStockholmDateKey(iso: string): string {
  return stockholmDateFormatter.format(new Date(iso));
}

function coldSeverity(avgTempC: number): Severity {
  if (avgTempC < -10) return 'high';
  if (avgTempC < 0) return 'medium';
  return 'none';
}

function lowWindSeverity(avgWindMs: number): Severity {
  if (avgWindMs < 3) return 'high';
  if (avgWindMs < 6) return 'medium';
  return 'none';
}

/**
 * Server-side duplicate of src/lib/priceRisk.ts's threshold logic, adapted
 * for the Firestore weather doc shape. Intentionally not shared code —
 * client and Cloud Functions live in separate TS projects/module systems,
 * same pattern already used for price/weather fetching.
 */
export function assessPriceRisk(hours: WeatherHour[], dateKey: string): PriceRiskAssessment | null {
  const dayEntries = hours.filter((h) => toStockholmDateKey(h.hour) === dateKey);

  if (dayEntries.length === 0) {
    return null;
  }

  const avgTempC = dayEntries.reduce((sum, h) => sum + h.tempC, 0) / dayEntries.length;
  const avgWindMs = dayEntries.reduce((sum, h) => sum + h.windMs, 0) / dayEntries.length;

  const cold = coldSeverity(avgTempC);
  const lowWind = lowWindSeverity(avgWindMs);

  const factors: string[] = [];
  if (cold !== 'none') factors.push(`Cold weather (${avgTempC.toFixed(1)}°C avg)`);
  if (lowWind !== 'none') factors.push(`Low wind speeds (${avgWindMs.toFixed(1)} m/s avg)`);

  const level: PriceRiskAssessment['level'] =
    cold === 'high' || lowWind === 'high' ? 'high' : cold === 'medium' || lowWind === 'medium' ? 'medium' : 'low';

  return { level, factors };
}
