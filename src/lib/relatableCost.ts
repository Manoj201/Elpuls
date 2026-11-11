export interface RelatableComparison {
  itemKey: string;
  multiple: number;
}

interface CostReference {
  itemKey: string;
  sek: number;
}

// Roughly log-spaced Swedish everyday prices so most cost levels land near
// something real. Ordered cheapest to priciest.
const COST_REFERENCES: CostReference[] = [
  { itemKey: 'coffee', sek: 5 },
  { itemKey: 'cinnamonBun', sek: 15 },
  { itemKey: 'busTicket', sek: 40 },
  { itemKey: 'fika', sek: 45 },
  { itemKey: 'lunch', sek: 120 },
  { itemKey: 'cinema', sek: 140 },
  { itemKey: 'pizzaDinner', sek: 300 },
];

const MIN_COMPARABLE_SEK = COST_REFERENCES[0].sek;

/**
 * Matches a cost total to the closest everyday-price reference, by ratio
 * (not absolute difference) so both a 6 kr and a 280 kr cost find something
 * sensible to compare against. Returns null below the cheapest reference —
 * forcing a comparison on a few öre would be silly, not relatable.
 */
export function findRelatableComparison(costSek: number): RelatableComparison | null {
  if (costSek < MIN_COMPARABLE_SEK) {
    return null;
  }

  let closest = COST_REFERENCES[0];
  let closestRatioDistance = Infinity;

  for (const ref of COST_REFERENCES) {
    const ratio = costSek / ref.sek;
    const ratioDistance = Math.abs(Math.log(ratio));
    if (ratioDistance < closestRatioDistance) {
      closestRatioDistance = ratioDistance;
      closest = ref;
    }
  }

  return { itemKey: closest.itemKey, multiple: costSek / closest.sek };
}
