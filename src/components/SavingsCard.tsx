import { useState } from 'react';
import { ActivityIndicator, LayoutAnimation, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { IconChevronDown, IconChevronUp, IconPigMoney } from '@tabler/icons-react-native';
import type { AppliancePreset } from '../config/appliances';
import type { SupportedLanguage } from '../i18n';
import type { MonthlySavings } from '../hooks/useMonthlySavings';
import { kindOf, USES_PER_WEEK, EVENING_PEAK_START, EVENING_PEAK_END } from '../lib/savings';
import { resolveApplianceLabel } from '../lib/applianceDisplay';
import { theme } from '../theme';
import { Card } from './Card';

interface SavingsCardProps {
  savings: MonthlySavings;
  household: AppliancePreset[];
  language: SupportedLanguage;
  now: Date;
}

const LOCALE: Record<SupportedLanguage, string> = { sv: 'sv-SE', en: 'en-GB' };

function kr(value: number, language: SupportedLanguage): string {
  return Math.round(value).toLocaleString(LOCALE[language]);
}

/**
 * "Möjlig besparing i november": an estimate of what running the household's
 * appliances at the cheapest times (instead of 17–20) is worth this month.
 * One big number (a stat tile), one plain line saying what it means, today's
 * part, and the assumptions folded away (UI/UX Pro Max content-priority,
 * progressive-disclosure). Always called an estimate: Elpuls can't see what
 * actually ran.
 */
export function SavingsCard({ savings, household, language, now }: SavingsCardProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const month = now.toLocaleDateString(LOCALE[language], { month: 'long' });
  const shiftable = household.filter((a) => a.shiftable);
  const flat = !savings.isLoading && savings.monthTotal < 1;

  const usage = shiftable
    .map((a) => {
      const kind = kindOf(a);
      const label = resolveApplianceLabel(a, t);
      // Preset names go mid-sentence ("disk 5 gånger"); the user's own names stay as typed.
      const name = a.householdDefault || a.id === 'ev' ? label.charAt(0).toLowerCase() + label.slice(1) : label;
      return t('savings.usesPerWeek', { name, count: USES_PER_WEEK[kind] ?? 3 });
    })
    .join(', ');

  const Chevron = open ? IconChevronUp : IconChevronDown;
  const total = kr(savings.monthTotal, language);
  const max = Math.max(...savings.daily.map((v) => v ?? 0), 1);
  const lastDay = savings.daily.length;
  const meaning = flat ? t('savings.flat') : t('savings.meaning', { start: EVENING_PEAK_START, end: EVENING_PEAK_END });

  return (
    <Card style={styles.card}>
      {/* Number first, full width (stat tile). One accessible group so the
          screen reader says it as one sentence. */}
      <View
        accessible
        accessibilityLabel={
          savings.isLoading
            ? t('savings.loading')
            : `${t('savings.label', { month })}: ${t('savings.amountA11y', { amount: total })}. ${meaning}${
                savings.today !== null ? ` ${t('savings.today')} ${t('savings.todayAmount', { amount: kr(savings.today, language) })}.` : ''
              }`
        }
      >
        <View style={styles.labelRow}>
          <IconPigMoney size={20} color={theme.colors.positiveTealDeep} />
          <Text style={styles.label}>{t('savings.label', { month })}</Text>
        </View>
        {savings.isLoading ? (
          <ActivityIndicator style={styles.spinner} color={theme.colors.textSecondary} />
        ) : (
          <Text style={styles.amountRow}>
            <Text style={styles.approx}>{t('savings.approx')} </Text>
            <Text style={styles.amount}>{total} kr</Text>
          </Text>
        )}
        <Text style={styles.meaning}>{meaning}</Text>
      </View>

      {/* The month so far, one bar per day: shows the total building up.
          Today is the bright bar; days not counted are faint stubs. */}
      {!savings.isLoading && (
        <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          <View style={styles.bars}>
            {savings.daily.map((v, i) => {
              const isToday = i === savings.todayIndex;
              const h = v === null ? 0 : Math.max(3, Math.round((v / max) * BAR_HEIGHT));
              return (
                <View key={i} style={styles.barSlot}>
                  {v === null ? (
                    <View style={styles.barEmpty} />
                  ) : (
                    <View style={[styles.bar, { height: h }, isToday ? styles.barToday : styles.barPast]} />
                  )}
                </View>
              );
            })}
          </View>
          <View style={styles.axis}>
            <Text style={styles.axisText}>1</Text>
            <Text style={styles.axisText}>{lastDay}</Text>
          </View>
        </View>
      )}

      {savings.today !== null && !savings.isLoading && (
        <Text style={styles.stat}>
          {t('savings.today')} <Text style={styles.statValue}>{t('savings.todayAmount', { amount: kr(savings.today, language) })}</Text>
        </Text>
      )}

      <Pressable
        onPress={() => {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          setOpen((o) => !o);
        }}
        style={({ pressed }) => [styles.foldRow, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        hitSlop={4}
      >
        <Text style={styles.foldLabel}>{t('savings.howTitle')}</Text>
        <Chevron size={18} color={theme.colors.textSecondary} />
      </Pressable>
      {open && (
        <View style={styles.foldBody}>
          <Text style={styles.foldText}>{t('savings.howUsage', { usage })}</Text>
          <Text style={styles.foldText}>{t('savings.howCompare', { start: EVENING_PEAK_START, end: EVENING_PEAK_END })}</Text>
          {savings.startedThisMonth && <Text style={styles.foldText}>{t('savings.howStart')}</Text>}
          <Text style={styles.foldText}>{t('savings.howEstimate')}</Text>
        </View>
      )}
    </Card>
  );
}

const BAR_HEIGHT = 36;

const styles = StyleSheet.create({
  card: { marginBottom: 16, gap: 14 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { fontFamily: theme.typography.bodyMedium, fontSize: theme.type.md, color: theme.colors.textSecondary },
  amountRow: { marginTop: 4 },
  approx: { fontFamily: theme.typography.bodyMedium, fontSize: theme.type.lg, color: theme.colors.textSecondary },
  amount: {
    fontFamily: theme.typography.display,
    fontSize: theme.type.xxl,
    color: theme.colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  spinner: { alignSelf: 'flex-start', marginVertical: 12 },
  meaning: { marginTop: 6, fontFamily: theme.typography.body, fontSize: theme.type.sm, lineHeight: 20, color: theme.colors.textSecondary },
  bars: { flexDirection: 'row', alignItems: 'flex-end', height: BAR_HEIGHT, gap: 2 },
  barSlot: { flex: 1, height: BAR_HEIGHT, justifyContent: 'flex-end' },
  bar: { borderTopLeftRadius: 2, borderTopRightRadius: 2 },
  barPast: { backgroundColor: theme.colors.positiveTeal, opacity: 0.45 },
  barToday: { backgroundColor: theme.colors.positiveTeal },
  barEmpty: { height: 2, borderRadius: 1, backgroundColor: theme.colors.border },
  axis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  axisText: { fontFamily: theme.typography.body, fontSize: theme.type.xs, color: theme.colors.textSecondary },
  stat: { fontFamily: theme.typography.body, fontSize: theme.type.md, color: theme.colors.textSecondary },
  statValue: { fontFamily: theme.typography.bodySemibold, color: theme.colors.positiveTealDeep },
  foldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingTop: 8,
  },
  pressed: { opacity: 0.7 },
  foldLabel: { fontFamily: theme.typography.bodyMedium, fontSize: theme.type.md, color: theme.colors.textPrimary },
  foldBody: { gap: 8 },
  foldText: { fontFamily: theme.typography.body, fontSize: theme.type.sm, lineHeight: 20, color: theme.colors.textSecondary },
});
