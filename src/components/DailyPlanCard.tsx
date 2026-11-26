import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { Alert, LayoutAnimation, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  IconBolt,
  IconCalendarCheck,
  IconCalendarPlus,
  IconChevronDown,
  IconChevronUp,
  IconFlame,
  IconHandStop,
  IconMoon,
  IconTemperatureMinus,
} from '@tabler/icons-react-native';
import { formatClock } from '../lib/formatNumber';
import { addPlanEventToCalendar, calendarAvailable } from '../lib/planCalendar';
import { useUiStore } from '../stores/useUiStore';
import { APPLIANCE_ICONS } from '../lib/applianceDisplay';
import { householdActivities, planDayKey, planRows } from '../lib/planRows';
import type { LiveResult, LiveRow } from '../lib/liveBestTimes';
import type { DailyPlan, PlanActivity } from '../hooks/useDailyPlan';
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
  /** Live "best time from now" appliance rows (src/lib/liveBestTimes.ts), today and tomorrow. */
  appliancesToday: LiveResult;
  appliancesTomorrow: LiveResult;
  labelOfAppliance: (r: LiveRow) => string;
}

/** One row in the card: a heating/avoid window from the server plan or a live appliance time. */
interface Row {
  key: string;
  kind: string;
  label: string;
  start: Date;
  end: Date;
  averagePrice: number;
  night: boolean;
}

/** Rows taken from the server plan; appliance times come from the live calculation. */
const SERVER_ACTIVITIES = new Set<PlanActivity>(['heatBank', 'heatCoast', 'avoid']);

const ICONS: Record<string, IconType> = {
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
 *
 * Layout (UI/UX Pro Max content-priority, progressive-disclosure,
 * empty-states): the summary first (the day in one glance), the next thing
 * to do as a highlighted row, the rest of the day below, passed times folded
 * away. When today is over, a clear evening state points to tomorrow, and
 * the card opens on tomorrow by itself once per evening.
 */
export function DailyPlanCard({
  today,
  tomorrow,
  now,
  hasEv,
  heatingType,
  disabledDefaults,
  registeredLabels,
  appliancesToday,
  appliancesTomorrow,
  labelOfAppliance,
}: DailyPlanCardProps) {
  const { t, i18n } = useTranslation();
  const language = i18n.language as SupportedLanguage;

  const mine = useMemo(
    () => householdActivities({ hasEv, heatingType, disabledDefaults, registeredLabels }),
    [hasEv, disabledDefaults, registeredLabels, heatingType],
  );

  /**
   * Rows: heating and "avoid" from the server plan (calculated with the AI
   * text when the day's prices came out); appliance times from the live
   * "best time from now" calculation (src/lib/liveBestTimes.ts), the same one
   * the Best times card uses, so the two always agree. Times after 21:00 (or
   * after midnight) go under "Tonight".
   */
  const build = (plan: DailyPlan | null, live: LiveResult, dayKey: string) => {
    const [y, m, d] = dayKey.split('-').map(Number);
    const nightFrom = new Date(y, m - 1, d, 21, 0, 0, 0).getTime();
    const server: Row[] = planRows(plan, mine)
      .day.filter((w) => SERVER_ACTIVITIES.has(w.activity))
      .map((w) => ({ key: `${w.activity}${w.start.toISOString()}`, kind: w.activity, label: t(`plan.activity.${w.activity}`), start: w.start, end: w.end, averagePrice: w.averagePrice, night: false }));
    const appliances: Row[] = live.rows
      .filter((r): r is LiveRow & { start: Date; end: Date } => r.start !== null && r.end !== null)
      .map((r) => ({
        key: `${r.id}${r.start.toISOString()}`,
        kind: r.kind,
        label: labelOfAppliance(r),
        start: r.start,
        end: r.end,
        averagePrice: 0,
        night: r.start.getTime() >= nightFrom,
      }));
    const pending = live.rows.filter((r) => r.pendingNight).map((r) => ({ key: `${r.id}-pending`, kind: r.kind, label: labelOfAppliance(r) }));
    return { day: [...server, ...appliances.filter((r) => !r.night)], night: appliances.filter((r) => r.night), pending, nightPending: live.nightPending };
  };
  const todayParts = useMemo(() => build(today, appliancesToday, planDayKey(now)), [today, appliancesToday, now, mine, labelOfAppliance, t]);
  const tomorrowParts = useMemo(() => build(tomorrow, appliancesTomorrow, planDayKey(now, 1)), [tomorrow, appliancesTomorrow, now, mine, labelOfAppliance, t]);
  // A plan day runs 06:00 → 06:00, so today is only over once tonight's
  // times are known and have passed too. Judged on this home's rows only.
  const todayAll = [...todayParts.day, ...todayParts.night];
  const todayOver = today !== null && !todayParts.nightPending && todayParts.pending.length === 0 && todayAll.length > 0 && todayAll.every((w) => now >= w.end);

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
  const calendarAdded = useUiStore((st) => st.calendarAdded);
  const markCalendarAdded = useUiStore((st) => st.markCalendarAdded);

  /**
   * "Lägg till i kalendern" (Pro): opens the phone's own New event sheet,
   * filled in. Never automatic, never reads the calendar, never controls a
   * device (§2): a reminder the phone keeps even with Elpuls closed.
   */
  async function addToCalendar(w: Row) {
    const range = `${formatClock(w.start)}–${formatClock(w.end)}`;
    try {
      const result = await addPlanEventToCalendar({
        title: t('calendar.title', { label: w.label }),
        notes: `${w.night ? `${t('calendar.notesNight')}\n\n` : ''}${t('calendar.notes', { range })}`,
        start: w.start,
        end: w.end,
        night: w.night,
      });
      if (result === 'saved') markCalendarAdded(w.key);
      else if (result === 'noPermission') Alert.alert(t('calendar.noPermissionTitle'), t('calendar.noPermissionText'));
    } catch {
      Alert.alert(t('calendar.failedTitle'), t('calendar.failedText'));
    }
  }

  const isTomorrow = day === 'tomorrow' && tomorrow !== null;
  const plan = isTomorrow ? tomorrow : today;
  const parts = isTomorrow ? tomorrowParts : todayParts;
  const rows = [...parts.day, ...parts.night];
  // "Avoid" is a warning, not a task: shown as one amber line above the
  // tasks (while it's running or still ahead), never as a row with a "Now"
  // pill next to a task's "Now" (UI/UX Pro Max: one primary status per card).
  const avoid = rows.find((w) => w.kind === 'avoid') ?? null;
  const showAvoid = avoid !== null && (isTomorrow || now < avoid.end);
  const avoidLive = avoid !== null && !isTomorrow && now >= avoid.start && now < avoid.end;
  const tasks = rows.filter((w) => w.kind !== 'avoid');
  const isUpcoming = (w: Row) => isTomorrow || now < w.end;
  const upcoming = tasks.filter(isUpcoming).sort((a, b) => a.start.getTime() - b.start.getTime());
  const passed = isTomorrow ? [] : tasks.filter((w) => !isUpcoming(w));
  const next = isTomorrow ? null : upcoming[0] ?? null;
  const dayRest = parts.day.filter((w) => w.kind !== 'avoid' && isUpcoming(w) && w !== next).sort((a, b) => a.start.getTime() - b.start.getTime());
  const nightRest = parts.night.filter((w) => isUpcoming(w) && w !== next);
  const showEvening = !isTomorrow && today !== null && !today.flatDay && todayOver;

  const ore = (sekPerKwh: number) => Math.round(sekPerKwh * 100).toLocaleString(language === 'sv' ? 'sv-SE' : 'en-US');

  function status(w: Row): { text: string; live: boolean } | null {
    if (isTomorrow) return null;
    if (now >= w.end) return { text: t('plan.statusPast'), live: false };
    if (now >= w.start) return { text: t('plan.statusNow'), live: true };
    const hours = Math.round((w.start.getTime() - now.getTime()) / 3600000);
    return { text: hours < 1 ? t('plan.statusSoon') : t('plan.statusIn', { count: hours }), live: false };
  }

  function renderRow(w: Row, opts: { first: boolean; hero?: boolean; past?: boolean }) {
    const Icon = ICONS[w.kind] ?? APPLIANCE_ICONS[w.kind] ?? IconBolt;
    const s = status(w);
    const range = `${formatClock(w.start)}–${formatClock(w.end)}`;
    const isAvoid = w.kind === 'avoid';
    // Tonight's rows: say to set a delayed start in the evening.
    const night = !opts.past && w.night;
    return (
      <View key={w.key} style={[styles.row, opts.hero && styles.heroRow, !opts.first && !opts.hero && styles.divider, opts.past && styles.past]}>
        <View style={[styles.icon, opts.hero && styles.iconHero, isAvoid && styles.iconAvoid]}>
          <Icon size={20} color={isAvoid ? theme.colors.dangerEmberDeep : theme.colors.accentPurpleDeep} />
        </View>
        <View style={styles.text}>
          {/* The row's facts are one screen-reader element; the calendar link below stays its own button. */}
          <View accessible accessibilityLabel={`${opts.hero ? `${t('plan.next')}: ` : ''}${w.label}, ${range}${s ? `, ${s.text}` : ''}`}>
            {opts.hero && <Text style={styles.eyebrow}>{t('plan.next')}</Text>}
            <Text style={[styles.label, opts.hero && styles.labelHero]}>{w.label}</Text>
            <Text style={styles.meta}>
              {range}
              {isAvoid ? ` · ${t('plan.avoidPrice', { price: ore(w.averagePrice) })}` : ''}
            </Text>
            {night && <Text style={styles.hint}>{t('plan.nightHint')}</Text>}
            {w.kind === 'heatCoast' && !opts.past && <Text style={styles.hint}>{t('plan.coastHint')}</Text>}
          </View>
          {/*
            Calendar: a quiet labelled link under the time (UI/UX Pro Max primary-action:
            secondary actions stay subordinate; text + icon, not an unlabelled icon;
            44 pt tap height). The right side keeps only the status pill.
          */}
          {calendarAvailable && !opts.past && !isAvoid && (
            calendarAdded[w.key] ? (
              <View style={styles.calLink} accessible accessibilityLabel={t('calendar.added')}>
                <IconCalendarCheck size={16} color={theme.colors.positiveTealDeep} />
                <Text style={[styles.calText, styles.calTextDone]}>{t('calendar.addedShort')}</Text>
              </View>
            ) : (
              <Pressable
                onPress={() => addToCalendar(w)}
                style={({ pressed }) => [styles.calLink, pressed && styles.pressed]}
                hitSlop={{ top: 8, bottom: 8, left: 4, right: 12 }}
                accessibilityRole="button"
                accessibilityLabel={t('calendar.add', { label: w.label, range })}
              >
                <IconCalendarPlus size={16} color={theme.colors.accentPurpleDeep} />
                <Text style={styles.calText}>{t('calendar.addShort')}</Text>
              </Pressable>
            )
          )}
        </View>
        {s && !opts.past && (
          <View style={[styles.status, (s.live || opts.hero) && styles.statusLive]}>
            <Text style={[styles.statusText, (s.live || opts.hero) && styles.statusTextLive]}>{s.text}</Text>
          </View>
        )}
      </View>
    );
  }

  /** A night appliance whose time comes with tomorrow's prices (~13:00). */
  function renderPending(p: { key: string; kind: string; label: string }, first: boolean) {
    const Icon = APPLIANCE_ICONS[p.kind] ?? IconBolt;
    return (
      <View key={p.key} style={[styles.row, !first && styles.divider]} accessible accessibilityLabel={`${p.label}, ${t('chart.bestTimesPendingRow')}`}>
        <View style={styles.icon}>
          <Icon size={20} color={theme.colors.accentPurpleDeep} />
        </View>
        <View style={styles.text}>
          <Text style={styles.label}>{p.label}</Text>
          <Text style={styles.meta}>{t('chart.bestTimesPendingRow')}</Text>
        </View>
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
          {showAvoid && avoid && (
            <View
              style={[styles.avoid, avoidLive && styles.avoidLive]}
              accessible
              accessibilityLabel={`${avoidLive ? t('plan.avoidNow', { end: formatClock(avoid.end) }) : t('plan.avoidAt', { start: formatClock(avoid.start), end: formatClock(avoid.end) })}. ${t('plan.avoidPrice', { price: ore(avoid.averagePrice) })}. ${t('plan.avoidHint')}`}
            >
              <View style={styles.avoidIcon}>
                <IconHandStop size={18} color={theme.colors.accentAmberDeep} />
              </View>
              <View style={styles.text}>
                <Text style={styles.avoidTitle}>
                  {avoidLive
                    ? t('plan.avoidNow', { end: formatClock(avoid.end) })
                    : t('plan.avoidAt', { start: formatClock(avoid.start), end: formatClock(avoid.end) })}
                </Text>
                <Text style={styles.avoidText}>
                  {t('plan.avoidPrice', { price: ore(avoid.averagePrice) })} · {t('plan.avoidHint')}
                </Text>
              </View>
            </View>
          )}
          {next && renderRow(next, { first: true, hero: true })}
          {dayRest.map((w, i) => renderRow(w, { first: i === 0 && !next && !plan.text }))}

          {/* Tonight (21:00 → 06:00): its own heading, so night times are never mistaken for today's. */}
          {(nightRest.length > 0 || parts.pending.length > 0) && (
            <Text style={styles.nightHeading} accessibilityRole="header">
              {t(isTomorrow ? 'plan.nightHeadingTomorrow' : 'plan.nightHeading')}
            </Text>
          )}
          {nightRest.map((w, i) => renderRow(w, { first: i === 0 }))}
          {parts.pending.map((p, i) => renderPending(p, i === 0 && nightRest.length === 0))}
          {parts.nightPending && (
            <Text style={styles.nightPending}>{t(isTomorrow ? 'plan.nightPendingTomorrow' : 'plan.nightPending')}</Text>
          )}
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
  nightHeading: {
    marginTop: 14,
    marginBottom: 2,
    fontFamily: theme.typography.bodySemibold,
    fontSize: theme.type.sm,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: theme.colors.accentPurpleDeep,
  },
  nightPending: { fontFamily: theme.typography.body, fontSize: theme.type.sm, lineHeight: 20, color: theme.colors.textSecondary, marginTop: 6 },
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
  avoid: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 10,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.accentAmberSoft,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  avoidLive: { borderColor: theme.colors.accentAmber },
  avoidIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
  },
  avoidTitle: { fontFamily: theme.typography.bodySemibold, fontSize: theme.type.md, color: theme.colors.accentAmberDeep },
  avoidText: { fontFamily: theme.typography.body, fontSize: theme.type.sm, lineHeight: 20, color: theme.colors.textSecondary, marginTop: 2 },
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
  calLink: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', columnGap: 6, marginTop: 6, minHeight: 28 },
  calText: { fontFamily: theme.typography.bodyMedium, fontSize: theme.type.sm, color: theme.colors.accentPurpleDeep },
  calTextDone: { color: theme.colors.positiveTealDeep },
  note: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: theme.colors.borderMuted },
  footnote: { fontFamily: theme.typography.body, fontSize: theme.type.xs, color: theme.colors.textSecondary },
});
