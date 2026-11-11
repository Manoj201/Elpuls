import { Pressable, StyleSheet, Text } from 'react-native';
import { theme } from '../theme';

interface OptionCardProps {
  label: string;
  selected: boolean;
  onPress: () => void;
}

export function OptionCard({ label, selected, onPress }: OptionCardProps) {
  return (
    <Pressable onPress={onPress} style={[styles.optionCard, selected && styles.optionCardSelected]}>
      <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  optionCard: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  optionCardSelected: {
    borderColor: theme.colors.accentPurple,
    backgroundColor: theme.colors.accentPurpleSoft,
  },
  optionLabel: { fontFamily: theme.typography.bodyMedium, fontSize: 15, color: theme.colors.textPrimary },
  optionLabelSelected: { color: theme.colors.accentPurpleDeep },
});
