import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { theme } from '../theme';

interface PriceSplitBarProps {
  /** Spot price right now, öre/kWh (excl. VAT, as published). */
  spotOre: number;
  /** What you pay right now, öre/kWh (spot + fees + tax + VAT). */
  totalOre: number;
  /** Which number the big hero shows, so its part is the bold one. */
  highlight: 'spot' | 'total';
  format: (ore: number) => string;
}

// Neutral colours on purpose: amber/red/teal mean cheap or dear everywhere
// else on the card, and fees aren't a warning. Spot = muted grey, fees =
// brand purple. Same pair as RealPriceBars (intro, bill scan result).
export const SPLIT_SPOT_COLOR = theme.colors.textMuted;
export const SPLIT_EXTRA_COLOR = theme.colors.accentPurple;

/** Same precision as the hero (whole öre, one decimal under 10). */
function roundLikeDisplay(ore: number): number {
  return Math.abs(ore) < 10 ? Math.round(ore * 10) / 10 : Math.round(ore);
}

/**
 * Spot price and what you pay at the same time, under the hero: in spot view
 * what you pay first (the number the hero doesn't show), then one stacked bar, then a legend that
 * names both parts with their values. A stacked bar with direct labels rather
 * than a donut or a second needle (UI/UX Pro Max: part-to-whole where exact
 * values matter; color-not-only).
 */
export function PriceSplitBar({ spotOre, totalOre, highlight, format }: PriceSplitBarProps) {
  const { t } = useTranslation();
  // Round first, then take the difference, so the parts always add up to the
  // total people see (191 + 150 = 341, not 191 + 151 = 341).
  const spotR = roundLikeDisplay(spotOre);
  const totalR = roundLikeDisplay(totalOre);
  const extraR = roundLikeDisplay(Math.max(0, totalR - spotR));
  // Negative spot prices happen; the bar then shows only the added part.
  const spotShare = totalR > 0 ? Math.min(1, Math.max(0, spotR / totalR)) : 0;
  const spot = format(spotR);
  const extra = format(extraR);
  const total = format(totalR);

  return (
    <View style={styles.root} accessible accessibilityLabel={t('home.split.a11y', { spot, extra, total })}>
      {/* Only when the hero shows spot: in the "what you pay" view the big
          number already is the total, so repeating it adds nothing. */}
      {highlight === 'spot' && (
        <View style={styles.totalRow}>
          <Text style={[styles.totalLabel, styles.strong]}>{t('home.split.total')}</Text>
          <Text style={[styles.totalValue, styles.strong]}>{total} öre/kWh</Text>
        </View>
      )}
      <View style={styles.track}>
        {spotShare > 0 && <View style={[styles.segment, { flex: spotShare, backgroundColor: SPLIT_SPOT_COLOR }]} />}
        <View style={[styles.segment, { flex: 1 - spotShare, backgroundColor: SPLIT_EXTRA_COLOR }]} />
      </View>
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.swatch, { backgroundColor: SPLIT_SPOT_COLOR }]} />
          <Text style={[styles.legendText, highlight === 'spot' && styles.strong]}>
            {t('home.split.spot')} {spot}
          </Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.swatch, { backgroundColor: SPLIT_EXTRA_COLOR }]} />
          <Text style={styles.legendText}>
            {t('home.split.extra')} {extra}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignSelf: 'stretch', gap: 8 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 },
  totalLabel: { fontFamily: theme.typography.bodyMedium, fontSize: theme.type.md, color: theme.colors.textSecondary },
  totalValue: {
    fontFamily: theme.typography.displayMedium,
    fontSize: theme.type.md,
    color: theme.colors.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  strong: { color: theme.colors.textPrimary, fontFamily: theme.typography.bodySemibold },
  track: { flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', gap: 2 },
  segment: { height: '100%' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 4, columnGap: 16 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 10, height: 10, borderRadius: 2 },
  legendText: { fontFamily: theme.typography.body, fontSize: theme.type.sm, color: theme.colors.textSecondary, fontVariant: ['tabular-nums'] },
});
