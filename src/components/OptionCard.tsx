import { Pressable, StyleSheet, Text, View } from 'react-native';
import { IconCircle, IconCircleCheckFilled } from '@tabler/icons-react-native';
import { theme } from '../theme';

interface OptionCardProps {
  label: string;
  selected: boolean;
  onPress: () => void;
}

/** A large, tappable choice row. Selection shows a check mark as well as colour, so it doesn't rely on colour alone. */
export function OptionCard({ label, selected, onPress }: OptionCardProps) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.optionCard, selected && styles.optionCardSelected]}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={label}
    >
      <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>{label}</Text>
      <View>
        {selected ? (
          <IconCircleCheckFilled size={24} color={theme.colors.accentPurple} />
        ) : (
          <IconCircle size={24} color={theme.colors.textMuted} />
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 48,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  optionCardSelected: {
    borderColor: theme.colors.accentPurple,
    backgroundColor: theme.colors.accentPurpleSoft,
  },
  optionLabel: { flex: 1, fontFamily: theme.typography.bodyMedium, fontSize: theme.type.md, lineHeight: 24, color: theme.colors.textPrimary },
  optionLabelSelected: { color: theme.colors.accentPurpleDeep },
});
