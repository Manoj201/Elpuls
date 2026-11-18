import { useState } from 'react';
import { LayoutAnimation, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { IconChevronDown, IconChevronUp } from '@tabler/icons-react-native';
import type { Outlook, OutlookDay } from '../hooks/useOutlook';
import type { SupportedLanguage } from '../i18n';
import { DIRECTION_STYLE, directionOf, type Direction } from '../lib/outlookDirection';
import { theme } from '../theme';
import { AiNote } from './AiNote';
import { Card } from './Card';
import { OutlookChart } from './OutlookChart';

const stockholmDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Stockholm' });

const ore = (sek: number) => String(Math.max(0, Math.round(sek * 100)));

function dayLabel(dateKey: string, language: SupportedLanguage, weekday: 'short' | 'long' = 'short'): string {
  const d = new Date(`${dateKey}T12:00:00`);
  // sv-SE writes "ons 19 nov." – drop the abbreviation dots.
  const text = d.toLocaleDateString(language === 'sv' ? 'sv-SE' : 'en-GB', { weekday, day: 'numeric', month: 'short' }).replace(/\./g, '');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Folded details (UI/UX Pro Max: progressive-disclosure, content-priority). */
function Disclosure({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const Chevron = open ? IconChevronUp : IconChevronDown;
  return (
    <View style={styles.disclosure}>
      <Pressable
        onPress={() => {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          setOpen((o) => !o);
        }}
        style={({ pressed }) => [styles.disclosureRow, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        hitSlop={4}
      >
        <Text style={styles.disclosureLabel}>{label}</Text>
        {hint ? <Text style={styles.disclosureHint}>{hint}</Text> : null}
        <Chevron size={18} color={theme.colors.textSecondary} />
      </Pressable>
      {open && <View style={styles.disclosureBody}>{children}</View>}
    </View>
  );
}

/** The coming day with the lowest expected average, if it's clearly cheaper than today. */
function bestDay(days: OutlookDay[], todayAvg: number | null): OutlookDay | null {
  if (todayAvg === null) return null;
  const cheaper = days.filter((d) => directionOf(d.mid, todayAvg) === 'cheaper');
  return cheaper.length ? cheaper.reduce((a, b) => (b.mid < a.mid ? b : a)) : null;
}

function shortDay(dateKey: string, language: SupportedLanguage): string {
  const text = new Date(`${dateKey}T12:00:00`)
    .toLocaleDateString(language === 'sv' ? 'sv-SE' : 'en-GB', { weekday: 'short', day: 'numeric' })
    .replace(/\./g, '');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function weekday(dateKey: string, language: SupportedLanguage): string {
  const text = new Date(`${dateKey}T12:00:00`).toLocaleDateString(language === 'sv' ? 'sv-SE' : 'en-GB', { weekday: 'long' });
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Readable text tones for the direction words (all ≥ 9:1 on the card). */
const DIR_TEXT: Record<Direction, string> = {
  cheaper: theme.colors.positiveTealDeep,
  same: theme.colors.textSecondary,
  dearer: theme.colors.accentAmberDeep,
};

/**
 * The answer first, in one sentence (UI/UX Pro Max content-priority):
 * which day to wait for, or that today is as good as it gets.
 */
function Answer({ days, todayAvg, language }: { days: OutlookDay[]; todayAvg: number; language: SupportedLanguage }) {
  const { t } = useTranslation();
  const best = bestDay(days, todayAvg);
  let dir: Direction;
  let headline: string;
  let sub: string;
  if (best) {
    dir = 'cheaper';
    headline = t('outlook.answerCheapest', { day: weekday(best.date, language) });
    sub = t('outlook.answerCheapestSub', { ore: ore(best.mid), today: ore(todayAvg) });
  } else if (days.some((d) => directionOf(d.mid, todayAvg) === 'dearer')) {
    dir = 'dearer';
    headline = t('outlook.answerToday');
    sub = t('outlook.answerTodaySub');
  } else {
    dir = 'same';
    headline = t('outlook.answerFlat');
    sub = t('outlook.answerFlatSub');
  }
  const { Icon, color } = DIRECTION_STYLE[dir];
  // Plain text in the card, no tinted box (a box inside a card reads as a
  // nested card); the coloured arrow is the only accent.
  return (
    <View style={styles.answer} accessible accessibilityLabel={`${headline}. ${sub}`}>
      <Icon size={22} color={color} style={styles.answerIcon} />
      <View style={styles.answerText}>
        <Text style={styles.answerHeadline}>{headline}</Text>
        <Text style={styles.answerSub}>{sub}</Text>
      </View>
    </View>
  );
}

/**
 * One day compared with today, as a diverging bar (UI/UX Pro Max + dataviz:
 * difference from a reference = diverging bar from a centre line). The
 * centre line is today; a teal bar to the left = cheaper, an amber bar to the
 * right = dearer, length = how much. The price and the difference are written
 * out on the right, so colour and direction are never the only cue.
 */
function DayDiffRow({
  label,
  tag,
  tagColor,
  value,
  diff,
  maxDiff,
  dir,
  highlight,
  dimmed,
  a11y,
}: {
  label: string;
  tag: string | null;
  tagColor: string;
  value: number;
  diff: number;
  maxDiff: number;
  dir: Direction;
  highlight?: boolean;
  dimmed?: boolean;
  a11y: string;
}) {
  const { t } = useTranslation();
  const share = Math.min(1, Math.abs(diff) / maxDiff);
  const barColor = DIRECTION_STYLE[dir].color;
  const diffOre = Math.round(Math.abs(diff) * 100);
  const diffText = dir === 'same' ? t('outlook.diffSame') : `${diff < 0 ? '−' : '+'}${diffOre}`;
  return (
    <View style={[styles.dayRow, highlight && styles.bestRow]} accessible accessibilityLabel={a11y}>
      <View style={styles.dayCol}>
        <Text style={[styles.day, dimmed && styles.dimmedText]}>{label}</Text>
        {tag && <Text style={[styles.dayWord, { color: tagColor }]}>{tag}</Text>}
      </View>
      <View style={styles.divTrack}>
        <View style={styles.divHalf}>
          {diff < 0 && dir !== 'same' && (
            <View style={[styles.divBar, styles.divBarLeft, { width: `${Math.max(6, share * 100)}%`, backgroundColor: barColor }, dimmed && styles.barDimmed]} />
          )}
        </View>
        <View style={styles.divCentre} />
        <View style={styles.divHalf}>
          {diff > 0 && dir !== 'same' && (
            <View style={[styles.divBar, styles.divBarRight, { width: `${Math.max(6, share * 100)}%`, backgroundColor: barColor }, dimmed && styles.barDimmed]} />
          )}
        </View>
      </View>
      <View style={styles.valueCol}>
        <Text style={[styles.dayValue, dimmed && styles.dimmedText]}>{ore(value)}</Text>
        <Text style={[styles.diffText, { color: DIR_TEXT[dir] }, dimmed && styles.dimmedText]}>{diffText}</Text>
      </View>
    </View>
  );
}

/**
 * "Kommande dagar" (Pro). Redesigned 2026-11-18 (tester feedback: range bars
 * with a "today" tick were hard to read): one sentence answer, then today and
 * each coming day as a simple price bar with a plain word, the AI label, and
 * ranges / accuracy folded under "Om prognosen" (UI/UX Pro Max
 * content-priority, progressive-disclosure; Humanizer for the copy).
 */
export function OutlookDaysCard({ outlook, todayAvg, zone }: { outlook: Outlook; todayAvg: number | null; zone: string }) {
  const { t, i18n } = useTranslation();
  const language = i18n.language as SupportedLanguage;

  if (!outlook.show) {
    return (
      <Card style={styles.card}>
        <Text style={styles.title}>{t('outlook.daysTitle')}</Text>
        <Text style={styles.note}>{t('outlook.hidden', { zone })}</Text>
      </Card>
    );
  }

  const outOfTen = Math.round(outlook.hitRate * 10);
  const best = bestDay(outlook.days, todayAvg);
  const max = Math.max(...outlook.days.map((d) => d.mid), todayAvg ?? 0, 0.01);

  return (
    <Card style={styles.card}>
      <Text style={styles.title} accessibilityRole="header">
        {t('outlook.daysTitle')}
      </Text>

      {todayAvg !== null && <Answer days={outlook.days} todayAvg={todayAvg} language={language} />}

      {todayAvg !== null && (
        <>
          <Text style={styles.rowsCaption}>{t('outlook.comparedToday', { ore: ore(todayAvg) })}</Text>
          {/* Axis header: what the centre line and the two sides mean. */}
          <View style={styles.axisHead} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
            <View style={styles.dayCol} />
            <View style={styles.axisMid}>
              <Text style={[styles.axisSide, { color: DIR_TEXT.cheaper }]}>← {t('outlook.axisCheaper')}</Text>
              <Text style={[styles.axisSide, { color: DIR_TEXT.dearer }]}>{t('outlook.axisDearer')} →</Text>
            </View>
            <View style={styles.valueCol} />
          </View>
          {outlook.days.map((day) => {
            const dir: Direction = directionOf(day.mid, todayAvg);
            const isBest = best?.date === day.date;
            const diff = day.mid - todayAvg;
            const tag = isBest ? t('outlook.bestTag') : day.uncertain ? t('outlook.uncertainLong') : null;
            const diffWords =
              dir === 'same'
                ? t('outlook.diffSameA11y')
                : t(diff < 0 ? 'outlook.diffCheaperA11y' : 'outlook.diffDearerA11y', { ore: Math.round(Math.abs(diff) * 100) });
            return (
              <DayDiffRow
                key={day.date}
                label={shortDay(day.date, language)}
                tag={tag}
                tagColor={isBest ? DIR_TEXT.cheaper : theme.colors.textSecondary}
                value={day.mid}
                diff={diff}
                maxDiff={Math.max(...outlook.days.map((d) => Math.abs(d.mid - todayAvg)), 0.01)}
                dir={dir}
                highlight={isBest}
                dimmed={day.uncertain && !isBest}
                a11y={`${dayLabel(day.date, language, 'long')}, ${t('outlook.oreA11y', { ore: ore(day.mid) })}, ${diffWords}${tag ? `, ${tag}` : ''}`}
              />
            );
          })}
        </>
      )}

      <AiNote kind="forecast" />

      <Disclosure label={t('outlook.aboutToggle')} hint={t('outlook.aboutHint', { count: outOfTen })}>
        {outlook.text && <Text style={styles.aiText}>{outlook.text}</Text>}
        <Text style={styles.note}>{t('outlook.rangesIntro')}</Text>
        {outlook.days.map((day) => (
          <Text key={day.date} style={styles.rangeLine}>
            {shortDay(day.date, language)}: {t('outlook.range', { low: ore(day.low), high: ore(day.high) })}
          </Text>
        ))}
        <Text style={styles.note}>{t('outlook.hitRate', { count: outOfTen })}</Text>
        <Text style={styles.note}>{t('outlook.disclaimer')}</Text>
      </Disclosure>
    </Card>
  );
}

/** "Snittpris per dag" (Pro): the trend chart on its own card. */
export function OutlookChartCard({
  outlook,
  todayAvg,
  tomorrowAvg,
}: {
  outlook: Outlook;
  todayAvg: number | null;
  /** Tomorrow's real average when published (else the outlook's copy). */
  tomorrowAvg: number | null;
}) {
  const { t } = useTranslation();
  if (!outlook.show || todayAvg === null) return null;
  const now = new Date();
  const todayKey = stockholmDate.format(now);
  const tomorrowKey = stockholmDate.format(new Date(now.getTime() + 24 * 3600 * 1000));
  const tomorrowValue = tomorrowAvg ?? outlook.tomorrowAvg;
  return (
    <Card style={styles.card}>
      <Text style={styles.title} accessibilityRole="header">
        {t('outlook.chartTitle')}
      </Text>
      <Text style={styles.subtitle}>{t('outlook.chartSubtitle')}</Text>
      <View style={styles.chart}>
        <OutlookChart
          recent={outlook.recent}
          today={{ date: todayKey, avg: todayAvg }}
          tomorrow={tomorrowValue !== null ? { date: tomorrowKey, avg: tomorrowValue } : null}
          days={outlook.days}
        />
      </View>
      <AiNote kind="forecastShort" />
    </Card>
  );
}

const monthDirection = (change: number): Direction => (change <= -0.1 ? 'cheaper' : change >= 0.1 ? 'dearer' : 'same');
const roundPct = (change: number) => Math.round(Math.abs(change) * 10) * 10; // nearest 10 %: it's a rough pattern

/** The three month tiles (name, arrow, big %, word). */
function MonthTiles({ seasonal }: { seasonal: Outlook['seasonal'] }) {
  const { t, i18n } = useTranslation();
  const locale = (i18n.language as SupportedLanguage) === 'sv' ? 'sv-SE' : 'en-GB';
  const monthName = (key: string) => new Date(`${key}-15T12:00:00`).toLocaleDateString(locale, { month: 'long' });
  const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  return (
      <View style={styles.monthTiles}>
        {seasonal.map((m) => {
          const dir = monthDirection(m.change);
          const { Icon, color, soft } = DIRECTION_STYLE[dir];
          const name = capital(monthName(m.month));
          const pct = roundPct(m.change);
          const big = dir === 'same' ? t('outlook.monthTileSame') : `${dir === 'dearer' ? '+' : '−'}${pct} %`;
          const word = t(`outlook.monthTileWord.${dir}`);
          const a11y = dir === 'same' ? t('outlook.monthSame') : t(`outlook.month.${dir}`, { pct });
          return (
            <View key={m.month} style={[styles.monthTile, { backgroundColor: soft }]} accessible accessibilityLabel={`${name}, ${a11y}`}>
              <Text style={styles.monthName} numberOfLines={1}>
                {name}
              </Text>
              <Icon size={22} color={color} style={styles.monthIcon} />
              <Text style={styles.monthBig} numberOfLines={1} adjustsFontSizeToFit>
                {big}
              </Text>
              <Text style={styles.monthWord} numberOfLines={1}>
                {word}
              </Text>
            </View>
          );
        })}
      </View>
  );
}

/**
 * "Kommande månader" (Pro): three month tiles (arrow + big % + word) instead
 * of sentences, and one line saying what they're compared with.
 */
export function SeasonalCard({ outlook }: { outlook: Outlook }) {
  const { t, i18n } = useTranslation();
  const language = i18n.language as SupportedLanguage;
  if (outlook.seasonal.length === 0) return null;
  const locale = language === 'sv' ? 'sv-SE' : 'en-GB';
  const thisMonth = new Date().toLocaleDateString(locale, { month: 'long' });
  const years = Math.max(...outlook.seasonal.map((m) => m.years));

  return (
    <Card style={styles.card}>
      <Text style={styles.title} accessibilityRole="header">
        {t('outlook.monthsTitle')}
      </Text>
      <MonthTiles seasonal={outlook.seasonal} />
      <Text style={styles.note}>{t('outlook.monthsBasis', { count: years, month: thisMonth })}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontFamily: theme.typography.displayMedium, fontSize: theme.type.lg, color: theme.colors.textPrimary },

  answer: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 10 },
  answerIcon: { marginTop: 2 },
  answerText: { flex: 1, gap: 4 },
  answerHeadline: { fontFamily: theme.typography.displayMedium, fontSize: theme.type.lg, lineHeight: 24, color: theme.colors.textPrimary },
  answerSub: { fontFamily: theme.typography.body, fontSize: theme.type.sm, lineHeight: 20, color: theme.colors.textSecondary },
  chart: { marginTop: 12 },
  subtitle: { fontFamily: theme.typography.body, fontSize: theme.type.sm, lineHeight: 20, color: theme.colors.textSecondary, marginTop: 2 },
  rowsCaption: {
    fontFamily: theme.typography.body,
    fontSize: theme.type.sm,
    color: theme.colors.textSecondary,
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderMuted,
  },
  axisHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 10,
  },
  axisMid: { flex: 1, flexDirection: 'row', justifyContent: 'space-around' },
  axisSide: { fontFamily: theme.typography.bodyMedium, fontSize: theme.type.xs },
  divTrack: { flex: 1, flexDirection: 'row', alignItems: 'center', height: 24 },
  divHalf: { flex: 1, height: 12, justifyContent: 'center' },
  divCentre: { width: 2, height: 24, borderRadius: 1, backgroundColor: theme.colors.textPrimary, opacity: 0.6 },
  divBar: { position: 'absolute', height: 12, top: 0 },
  divBarLeft: { right: 2, borderTopLeftRadius: 6, borderBottomLeftRadius: 6 },
  divBarRight: { left: 2, borderTopRightRadius: 6, borderBottomRightRadius: 6 },
  valueCol: { width: 48, alignItems: 'flex-end' },
  diffText: { fontFamily: theme.typography.bodyMedium, fontSize: theme.type.xs, fontVariant: ['tabular-nums'], marginTop: 1 },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingVertical: 6 },
  bestRow: { backgroundColor: theme.colors.positiveTealSoft, borderRadius: 12, marginHorizontal: -8, paddingHorizontal: 8 },
  dayCol: { width: 96 },
  day: { fontFamily: theme.typography.bodyMedium, fontSize: theme.type.md, color: theme.colors.textPrimary },
  dayWord: { fontFamily: theme.typography.bodyMedium, fontSize: theme.type.xs, marginTop: 2 },
  barTrack: { flex: 1, height: 10, borderRadius: 5, backgroundColor: theme.colors.surfaceElevated, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 5 },
  barDimmed: { opacity: 0.55 },
  dayValue: { textAlign: 'right', fontFamily: theme.typography.bodySemibold, fontSize: theme.type.md, color: theme.colors.textPrimary, fontVariant: ['tabular-nums'] },
  dimmedText: { color: theme.colors.textSecondary },
  rangeLine: { fontFamily: theme.typography.body, fontSize: theme.type.sm, lineHeight: 20, color: theme.colors.textSecondary, fontVariant: ['tabular-nums'] },

  disclosure: { marginTop: 4, borderTopWidth: 1, borderTopColor: theme.colors.borderMuted },
  disclosureRow: { flexDirection: 'row', alignItems: 'center', minHeight: 48, paddingTop: 4 },
  pressed: { opacity: 0.6 },
  disclosureLabel: { fontFamily: theme.typography.bodyMedium, fontSize: theme.type.sm, color: theme.colors.textPrimary },
  disclosureHint: { flex: 1, marginLeft: 8, fontFamily: theme.typography.body, fontSize: theme.type.sm, color: theme.colors.textSecondary },
  disclosureBody: { paddingBottom: 4 },
  aiText: { fontFamily: theme.typography.body, fontSize: theme.type.md, lineHeight: 22, color: theme.colors.textPrimary },
  note: { fontFamily: theme.typography.body, fontSize: theme.type.sm, lineHeight: 20, color: theme.colors.textSecondary, marginTop: 8 },

  monthTiles: { flexDirection: 'row', columnGap: 8, marginTop: 12 },
  monthTile: { flex: 1, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 8, alignItems: 'center' },
  monthName: { fontFamily: theme.typography.bodyMedium, fontSize: theme.type.sm, color: theme.colors.textPrimary },
  monthIcon: { marginTop: 8 },
  monthBig: { fontFamily: theme.typography.displayMedium, fontSize: theme.type.xl, color: theme.colors.textPrimary, marginTop: 4, fontVariant: ['tabular-nums'] },
  monthWord: { fontFamily: theme.typography.body, fontSize: theme.type.xs, color: theme.colors.textSecondary, marginTop: 2 },
});
