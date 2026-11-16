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
import { Chip } from './Chip';
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

/**
 * The answer as a tile, not a paragraph (dataviz: a single headline is a stat
 * tile). Cheapest coming day if one is clearly cheaper than today; otherwise
 * whether the week looks dearer or flat.
 */
function SummaryTile({ days, todayAvg, language }: { days: OutlookDay[]; todayAvg: number; language: SupportedLanguage }) {
  const { t } = useTranslation();
  const dirs = days.map((d) => directionOf(d.mid, todayAvg));
  const cheaper = days.filter((_, i) => dirs[i] === 'cheaper');

  let dir: Direction;
  let label: string;
  let value: string;
  let detail: string | null = null;
  if (cheaper.length > 0) {
    const best = cheaper.reduce((a, b) => (b.mid < a.mid ? b : a));
    dir = 'cheaper';
    label = t('outlook.tileCheapest');
    value = dayLabel(best.date, language, 'long');
    detail = t('outlook.range', { low: ore(best.low), high: ore(best.high) });
  } else if (dirs.some((d) => d === 'dearer')) {
    dir = 'dearer';
    label = t('outlook.tileNoCheaper');
    value = t('outlook.tileUseToday');
  } else {
    dir = 'same';
    label = t('outlook.tileFlat');
    value = t('outlook.tileFlatValue');
  }
  const { Icon, color, soft } = DIRECTION_STYLE[dir];
  return (
    <View style={[styles.tile, { backgroundColor: soft }]} accessible accessibilityLabel={[label, value, detail].filter(Boolean).join(', ')}>
      <View style={[styles.tileIcon, { borderColor: color }]}>
        <Icon size={20} color={color} />
      </View>
      <View style={styles.tileText}>
        <Text style={styles.tileLabel}>{label}</Text>
        <Text style={styles.tileValue}>{value}</Text>
      </View>
      {detail && <Text style={styles.tileDetail}>{detail}</Text>}
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

/**
 * One day as a range bar on a scale shared by all rows (the weather-app
 * 10-day pattern): low number, bar from low to high in the direction colour,
 * high number, and a white tick at today's average. Arrow icon + the
 * screen-reader label carry the direction too, so it's never colour alone.
 */
function DayRangeRow({
  day,
  dir,
  scale,
  todayAvg,
  isBest,
  first,
  language,
}: {
  day: OutlookDay;
  dir: Direction;
  scale: { min: number; max: number };
  todayAvg: number | null;
  isBest: boolean;
  first: boolean;
  language: SupportedLanguage;
}) {
  const { t } = useTranslation();
  const { Icon, color } = DIRECTION_STYLE[dir];
  const span = scale.max - scale.min || 1;
  const pos = (v: number) => `${Math.max(0, Math.min(100, ((v - scale.min) / span) * 100))}%` as const;
  const barLeft = (day.low - scale.min) / span;
  const barWidth = Math.max(0.04, (day.high - day.low) / span);
  const range = t('outlook.range', { low: ore(day.low), high: ore(day.high) });
  return (
    <View
      style={[styles.row, !first && !isBest && styles.divider, isBest && styles.bestRow]}
      accessible
      accessibilityLabel={`${dayLabel(day.date, language, 'long')}, ${t(`outlook.dir.${dir}`)}, ${range}${isBest ? `, ${t('outlook.bestTag')}` : ''}${day.uncertain ? `, ${t('outlook.uncertain')}` : ''}`}
    >
      <View style={styles.dayCol}>
        <Text style={[styles.day, day.uncertain && styles.dimmedText]}>{shortDay(day.date, language)}</Text>
        {isBest ? (
          <Text style={styles.bestTag}>{t('outlook.bestTag')}</Text>
        ) : day.uncertain ? (
          <Text style={styles.uncertain}>{t('outlook.uncertain')}</Text>
        ) : null}
      </View>
      <Icon size={18} color={color} style={day.uncertain ? styles.dimmedBox : undefined} />
      <Text style={[styles.rangeNum, styles.rangeLow, day.uncertain && styles.dimmedText]}>{ore(day.low)}</Text>
      <View style={styles.track}>
        <View
          style={[
            styles.trackBar,
            { left: `${barLeft * 100}%`, width: `${Math.min(barWidth, 1 - barLeft) * 100}%`, backgroundColor: color },
            day.uncertain && styles.trackBarUncertain,
          ]}
        />
        {todayAvg !== null && <View style={[styles.todayTick, { left: pos(todayAvg) }]} />}
      </View>
      <Text style={[styles.rangeNum, styles.rangeHigh, day.uncertain && styles.dimmedText]}>{ore(day.high)}</Text>
    </View>
  );
}

/**
 * "Kommande dagar" (Pro), the decision card: summary tile, one range-bar row
 * per day (best day highlighted), the AI label, and the trust details folded
 * under "Om prognosen" (UI/UX Pro Max content-priority, progressive-disclosure).
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
  const values = outlook.days.flatMap((d) => [d.low, d.high]).concat(todayAvg !== null ? [todayAvg] : []);
  const scale = { min: Math.max(0, Math.min(...values)), max: Math.max(...values) };

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">
          {t('outlook.daysTitle')}
        </Text>
        <Chip label={t('outlook.forecastTag')} variant="neutral" />
      </View>

      {todayAvg !== null && <SummaryTile days={outlook.days} todayAvg={todayAvg} language={language} />}

      {/* Scale caption: what the numbers and the white tick are. */}
      <View style={styles.caption} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <Text style={styles.captionText}>{t('outlook.rowsCaption')}</Text>
        {todayAvg !== null && (
          <View style={styles.captionToday}>
            <View style={styles.captionTick} />
            <Text style={styles.captionText}>{t('outlook.todayTick', { ore: ore(todayAvg) })}</Text>
          </View>
        )}
      </View>
      <View>
        {outlook.days.map((day, i) => (
          <DayRangeRow
            key={day.date}
            day={day}
            dir={todayAvg !== null ? directionOf(day.mid, todayAvg) : 'same'}
            scale={scale}
            todayAvg={todayAvg}
            isBest={best?.date === day.date}
            first={i === 0}
            language={language}
          />
        ))}
      </View>

      <AiNote kind="forecast" />

      <Disclosure label={t('outlook.aboutToggle')} hint={t('outlook.aboutHint', { count: outOfTen })}>
        {outlook.text && <Text style={styles.aiText}>{outlook.text}</Text>}
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

  tile: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, padding: 12, marginTop: 12 },
  tileIcon: { width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  tileText: { flex: 1, marginLeft: 12 },
  tileLabel: { fontFamily: theme.typography.bodyMedium, fontSize: theme.type.xs, color: theme.colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  tileValue: { fontFamily: theme.typography.displayMedium, fontSize: theme.type.lg, color: theme.colors.textPrimary, marginTop: 2 },
  tileDetail: { fontFamily: theme.typography.bodyMedium, fontSize: theme.type.sm, color: theme.colors.textPrimary, fontVariant: ['tabular-nums'], marginLeft: 8 },

  chart: { marginTop: 12 },
  subtitle: { fontFamily: theme.typography.body, fontSize: theme.type.sm, lineHeight: 20, color: theme.colors.textSecondary, marginTop: 2 },
  bestRow: { backgroundColor: theme.colors.positiveTealSoft, borderRadius: 12, marginHorizontal: -8, paddingHorizontal: 8 },
  bestTag: { fontFamily: theme.typography.bodyMedium, fontSize: theme.type.xs, color: theme.colors.positiveTealDeep, marginTop: 1 },
  caption: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, marginBottom: 2 },
  captionText: { fontFamily: theme.typography.body, fontSize: theme.type.xs, color: theme.colors.textSecondary },
  captionToday: { flexDirection: 'row', alignItems: 'center' },
  captionTick: { width: 2, height: 12, borderRadius: 1, backgroundColor: theme.colors.textPrimary, marginRight: 6 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, minHeight: 48 },
  rangeNum: { width: 32, fontFamily: theme.typography.bodyMedium, fontSize: theme.type.sm, color: theme.colors.textPrimary, fontVariant: ['tabular-nums'] },
  rangeLow: { textAlign: 'right', marginLeft: 6 },
  rangeHigh: { textAlign: 'left' },
  track: { flex: 1, height: 6, borderRadius: 3, backgroundColor: theme.colors.surfaceElevated, marginHorizontal: 8, justifyContent: 'center' },
  trackBar: { position: 'absolute', top: 0, bottom: 0, borderRadius: 3 },
  trackBarUncertain: { opacity: 0.55 },
  todayTick: { position: 'absolute', width: 2, height: 14, marginLeft: -1, borderRadius: 1, backgroundColor: theme.colors.textPrimary },
  divider: { borderTopWidth: 1, borderTopColor: theme.colors.borderMuted },
  dayCol: { width: 84 },
  day: { fontFamily: theme.typography.bodyMedium, fontSize: theme.type.md, color: theme.colors.textPrimary },
  uncertain: { fontFamily: theme.typography.body, fontSize: theme.type.xs, color: theme.colors.textSecondary, marginTop: 1 },
  dimmedText: { color: theme.colors.textSecondary },
  dimmedBox: { opacity: 0.75 },

  disclosure: { marginTop: 4, borderTopWidth: 1, borderTopColor: theme.colors.borderMuted },
  disclosureRow: { flexDirection: 'row', alignItems: 'center', minHeight: 48, paddingTop: 4 },
  pressed: { opacity: 0.6 },
  disclosureLabel: { fontFamily: theme.typography.bodyMedium, fontSize: theme.type.sm, color: theme.colors.textPrimary },
  disclosureHint: { flex: 1, marginLeft: 8, fontFamily: theme.typography.body, fontSize: theme.type.sm, color: theme.colors.textSecondary },
  disclosureBody: { paddingBottom: 4 },
  aiText: { fontFamily: theme.typography.body, fontSize: theme.type.md, lineHeight: 22, color: theme.colors.textPrimary },
  note: { fontFamily: theme.typography.body, fontSize: theme.type.sm, lineHeight: 20, color: theme.colors.textSecondary, marginTop: 8 },

  monthTiles: { flexDirection: 'row', columnGap: 8, marginTop: 12 },
  previewRows: { marginTop: 8 },
  monthTile: { flex: 1, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 8, alignItems: 'center' },
  monthName: { fontFamily: theme.typography.bodyMedium, fontSize: theme.type.sm, color: theme.colors.textPrimary },
  monthIcon: { marginTop: 8 },
  monthBig: { fontFamily: theme.typography.displayMedium, fontSize: theme.type.xl, color: theme.colors.textPrimary, marginTop: 4, fontVariant: ['tabular-nums'] },
  monthWord: { fontFamily: theme.typography.body, fontSize: theme.type.xs, color: theme.colors.textSecondary, marginTop: 2 },
});

/**
 * Example data for the Pro teasers: dates are the real coming days and months,
 * prices are made up (the teaser box is labelled "Exempel").
 */
function sampleOutlook(): { outlook: Outlook; todayAvg: number } {
  const now = new Date();
  const key = (offset: number) => stockholmDate.format(new Date(now.getTime() + offset * 24 * 3600 * 1000));
  const month = (offset: number) => {
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 15);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  };
  const day = (offset: number, mid: number, spread: number, uncertain = false): OutlookDay => ({
    date: key(offset),
    mid,
    low: mid - spread,
    high: mid + spread,
    uncertain,
  });
  return {
    todayAvg: 0.85,
    outlook: {
      recent: [
        { date: key(-3), avg: 0.92 },
        { date: key(-2), avg: 0.78 },
        { date: key(-1), avg: 0.8 },
      ],
      tomorrowAvg: 0.9,
      days: [day(2, 0.6, 0.15), day(3, 0.82, 0.18), day(4, 1.1, 0.25), day(5, 1.0, 0.25), day(6, 0.75, 0.3, true), day(7, 0.9, 0.32, true)],
      seasonal: [
        { month: month(1), change: 0.2, years: 3 },
        { month: month(2), change: 0.3, years: 3 },
        { month: month(3), change: 0.0, years: 3 },
      ],
      show: true,
      hitRate: 0.7,
      text: null,
    },
  };
}

/** Teaser preview for "Kommande dagar": the summary tile and three range-bar rows. */
export function OutlookDaysPreview() {
  const { i18n } = useTranslation();
  const language = i18n.language as SupportedLanguage;
  const { outlook, todayAvg } = sampleOutlook();
  const days = outlook.days.slice(0, 3);
  const values = outlook.days.flatMap((d) => [d.low, d.high]).concat(todayAvg);
  const scale = { min: Math.min(...values), max: Math.max(...values) };
  const best = bestDay(outlook.days, todayAvg);
  return (
    <View>
      <SummaryTile days={outlook.days} todayAvg={todayAvg} language={language} />
      <View style={styles.previewRows}>
        {days.map((d, i) => (
          <DayRangeRow
            key={d.date}
            day={d}
            dir={directionOf(d.mid, todayAvg)}
            scale={scale}
            todayAvg={todayAvg}
            isBest={best?.date === d.date}
            first={i === 0}
            language={language}
          />
        ))}
      </View>
    </View>
  );
}

/** Teaser preview for "Snittpris per dag": the real chart with example data. */
export function OutlookChartPreview() {
  const { outlook, todayAvg } = sampleOutlook();
  const now = new Date();
  return (
    <OutlookChart
      recent={outlook.recent}
      today={{ date: stockholmDate.format(now), avg: todayAvg }}
      tomorrow={{ date: stockholmDate.format(new Date(now.getTime() + 24 * 3600 * 1000)), avg: outlook.tomorrowAvg as number }}
      days={outlook.days}
    />
  );
}

/** Teaser preview for "Kommande månader": the month tiles with example changes. */
export function SeasonalPreview() {
  return <MonthTiles seasonal={sampleOutlook().outlook.seasonal} />;
}
