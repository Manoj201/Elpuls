import { Pressable, StyleSheet, Text, View } from 'react-native';
import { IconCircle, IconCircleCheckFilled } from '@tabler/icons-react-native';
import { theme } from '../theme';

const MARK_SIZE = 24;

interface OptionCardProps {
  label: string;
  /** Optional second line that explains the choice in plain words. */
  description?: string;
  selected: boolean;
  onPress: () => void;
}

/** A large, tappable choice row. Selection shows a check mark as well as colour, so it doesn't rely on colour alone. */
export function OptionCard({ label, description, selected, onPress }: OptionCardProps) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.optionCard, selected && styles.optionCardSelected]}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={description ? `${label}. ${description}` : label}
    >
      <View style={styles.text}>
        <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>{label}</Text>
        {description ? <Text style={styles.description}>{description}</Text> : null}
      </View>
      <View style={styles.mark}>
        {selected ? (
          <IconCircleCheckFilled size={MARK_SIZE} color={theme.colors.accentPurple} />
        ) : (
          <IconCircle size={MARK_SIZE} color={theme.colors.textMuted} />
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  optionCard: {
    // Not a flex row: in a row the description was measured too wide and its
    // last words were cut off instead of wrapping. The text takes the full
    // width minus room for the check mark, which is pinned on the right.
    justifyContent: 'center',
    minHeight: 48,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingVertical: 12,
    paddingLeft: 16,
    paddingRight: 16 + MARK_SIZE + 12,
  },
  optionCardSelected: {
    borderColor: theme.colors.accentPurple,
    backgroundColor: theme.colors.accentPurpleSoft,
  },
  text: { alignSelf: 'stretch' },
  mark: { position: 'absolute', right: 16, top: 0, bottom: 0, justifyContent: 'center' },
  description: { marginTop: 2, fontFamily: theme.typography.body, fontSize: theme.type.sm, lineHeight: 20, color: theme.colors.textSecondary },
  optionLabel: { fontFamily: theme.typography.bodyMedium, fontSize: theme.type.md, lineHeight: 24, color: theme.colors.textPrimary },
  optionLabelSelected: { color: theme.colors.accentPurpleDeep },
});
