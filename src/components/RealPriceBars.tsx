import { StyleSheet, Text, View } from 'react-native';
import { theme } from '../theme';

interface RealPriceBarsProps {
  spotLabel: string;
  spotValue: string;
  paidLabel: string;
  paidValue: string;
  /** spot ÷ what you pay, 0–1: the spot bar's length relative to the full bar. */
  spotShare: number;
  accessibilityLabel: string;
}

/**
 * Spot price vs. what you actually pay, as two bars drawn to the same scale,
 * so the gap is visible at a glance. Values are always written out next to
 * the bars (colour and length are never the only signal).
 */
export function RealPriceBars({ spotLabel, spotValue, paidLabel, paidValue, spotShare, accessibilityLabel }: RealPriceBarsProps) {
  const share = Math.min(1, Math.max(0.04, spotShare));
  return (
    <View style={styles.root} accessible accessibilityLabel={accessibilityLabel}>
      <View style={styles.row}>
        <View style={styles.labels}>
          <Text style={styles.label}>{spotLabel}</Text>
          <Text style={[styles.value, styles.spotValue]}>{spotValue}</Text>
        </View>
        <View style={styles.track}>
          <View style={[styles.bar, styles.spotBar, { width: `${share * 100}%` }]} />
        </View>
      </View>
      <View style={styles.row}>
        <View style={styles.labels}>
          <Text style={[styles.label, styles.paidLabel]}>{paidLabel}</Text>
          <Text style={[styles.value, styles.paidValue]}>{paidValue}</Text>
        </View>
        <View style={styles.track}>
          <View style={[styles.bar, styles.paidBar, { width: '100%' }]} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 16 },
  row: { gap: 6 },
  labels: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 },
  label: { flexShrink: 1, fontFamily: theme.typography.body, fontSize: theme.type.md, color: theme.colors.textSecondary },
  paidLabel: { fontFamily: theme.typography.bodyMedium, color: theme.colors.textPrimary },
  value: { fontFamily: theme.typography.displayMedium, fontVariant: ['tabular-nums'] },
  spotValue: { fontSize: theme.type.md, color: theme.colors.textSecondary },
  paidValue: { fontSize: theme.type.xl, color: theme.colors.textPrimary },
  track: { height: 14, borderRadius: 7, backgroundColor: theme.colors.surfaceElevated, overflow: 'hidden' },
  bar: { height: '100%', borderRadius: 7 },
  // Same pair as PriceSplitBar: grey spot, brand purple for what you pay
  // (amber means "dear" elsewhere in the app, and fees aren't a warning).
  spotBar: { backgroundColor: theme.colors.textMuted },
  paidBar: { backgroundColor: theme.colors.accentPurple },
});
