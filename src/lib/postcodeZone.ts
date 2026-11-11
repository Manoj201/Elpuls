interface PrefixBand {
  // Inclusive upper bound of the postcode's first two digits for this band.
  maxPrefix: number;
  zone: string;
}

/**
 * Swedish postnummer (postal code) prefixes were assigned historically by
 * region, radiating out from Stockholm — they roughly, but not exactly,
 * track the län (county) lines that Svenska kraftnät's four elområden
 * (SE1-SE4) are built from. A handful of counties straddle a zone border
 * in ways a simple 2-digit prefix band can't capture precisely (Jönköping
 * vs. Östergötland, Halland vs. Västra Götaland, Västerbotten vs.
 * Norrbotten), so this table is a best-effort approximation, not an
 * authoritative lookup.
 *
 * That's why `guessZoneFromPostcode` is only ever used to pre-select a
 * zone chip the user still sees and can override in onboarding — never
 * written to the profile without that confirmation step.
 */
const PREFIX_BANDS: PrefixBand[] = [
  { maxPrefix: 19, zone: 'SE3' }, // Stockholm, Uppsala
  { maxPrefix: 29, zone: 'SE4' }, // Skåne
  { maxPrefix: 39, zone: 'SE4' }, // Halland, Kronoberg, Blekinge, Kalmar
  { maxPrefix: 54, zone: 'SE3' }, // Västra Götaland
  { maxPrefix: 57, zone: 'SE4' }, // Jönköping
  { maxPrefix: 82, zone: 'SE3' }, // Östergötland, Södermanland, Gotland, Värmland, Örebro, Västmanland, Dalarna, Gävleborg
  { maxPrefix: 93, zone: 'SE2' }, // Jämtland, Västernorrland, Västerbotten
  { maxPrefix: 99, zone: 'SE1' }, // Norrbotten
];

/** Returns a best-guess SE1-SE4 zone from a (partial) Swedish postcode, or null if too short to guess. */
export function guessZoneFromPostcode(postcode: string): string | null {
  const digits = postcode.replace(/\D/g, '');
  if (digits.length < 2) return null;

  const prefix = parseInt(digits.slice(0, 2), 10);
  const band = PREFIX_BANDS.find((b) => prefix <= b.maxPrefix);
  return band?.zone ?? null;
}
