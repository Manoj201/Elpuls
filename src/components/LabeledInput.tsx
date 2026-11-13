import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { theme } from '../theme';

interface LabeledInputProps extends Omit<TextInputProps, 'style'> {
  /** Always-visible label above the field — never rely on the placeholder alone, it disappears once a value is entered. */
  label: string;
  /** Unit shown inside the field on the right, e.g. "öre/kWh". */
  unit?: string;
  /** Optional small helper text under the field. */
  helper?: string;
}

export function LabeledInput({ label, unit, helper, placeholderTextColor, ...inputProps }: LabeledInputProps) {
  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.field}>
        <TextInput
          style={styles.input}
          placeholderTextColor={placeholderTextColor ?? theme.colors.textFaint}
          accessibilityLabel={unit ? `${label} (${unit})` : label}
          {...inputProps}
        />
        {unit ? <Text style={styles.unit}>{unit}</Text> : null}
      </View>
      {helper ? <Text style={styles.helper}>{helper}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { alignSelf: 'stretch', marginBottom: 12 },
  label: {
    fontFamily: theme.typography.bodyMedium,
    fontSize: 12,
    color: theme.colors.textMuted,
    marginBottom: 6,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: 16,
  },
  input: {
    flex: 1,
    paddingVertical: 14,
    fontFamily: theme.typography.body,
    fontSize: 15,
    color: theme.colors.textPrimary,
  },
  unit: {
    fontFamily: theme.typography.body,
    fontSize: 13,
    color: theme.colors.textMuted,
    marginLeft: 8,
  },
  helper: {
    fontFamily: theme.typography.body,
    fontSize: 12,
    color: theme.colors.textFaint,
    marginTop: 4,
  },
});
