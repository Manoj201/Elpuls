// One representative city per Swedish price zone, used to approximate
// zone-level weather. Mirrors ZONE_REFERENCE_POINTS in
// functions/src/fetchWeather.ts — intentionally duplicated rather than
// shared, since client and Cloud Functions code live in separate TS
// projects/module systems.
export const zoneReferencePoints: Record<string, { lat: number; lon: number }> = {
  SE1: { lat: 65.5848, lon: 22.1567 }, // Luleå
  SE2: { lat: 62.3908, lon: 17.3069 }, // Sundsvall
  SE3: { lat: 59.3293, lon: 18.0686 }, // Stockholm
  SE4: { lat: 55.605, lon: 13.0038 }, // Malmö
};
