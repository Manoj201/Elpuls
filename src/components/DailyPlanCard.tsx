import { useEffect, useMemo, useState, type ComponentType } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { IconBolt, IconFlame, IconHandStop, IconTemperatureMinus } from '@tabler/icons-react-native';
import { formatClock, formatOre } from '../lib/formatNumber';
import { APPLIANCE_ICONS, householdDefaultIds, matchPresetId } from '../lib/applianceDisplay';
import type { DailyPlan, PlanActivity, PlanWindow } from '../hooks/useDailyPlan';
import type { SupportedLanguage } from '../i18n';
import type { HeatingType } from '../stores/useUserStore';
import { theme } from '../theme';
import { AiNote } from './AiNote';
import { Card } from './Card';
import { Chip } from './Chip';

type IconType = ComponentType<{ size?: number; color?: string }>;

interface DailyPlanCardProps {
  today: DailyPlan | null;
  tomorrow: DailyPlan | null;
  now: Date;
  hasEv: boolean;
  heatingType: HeatingType;
  disabledDefaults: string[];
  /** Labels of registered appliances, matched to presets (e.g. a "Pool" → pool heater row). */
  registeredLabels: string[];
}

const ICONS: Record<PlanActivity, IconType> = {
  washing_machine: APPLIANCE_ICONS.washing_machine ?? IconBolt,
  dishwasher: APPLIANCE_ICONS.dishwasher ?? IconBolt,
  dryer: APPLIANCE_ICONS.dryer ?? IconBolt,
  ev: APPLIANCE_ICONS.ev ?? IconBolt,
  pool_heater: APPLIANCE_ICONS.pool_heater ?? IconBolt,
  heatBank: IconFlame,
  heatCoast: IconTemperatureMinus,
  avoid: IconHandStop,
};

/**
 * "Din plan" (Pro): today's and tomorrow's calculated windows for this
 * household, plus the day's short AI summary. The times come from the
 * prices (functions/src/dailyPlan.ts); the AI only writes the summary.
 */
export function DailyPlanCard({ today, tomorrow, now, hasEv, heatingType, disabledDefaults, registeredLabels }: DailyPlanCardProps) {
  const { t, i18n } = useTranslation();
  const language = i18n.language as SupportedLanguage;
  // Open on tomorrow when today has no plan but tomorrow does.
  const [day, setDay] = useState<'today' | 'tomorrow'>(!today && tomorrow ? 'tomorrow' : 'today');
  // The plans load after the card first shows: switch once they arrive.
  useEffect(() => {
    if (!today && tomorrow) setDay('tomorrow');
  }, [today, tomorrow]);
  const plan = day === 'tomorrow' ? tomorrow : today;
  const isTomorrow = plan !== null && plan === tomorrow && day === 'tomorrow';

  // Only rows that fit this home: its appliances, heat rows for electric
  // heating / heat pumps, and always the stretch to avoid.
  const mine = useMemo(() => {
    const set = new Set<PlanActivity>(['avoid']);
    for (const id of householdDefaultIds(hasEv)) if (!disabledDefaults.includes(id)) set.add(id as PlanActivity);
    for (const label of registeredLabels) {
      const id = matchPresetId(label);
      if (id) set.add(id as PlanActivity);
    }
    if (heatingType === 'electric' || heatingType === 'heat_pump') {
      set.add('heatBank');
      set.add('heatCoast');
    }
    return set;
  }, [hasEv, disabledDefaults, registeredLabels, heatingType]);

  const rows = useMemo(
    () =>
      (plan?.windows ?? [])
        .filter((w) => mine.has(w.activity))
        .sort((a, b) => a.start.getTime() - b.start.getTime()),
    [plan, mine],
  );

  if (!today && !tomorrow) {
    return (
      <Card style={styles.card}>
        <Text style={styles.title}>{t('plan.title')}</Text>
        <Text style={styles.empty}>{t('plan.notReady')}</Text>
      </Card>
    );
  }

  function status(w: PlanWindow): { text: string; live: boolean; past: boolean } | null {
    if (isTomorrow) return null;
    if (now >= w.end) return { text: t('plan.statusPast'), live: false, past: true };
    if (now >= w.start) return { text: t('plan.statusNow'), live: true, past: false };
    const hours = Math.round((w.start.getTime() - now.getTime()) / 3600000);
    return { text: hours < 1 ? t('plan.statusSoon') : t('plan.statusIn', { count: hours }), live: false, past: false };
  }

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">
          {t('plan.title')}
        </Text>
        {tomorrow && (
          <View style={styles.dayRow} accessibilityRole="radiogroup">
            <Chip label={t('plan.today')} selected={day === 'today'} onPress={() => setDay('today')} />
            <Chip label={t('plan.tomorrow')} selected={day === 'tomorrow'} onPress={() => setDay('tomorrow')} />
          </View>
        )}
      </View>

      {!plan || (day === 'today' && !today) ? (
        <Text style={styles.empty}>{t(tomorrow ? 'plan.todayMissing' : 'plan.notReady')}</Text>
      ) : plan.flatDay ? (
        <Text style={styles.flat}>{t('plan.flatDay')}</Text>
      ) : (
        <View>
          {rows.map((w, i) => {
            const Icon = ICONS[w.activity];
            const s = status(w);
            const range = `${formatClock(w.start)}–${formatClock(w.end)}`;
            const night = w.start.getHours() < 6 && (s === null || !s.past) && !['heatBank', 'heatCoast', 'avoid'].includes(w.activity);
            const isAvoid = w.activity === 'avoid';
            return (
              <View
                key={`${w.activity}${w.start.toISOString()}`}
                style={[styles.row, i > 0 && styles.divider, s?.past && styles.past]}
                accessible
                accessibilityLabel={`${t(`plan.activity.${w.activity}`)}, ${range}${s ? `, ${s.text}` : ''}`}
              >
                <View style={[styles.icon, isAvoid && styles.iconAvoid]}>
                  <Icon size={20} color={isAvoid ? theme.colors.dangerEmberDeep : theme.colors.accentPurpleDeep} />
                </View>
                <View style={styles.text}>
                  <Text style={styles.label}>{t(`plan.activity.${w.activity}`)}</Text>
                  <Text style={styles.meta}>
                    {range}
                    {isAvoid ? ` · ${t('plan.avoidPrice', { price: formatOre(w.averagePrice, language) })}` : ''}
                  </Text>
                  {night && <Text style={styles.hint}>{t('plan.nightHint')}</Text>}
                  {w.activity === 'heatCoast' && <Text style={styles.hint}>{t('plan.coastHint')}</Text>}
                </View>
                {s && (
                  <View style={[styles.status, s.live && styles.statusLive]}>
                    <Text style={[styles.statusText, s.live && styles.statusTextLive]}>{s.text}</Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}

      {plan?.text && (
        <View style={styles.summary}>
          <Text style={styles.summaryText}>{plan.text}</Text>
          <AiNote kind="explainer" />
        </View>
      )}
      <Text style={styles.footnote}>{t('plan.timesNote')}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', rowGap: 8, marginBottom: 8 },
  title: { fontFamily: theme.typography.displayMedium, fontSize: theme.type.lg, color: theme.colors.textPrimary },
  dayRow: { flexDirection: 'row', gap: 6 },
  empty: { fontFamily: theme.typography.body, fontSize: theme.type.sm, lineHeight: 20, color: theme.colors.textSecondary, marginTop: 4 },
  flat: { fontFamily: theme.typography.body, fontSize: theme.type.md, lineHeight: 22, color: theme.colors.textSecondary, marginVertical: 8 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  divider: { borderTopWidth: 1, borderTopColor: theme.colors.borderMuted },
  past: { opacity: 0.5 },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.accentPurpleSoft,
  },
  iconAvoid: { backgroundColor: theme.colors.dangerEmberSoft },
  text: { flex: 1, marginHorizontal: 12 },
  label: { fontFamily: theme.typography.bodyMedium, fontSize: theme.type.md, color: theme.colors.textPrimary },
  meta: { fontFamily: theme.typography.body, fontSize: theme.type.sm, color: theme.colors.textSecondary, marginTop: 2, fontVariant: ['tabular-nums'] },
  hint: { fontFamily: theme.typography.body, fontSize: theme.type.sm, color: theme.colors.textSecondary, marginTop: 2 },
  status: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: theme.radius.pill, borderWidth: 1, borderColor: theme.colors.border },
  statusLive: { borderColor: theme.colors.accentPurple, backgroundColor: theme.colors.accentPurpleSoft },
  statusText: { fontFamily: theme.typography.bodyMedium, fontSize: theme.type.xs, color: theme.colors.textSecondary },
  statusTextLive: { color: theme.colors.textPrimary },
  summary: { marginTop: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: theme.colors.borderMuted },
  summaryText: { fontFamily: theme.typography.body, fontSize: theme.type.md, lineHeight: 22, color: theme.colors.textPrimary },
  footnote: { fontFamily: theme.typography.body, fontSize: theme.type.xs, color: theme.colors.textSecondary, marginTop: 10 },
});
