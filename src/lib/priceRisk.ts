import type { HourlyForecast } from '../providers/types';

export interface PriceRiskFactor {
  kind: 'cold' | 'lowWind';
  /** Day average: °C for `cold`, m/s for `lowWind`. */
  value: number;
}

export interface PriceRiskAssessment {
  level: 'low' | 'medium' | 'high';
  /** Structured so the UI can show them in the user's language (see home.riskFactors.*). */
  factors: PriceRiskFactor[];
}

type Severity = 'none' | 'medium' | 'high';

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

function isSameLocalDate(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Deterministic price-risk heuristic: cold weather and low wind both push
 * Swedish spot prices up (more heating demand, less wind generation). This
 * is the factor list the Week 4 AI explainer will turn into prose — it
 * doesn't need to re-derive these itself.
 */
export function assessPriceRisk(
  forecast: HourlyForecast[],
  forDate: Date,
): PriceRiskAssessment | null {
  const dayEntries = forecast.filter((f) => isSameLocalDate(f.hour, forDate));

  if (dayEntries.length === 0) {
    return null;
  }

  const avgTempC = dayEntries.reduce((sum, f) => sum + f.tempC, 0) / dayEntries.length;
  const avgWindMs = dayEntries.reduce((sum, f) => sum + f.windMs, 0) / dayEntries.length;

  const cold = coldSeverity(avgTempC);
  const lowWind = lowWindSeverity(avgWindMs);

  const factors: PriceRiskFactor[] = [];
  if (cold !== 'none') factors.push({ kind: 'cold', value: avgTempC });
  if (lowWind !== 'none') factors.push({ kind: 'lowWind', value: avgWindMs });

  const level: PriceRiskAssessment['level'] =
    cold === 'high' || lowWind === 'high' ? 'high' : cold === 'medium' || lowWind === 'medium' ? 'medium' : 'low';

  return { level, factors };
}
