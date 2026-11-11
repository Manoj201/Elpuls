import { getPosition } from 'suncalc';
import type { HourlyForecast } from '../providers/types';

export interface HourlySolarPotential {
  hour: Date;
  potentialPct: number;
}

// Clouds block most but not all light — diffuse radiation still gets
// through — so cloud cover attenuates rather than zeroes out potential.
const CLOUD_ATTENUATION_FACTOR = 0.75;

/**
 * Rough solar generation potential per forecast hour, 0-100. Uses real sun
 * altitude (via suncalc) rather than a fixed daylight window, since Swedish
 * daylight hours swing from ~6h (Stockholm, December) to ~18h+ (June), more
 * extreme further north — a fixed window would be wrong for half the year.
 */
export function estimateSolarPotential(
  forecast: HourlyForecast[],
  lat: number,
  lon: number,
): HourlySolarPotential[] {
  return forecast.map((f) => {
    // suncalc v2 returns altitude in degrees (a breaking change from v1's
    // radians — @types/suncalc is untyped for units, so this isn't caught
    // by the compiler), hence the explicit conversion here.
    const { altitude } = getPosition(f.hour, lat, lon);
    const altitudeRad = (altitude * Math.PI) / 180;
    const clearSkyPotential = Math.max(0, Math.sin(altitudeRad));
    const cloudFactor = 1 - (f.cloudCoverPct / 100) * CLOUD_ATTENUATION_FACTOR;
    return {
      hour: f.hour,
      potentialPct: clearSkyPotential * cloudFactor * 100,
    };
  });
}
