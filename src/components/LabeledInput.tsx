import type { ReactNode } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { IconAlertTriangle } from '@tabler/icons-react-native';
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
  /** Optional amber note under the field, e.g. "Check this against your bill" (field gets an amber border). */
  warning?: string;
}

export function LabeledInput({ label, unit, helper, accessory, warning, placeholderTextColor, ...inputProps }: LabeledInputProps) {
  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.field, warning ? styles.fieldWarning : null]}>
        <TextInput
          style={styles.input}
          placeholderTextColor={placeholderTextColor ?? theme.colors.textFaint}
          accessibilityLabel={`${unit ? `${label} (${unit})` : label}${warning ? `. ${warning}` : ''}`}
          {...inputProps}
        />
        {unit ? <Text style={styles.unit}>{unit}</Text> : null}
        {accessory}
      </View>
      {warning ? (
        <View style={styles.warningRow}>
          <IconAlertTriangle size={16} color={theme.colors.accentAmberDeep} style={styles.warningIcon} />
          <Text style={styles.warning}>{warning}</Text>
        </View>
      ) : null}
      {helper ? <Text style={styles.helper}>{helper}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fieldWarning: { borderColor: theme.colors.accentAmber },
  warningRow: { flexDirection: 'row', gap: 6, marginTop: 6, alignItems: 'flex-start' },
  warningIcon: { marginTop: 2 },
  warning: { flex: 1, fontFamily: theme.typography.bodyMedium, fontSize: theme.type.sm, lineHeight: 20, color: theme.colors.accentAmberDeep },
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
