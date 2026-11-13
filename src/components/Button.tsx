import { ActivityIndicator, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import { theme } from '../theme';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  /** Shows a spinner instead of the label and blocks taps while an action runs. */
  loading?: boolean;
  /**
   * `large` (48pt): the one main action of a screen. `compact` (40pt drawn,
   * 48pt tap area via hitSlop): actions inside cards; full content width so
   * edges align with the card, lighter than a large button.
   */
  size?: 'large' | 'compact';
  style?: StyleProp<ViewStyle>;
}

type Variant = 'primary' | 'secondary';

// Compact buttons are drawn 40pt tall; hitSlop adds 4pt above and below so
// the tap area is 48pt (UI/UX Pro Max: touch-target-size, extend the hit
// area beyond the visual bounds).
const COMPACT_HIT_SLOP = { top: 4, bottom: 4, left: 4, right: 4 };

/**
 * The app's one button. Pressed state dims and shrinks slightly (press and
 * scale feedback); disabled is clearly faded; loading shows a spinner and
 * reports "busy" to screen readers. Use PrimaryButton / SecondaryButton.
 */
export function Button({ label, onPress, disabled, loading, size = 'large', style, variant }: ButtonProps & { variant: Variant }) {
  const inactive = !!disabled || !!loading;
  const isPrimary = variant === 'primary';
  const isCompact = size === 'compact';

  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      hitSlop={isCompact ? COMPACT_HIT_SLOP : undefined}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy: !!loading }}
      style={({ pressed }) => [
        styles.base,
        isCompact ? styles.compact : styles.large,
        isPrimary ? styles.primary : styles.secondary,
        pressed && !inactive && styles.pressed,
        disabled && !loading && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={isPrimary ? theme.colors.onInkButton : theme.colors.accentPurpleDeep} />
      ) : (
        <Text
          numberOfLines={2}
          style={[styles.label, isCompact ? styles.labelCompact : styles.labelLarge, isPrimary ? styles.labelPrimary : styles.labelSecondary]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: theme.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  large: { alignSelf: 'stretch', minHeight: 48, paddingVertical: 12, paddingHorizontal: 16 },
  // Card actions span the card's content width, so their edges line up with
  // the card padding and any boxes above them (one consistent alignment
  // line); 40pt keeps them visually below a screen's large main button.
  compact: { alignSelf: 'stretch', minHeight: 40, paddingVertical: 8, paddingHorizontal: 14 },
  primary: { backgroundColor: theme.colors.inkButton },
  secondary: { borderWidth: 1, borderColor: theme.colors.inkButton, backgroundColor: 'transparent' },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  disabled: { opacity: 0.45 },
  label: { fontFamily: theme.typography.bodySemibold, textAlign: 'center' },
  labelLarge: { fontSize: theme.type.md },
  labelCompact: { fontSize: theme.type.sm },
  labelPrimary: { color: theme.colors.onInkButton },
  // Light brand purple: 11:1 on the dark background.
  labelSecondary: { color: theme.colors.accentPurpleDeep },
});
