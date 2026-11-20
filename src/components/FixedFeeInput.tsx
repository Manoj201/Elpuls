import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { theme } from '../theme';
import { Chip } from './Chip';
import { LabeledInput } from './LabeledInput';

/** Accepts Swedish decimal commas ("24,5") as well as dots. Returns null for empty or non-positive input. */
function parseAmount(value: string): number | null {
  const parsed = parseFloat(value.replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function formatInput(value: number | null): string {
  return value === null ? '' : String(Number(value.toFixed(2))).replace('.', ',');
}

const VAT = 1.25;
export type FeePer = 'year' | 'month';

/** Stored fee (kr/month incl. VAT) → what the bill prints: excl. VAT, per year or month. */
export function feeToInput(monthlyInclVat: number | null, per: FeePer): string {
  if (monthlyInclVat === null) return '';
  const exclVat = monthlyInclVat / VAT;
  return formatInput(per === 'year' ? exclVat * 12 : exclVat);
}

/** Typed fee (excl. VAT, per year or month) → stored kr/month incl. VAT. */
export function inputToFee(value: string, per: FeePer): number | null {
  const n = parseAmount(value);
  if (n === null) return null;
  return Math.round((per === 'year' ? n / 12 : n) * VAT * 100) / 100;
}

/**
 * A fixed fee typed exactly as the bill prints it: excl. VAT, per year or per
 * month. Underneath, what it comes to per month with VAT, which is what
 * Elpuls stores and uses.
 */
export function FixedFeeInput({
  label,
  where,
  placeholder,
  value,
  per,
  onChangeValue,
  onChangePer,
  warning,
}: {
  label: string;
  where: string;
  placeholder: string;
  value: string;
  per: FeePer;
  onChangeValue: (value: string) => void;
  onChangePer: (per: FeePer) => void;
  /** Amber "check this against your bill" note from the scan's checks. */
  warning?: string;
}) {
  const { t } = useTranslation();
  const monthly = inputToFee(value, per);
  return (
    <View style={styles.feeInput}>
      <LabeledInput
        label={t('billScan.fixedExclVat', { label })}
        unit={t(per === 'year' ? 'billScan.unitKrPerYear' : 'fields.unitKrPerMonth')}
        placeholder={placeholder}
        keyboardType="decimal-pad"
        value={value}
        onChangeText={onChangeValue}
        warning={warning}
      />
      <View style={styles.perRow} accessibilityRole="radiogroup">
        <Chip label={t('billScan.perYear')} selected={per === 'year'} onPress={() => onChangePer('year')} />
        <Chip label={t('billScan.perMonth')} selected={per === 'month'} onPress={() => onChangePer('month')} />
      </View>
      <Text style={styles.feeHint}>{where}</Text>
      {monthly !== null && (
        <Text style={styles.feeWithVat}>{t('billScan.withVat', { amount: Math.round(monthly) })}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  feeInput: { marginBottom: 16 },
  perRow: { flexDirection: 'row', gap: 8, marginTop: -8 },
  feeHint: { fontFamily: theme.typography.body, fontSize: theme.type.sm, lineHeight: 20, color: theme.colors.textSecondary, marginTop: 8 },
  feeWithVat: { fontFamily: theme.typography.bodyMedium, fontSize: theme.type.sm, color: theme.colors.textPrimary, marginTop: 4, fontVariant: ['tabular-nums'] },
});
