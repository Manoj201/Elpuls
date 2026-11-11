import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { theme } from '../theme';

export type ChipVariant = 'neutral' | 'amber' | 'teal' | 'danger';

interface ChipProps {
  label: string;
  variant?: ChipVariant;
  onPress?: () => void;
  selected?: boolean;
  dot?: boolean;
  style?: ViewStyle;
}

// Borders are the semantic color at ~20% alpha (hex8 "33" suffix), not the
// soft-tint fill — a tint-colored border was nearly invisible against the
// tint background; this gives the pill a visible outline, per the design
// system's pill-badge spec.
const VARIANT_STYLES: Record<ChipVariant, { bg: string; text: string; border: string; dot: string }> = {
  neutral: { bg: theme.colors.background, text: theme.colors.textSecondary, border: theme.colors.border, dot: theme.colors.textMuted },
  amber: { bg: theme.colors.accentAmberSoft, text: theme.colors.accentAmberDeep, border: `${theme.colors.accentAmber}33`, dot: theme.colors.accentAmber },
  teal: { bg: theme.colors.positiveTealSoft, text: theme.colors.positiveTealDeep, border: `${theme.colors.positiveTeal}33`, dot: theme.colors.positiveTeal },
  danger: { bg: theme.colors.dangerEmberSoft, text: theme.colors.dangerEmberDeep, border: `${theme.colors.dangerEmber}33`, dot: theme.colors.dangerEmber },
};

export function Chip({ label, variant = 'neutral', onPress, selected, dot, style }: ChipProps) {
  const colors = VARIANT_STYLES[variant];
  const Wrapper = onPress ? Pressable : View;

  const chipStyle = selected
    ? { backgroundColor: theme.colors.accentPurpleSoft, borderColor: theme.colors.accentPurple }
    : { backgroundColor: colors.bg, borderColor: colors.border };
  const textColor = selected ? theme.colors.accentPurpleDeep : colors.text;

  return (
    <Wrapper style={[styles.chip, chipStyle, style]} onPress={onPress}>
      {dot && <View style={[styles.dot, { backgroundColor: selected ? theme.colors.accentPurple : colors.dot }]} />}
      <Text style={[styles.label, { color: textColor }]}>{label}</Text>
    </Wrapper>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: theme.radius.pill,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignSelf: 'flex-start',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  label: {
    fontFamily: theme.typography.bodyMedium,
    fontSize: 13,
  },
});
