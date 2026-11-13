import type { ReactNode } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { theme } from '../theme';

interface LabeledInputProps extends Omit<TextInputProps, 'style'> {
  /** Always-visible label above the field — never rely on the placeholder alone, it disappears once a value is entered. */
  label: string;
  /** Unit shown inside the field on the right, e.g. "öre/kWh". */
  unit?: string;
  /** Optional small helper text under the field. */
  helper?: string;
  /** Optional control inside the field on the right, e.g. a show/hide password button. */
  accessory?: ReactNode;
}

export function LabeledInput({ label, unit, helper, accessory, placeholderTextColor, ...inputProps }: LabeledInputProps) {
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
        {accessory}
      </View>
      {helper ? <Text style={styles.helper}>{helper}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { alignSelf: 'stretch', marginBottom: 16 },
  label: {
    fontFamily: theme.typography.bodyMedium,
    fontSize: theme.type.sm,
    color: theme.colors.textSecondary,
    marginBottom: 8,
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
    paddingVertical: 12,
    minHeight: 48,
    fontFamily: theme.typography.body,
    fontSize: theme.type.md,
    color: theme.colors.textPrimary,
  },
  unit: {
    fontFamily: theme.typography.body,
    fontSize: theme.type.sm,
    color: theme.colors.textSecondary,
    marginLeft: 8,
  },
  helper: {
    fontFamily: theme.typography.body,
    fontSize: theme.type.sm,
    lineHeight: 20,
    color: theme.colors.textSecondary,
    marginTop: 6,
  },
});
