import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { LayoutAnimation, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  IconBolt,
  IconChevronDown,
  IconChevronUp,
  IconFlame,
  IconHandStop,
  IconMoon,
  IconTemperatureMinus,
} from '@tabler/icons-react-native';
import { formatClock } from '../lib/formatNumber';
import { APPLIANCE_ICONS, householdDefaultIds, matchPresetId } from '../lib/applianceDisplay';
import type { DailyPlan, PlanActivity, PlanWindow } from '../hooks/useDailyPlan';
import type { SupportedLanguage } from '../i18n';
import type { HeatingType } from '../stores/useUserStore';
import { theme } from '../theme';
import { AiNote } from './AiNote';
import { Card } from './Card';
import { Chip } from './Chip';
import { SecondaryButton } from './SecondaryButton';

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

const NOT_APPLIANCE: PlanActivity[] = ['heatBank', 'heatCoast', 'avoid'];

/** Only rows that fit this home; the washer + dryer share one window (as in the pushes), shown once. */
function rowsFor(plan: DailyPlan | null, mine: Set<PlanActivity>): PlanWindow[] {
  const windows = (plan?.windows ?? []).filter((w) => mine.has(w.activity));
  return windows
    .filter(
      (w) =>
        w.activity !== 'dryer' ||
        !windows.some((o) => o.activity === 'washing_machine' && o.start.getTime() === w.start.getTime()),
    )
    .sort((a, b) => a.start.getTime() - b.start.getTime());
}

/**
 * "Din plan" (Pro): today's and tomorrow's calculated windows for this
 * household, plus the day's short AI summary. The times come from the
 * prices (functions/src/dailyPlan.ts); the AI only writes the summary.
 *
 * Layout (UI/UX Pro Max content-priority, progressive-disclosure,
 * empty-states): the summary first (the day in one glance), the next thing
 * to do as a highlighted row, the rest of the day below, passed times folded
 * away. When today is over, a clear evening state points to tomorrow, and
 * the card opens on tomorrow by itself once per evening.
 */
export function DailyPlanCard({ today, tomorrow, now, hasEv, heatingType, disabledDefaults, registeredLabels }: DailyPlanCardProps) {
  const { t, i18n } = useTranslation();
  const language = i18n.language as SupportedLanguage;

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

  const todayRows = useMemo(() => rowsFor(today, mine), [today, mine]);
  const tomorrowRows = useMemo(() => rowsFor(tomorrow, mine), [tomorrow, mine]);
  // Judged on this home's rows only: a window for an appliance the home
  // doesn't have (shown nowhere) must not keep "today" open.
  const todayOver = today !== null && (todayRows.length === 0 ? false : todayRows.every((w) => now >= w.end));

  const [day, setDay] = useState<'today' | 'tomorrow'>(() => ((!today || todayOver) && tomorrow ? 'tomorrow' : 'today'));
  // Plans load after the card first shows, and evening comes while it's open:
  // switch to tomorrow once per day when today has nothing left. A tap on
  // "Today" after that is respected.
  const autoSwitchedFor = useRef<string | null>(null);
  const todayKey = now.toDateString();
  useEffect(() => {
    if (!tomorrow) return;
    if ((!today || todayOver) && autoSwitchedFor.current !== todayKey) {
      autoSwitchedFor.current = todayKey;
      setDay('tomorrow');
    }
  }, [today, tomorrow, todayOver, todayKey]);

  const [showPassed, setShowPassed] = useState(false);

  const isTomorrow = day === 'tomorrow' && tomorrow !== null;
  const plan = isTomorrow ? tomorrow : today;
  const rows = isTomorrow ? tomorrowRows : todayRows;
  const upcoming = isTomorrow ? rows : rows.filter((w) => now < w.end);
  const passed = isTomorrow ? [] : rows.filter((w) => now >= w.end);
  // The next thing to do (not "avoid", which is a warning, not a task).
  const next = isTomorrow ? null : upcoming.find((w) => w.activity !== 'avoid') ?? null;
  const rest = upcoming.filter((w) => w !== next);
  const showEvening = !isTomorrow && today !== null && !today.flatDay && todayOver;

  const ore = (sekPerKwh: number) => Math.round(sekPerKwh * 100).toLocaleString(language === 'sv' ? 'sv-SE' : 'en-US');

  const labelOf = (w: PlanWindow): string => {
    const own = t(`plan.activity.${w.activity}`);
    if (w.activity !== 'washing_machine') return own;
    const dryer = plan?.windows.find((o) => o.activity === 'dryer');
    if (!mine.has('dryer') || !dryer || dryer.start.getTime() !== w.start.getTime()) return own;
    return t('chart.bestTimesPair', { first: own, second: t('plan.activity.dryer').toLocaleLowerCase() });
  };

  function status(w: PlanWindow): { text: string; live: boolean } | null {
    if (isTomorrow) return null;
    if (now >= w.end) return { text: t('plan.statusPast'), live: false };
    if (now >= w.start) return { text: t('plan.statusNow'), live: true };
    const hours = Math.round((w.start.getTime() - now.getTime()) / 3600000);
    return { text: hours < 1 ? t('plan.statusSoon') : t('plan.statusIn', { count: hours }), live: false };
  }

  function renderRow(w: PlanWindow, opts: { first: boolean; hero?: boolean; past?: boolean }) {
    const Icon = ICONS[w.activity];
    const s = status(w);
    const range = `${formatClock(w.start)}–${formatClock(w.end)}`;
    const isAvoid = w.activity === 'avoid';
    const night = !opts.past && w.start.getHours() < 6 && !NOT_APPLIANCE.includes(w.activity);
    return (
      <View
        key={`${w.activity}${w.start.toISOString()}`}
        style={[styles.row, opts.hero && styles.heroRow, !opts.first && !opts.hero && styles.divider, opts.past && styles.past]}
        accessible
        accessibilityLabel={`${opts.hero ? `${t('plan.next')}: ` : ''}${labelOf(w)}, ${range}${s ? `, ${s.text}` : ''}`}
      >
        <View style={[styles.icon, opts.hero && styles.iconHero, isAvoid && styles.iconAvoid]}>
          <Icon size={20} color={isAvoid ? theme.colors.dangerEmberDeep : theme.colors.accentPurpleDeep} />
        </View>
        <View style={styles.text}>
          {opts.hero && <Text style={styles.eyebrow}>{t('plan.next')}</Text>}
          <Text style={[styles.label, opts.hero && styles.labelHero]}>{labelOf(w)}</Text>
          <Text style={styles.meta}>
            {range}
            {isAvoid ? ` · ${t('plan.avoidPrice', { price: ore(w.averagePrice) })}` : ''}
          </Text>
          {night && <Text style={styles.hint}>{t('plan.nightHint')}</Text>}
          {w.activity === 'heatCoast' && !opts.past && <Text style={styles.hint}>{t('plan.coastHint')}</Text>}
        </View>
        {s && !opts.past && (
          <View style={[styles.status, (s.live || opts.hero) && styles.statusLive]}>
            <Text style={[styles.statusText, (s.live || opts.hero) && styles.statusTextLive]}>{s.text}</Text>
          </View>
        )}
      </View>
    );
  }

  const header = (
    <View style={styles.header}>
      <Text style={styles.title} accessibilityRole="header">
        {t('plan.title')}
      </Text>
      {today && tomorrow && (
        <View style={styles.dayRow} accessibilityRole="radiogroup">
          <Chip label={t('plan.today')} selected={!isTomorrow} onPress={() => setDay('today')} />
          <Chip label={t('plan.tomorrow')} selected={isTomorrow} onPress={() => setDay('tomorrow')} />
        </View>
      )}
    </View>
  );

  if (!today && !tomorrow) {
    return (
      <Card style={styles.card}>
        {header}
        <Text style={styles.empty}>{t('plan.notReady')}</Text>
      </Card>
    );
  }

  return (
    <Card style={styles.card}>
      {header}

      {!plan ? (
        <Text style={styles.empty}>{t('plan.notReady')}</Text>
      ) : plan.flatDay ? (
        <Text style={styles.flat}>{t('plan.flatDay')}</Text>
      ) : showEvening ? (
        // Today is over: say so, and point to tomorrow (UI/UX Pro Max empty-states: message + action).
        <View style={styles.evening}>
          <View style={styles.eveningIcon}>
            <IconMoon size={22} color={theme.colors.accentPurpleDeep} />
          </View>
          <Text style={styles.eveningTitle}>{t('plan.allPassed')}</Text>
          <Text style={styles.eveningText}>{t(tomorrow ? 'plan.tomorrowReady' : 'plan.tomorrowLater')}</Text>
          {tomorrow && <SecondaryButton size="compact" label={t('plan.seeTomorrow')} onPress={() => setDay('tomorrow')} style={styles.eveningButton} />}
        </View>
      ) : (
        <View>
          {/* The day in one glance first; the rows are the details. */}
          {plan.text && <Text style={styles.summaryText}>{plan.text}</Text>}
          {next && renderRow(next, { first: true, hero: true })}
          {rest.map((w, i) => renderRow(w, { first: i === 0 && !next && !plan.text }))}
        </View>
      )}

      {passed.length > 0 && !plan?.flatDay && (
        <>
          <Pressable
            onPress={() => {
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              setShowPassed((v) => !v);
            }}
            style={({ pressed }) => [styles.foldRow, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityState={{ expanded: showPassed }}
            hitSlop={4}
          >
            <Text style={styles.foldLabel}>{showPassed ? t('plan.hidePassed') : t('plan.showPassed', { count: passed.length })}</Text>
            {showPassed ? (
              <IconChevronUp size={18} color={theme.colors.textSecondary} />
            ) : (
              <IconChevronDown size={18} color={theme.colors.textSecondary} />
            )}
          </Pressable>
          {showPassed && passed.map((w, i) => renderRow(w, { first: i === 0, past: true }))}
        </>
      )}

      {/* One note for the whole card: times calculated, short text by AI. */}
      {plan && !plan.flatDay && !showEvening && (
        <View style={styles.note}>
          {plan.text ? <AiNote kind="plan" /> : <Text style={styles.footnote}>{t('plan.timesNote')}</Text>}
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', rowGap: 8, marginBottom: 12 },
  title: { fontFamily: theme.typography.displayMedium, fontSize: theme.type.lg, color: theme.colors.textPrimary },
  dayRow: { flexDirection: 'row', gap: 6 },
  empty: { fontFamily: theme.typography.body, fontSize: theme.type.md, lineHeight: 22, color: theme.colors.textSecondary, marginTop: 4 },
  flat: { fontFamily: theme.typography.body, fontSize: theme.type.md, lineHeight: 22, color: theme.colors.textSecondary, marginVertical: 8 },
  summaryText: { fontFamily: theme.typography.body, fontSize: theme.type.md, lineHeight: 23, color: theme.colors.textPrimary, marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  heroRow: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 4,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.accentPurpleSoft,
  },
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
  iconHero: { backgroundColor: theme.colors.surface },
  iconAvoid: { backgroundColor: theme.colors.dangerEmberSoft },
  text: { flex: 1, marginHorizontal: 12 },
  eyebrow: { fontFamily: theme.typography.bodySemibold, fontSize: theme.type.xs, color: theme.colors.accentPurpleDeep, marginBottom: 2 },
  label: { fontFamily: theme.typography.bodyMedium, fontSize: theme.type.md, color: theme.colors.textPrimary },
  labelHero: { fontFamily: theme.typography.bodySemibold },
  meta: { fontFamily: theme.typography.body, fontSize: theme.type.sm, color: theme.colors.textSecondary, marginTop: 2, fontVariant: ['tabular-nums'] },
  hint: { fontFamily: theme.typography.body, fontSize: theme.type.sm, color: theme.colors.textSecondary, marginTop: 2 },
  status: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: theme.radius.pill, borderWidth: 1, borderColor: theme.colors.border },
  statusLive: { borderColor: theme.colors.accentPurple, backgroundColor: theme.colors.accentPurpleSoft },
  statusText: { fontFamily: theme.typography.bodyMedium, fontSize: theme.type.xs, color: theme.colors.textSecondary },
  statusTextLive: { color: theme.colors.textPrimary },
  evening: { alignItems: 'center', paddingVertical: 12, gap: 6 },
  eveningIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.accentPurpleSoft,
    marginBottom: 4,
  },
  eveningTitle: { fontFamily: theme.typography.bodySemibold, fontSize: theme.type.md, color: theme.colors.textPrimary, textAlign: 'center' },
  eveningText: { fontFamily: theme.typography.body, fontSize: theme.type.sm, lineHeight: 20, color: theme.colors.textSecondary, textAlign: 'center' },
  eveningButton: { marginTop: 8, alignSelf: 'stretch' },
  foldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderMuted,
  },
  foldLabel: { fontFamily: theme.typography.bodyMedium, fontSize: theme.type.sm, color: theme.colors.textSecondary },
  pressed: { opacity: 0.7 },
  note: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: theme.colors.borderMuted },
  footnote: { fontFamily: theme.typography.body, fontSize: theme.type.xs, color: theme.colors.textSecondary },
});
