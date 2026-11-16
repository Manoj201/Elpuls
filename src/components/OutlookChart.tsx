import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import { useTranslation } from 'react-i18next';
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import type { OutlookDay } from '../hooks/useOutlook';
import type { SupportedLanguage } from '../i18n';
import { DIRECTION_STYLE, directionOf } from '../lib/outlookDirection';
import { theme } from '../theme';

interface OutlookChartProps {
  recent: { date: string; avg: number }[];
  today: { date: string; avg: number };
  tomorrow: { date: string; avg: number } | null;
  days: OutlookDay[];
}

type Point =
  | { kind: 'actual'; date: string; value: number }
  | { kind: 'forecast'; date: string; value: number; low: number; high: number; uncertain: boolean; day: OutlookDay };

const HEIGHT = 170;
const TOP = 26;
const BOTTOM = 26;
const SIDE = 14;
// Forecast line and likely-range band in brand purple (not a price colour);
// each forecast point is filled with its direction vs today (teal / grey /
// amber, the 48 h chart's scale). Known prices are a quieter grey line, so
// "today" (white) is the anchor the eye compares against.
const FORECAST = theme.colors.accentPurpleDeep;
/** Past days shown before today: enough context, the card is about the days ahead. */
const RECENT_DAYS = 3;
/** Minimum centre-to-centre gap for day labels ("Idag"/"Today" is ~40 px wide at 12 pt). */
const LABEL_GAP = 38;
const BAND = theme.colors.accentPurple;
const ACTUAL = theme.colors.textSecondary;

/**
 * Line with a likely-range band (UI/UX Pro Max: forecasts = "line with
 * confidence band"; dataviz: solid for actual, dashed for forecast, the band
 * named in words). Known daily averages are a solid line; the forecast is a
 * dashed line with a band that widens with uncertainty. A dashed line marks
 * today's level. Tap a day to read it.
 */
export function OutlookChart({ recent, today, tomorrow, days }: OutlookChartProps) {
  const { t, i18n } = useTranslation();
  const language = i18n.language as SupportedLanguage;
  const locale = language === 'sv' ? 'sv-SE' : 'en-GB';
  const [width, setWidth] = useState(0);

  const points: Point[] = useMemo(
    () => [
      ...recent.slice(-RECENT_DAYS).map((r) => ({ kind: 'actual' as const, date: r.date, value: r.avg })),
      { kind: 'actual' as const, date: today.date, value: today.avg },
      ...(tomorrow ? [{ kind: 'actual' as const, date: tomorrow.date, value: tomorrow.avg }] : []),
      ...days.map((d) => ({ kind: 'forecast' as const, date: d.date, value: d.mid, low: d.low, high: d.high, uncertain: d.uncertain, day: d })),
    ],
    [recent, today, tomorrow, days],
  );
  const firstForecast = points.findIndex((p) => p.kind === 'forecast');
  const [selected, setSelected] = useState<number>(firstForecast >= 0 ? firstForecast : points.length - 1);

  const values = points.flatMap((p) => (p.kind === 'forecast' ? [p.low, p.high, p.value] : [p.value]));
  const yMin = Math.max(0, Math.min(...values)) * 0.9;
  const yMax = Math.max(...values) * 1.05 || 1;
  const plotW = Math.max(1, width - SIDE * 2);
  const step = points.length > 1 ? plotW / (points.length - 1) : 0;
  const x = (i: number) => SIDE + i * step;
  const todayIndex = Math.max(0, points.findIndex((p) => p.date === today.date));
  const labelStride = step > 0 ? Math.max(1, Math.ceil(LABEL_GAP / step)) : 1;
  const y = (v: number) => TOP + (HEIGHT - TOP - BOTTOM) * (1 - (Math.max(v, yMin) - yMin) / (yMax - yMin || 1));

  const lastActual = firstForecast > 0 ? firstForecast - 1 : points.length - 1;
  const actualPath = points
    .slice(0, lastActual + 1)
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(p.value)}`)
    .join(' ');
  const forecastPath =
    firstForecast > 0
      ? [`M ${x(lastActual)} ${y(points[lastActual].value)}`, ...points.slice(firstForecast).map((p, k) => `L ${x(firstForecast + k)} ${y(p.value)}`)].join(' ')
      : '';
  // Band: starts as a point at the last known day, widens over the forecast.
  const bandPath = (() => {
    if (firstForecast <= 0) return '';
    const fc = points.slice(firstForecast) as Extract<Point, { kind: 'forecast' }>[];
    const top = fc.map((p, k) => `L ${x(firstForecast + k)} ${y(p.high)}`).join(' ');
    const bottom = [...fc].reverse().map((p, k) => `L ${x(points.length - 1 - k)} ${y(p.low)}`).join(' ');
    return `M ${x(lastActual)} ${y(points[lastActual].value)} ${top} ${bottom} Z`;
  })();

  function onPress(e: GestureResponderEvent) {
    if (step === 0) return;
    const i = Math.round((e.nativeEvent.locationX - SIDE) / step);
    if (i >= 0 && i < points.length) setSelected(i);
  }

  const weekdayShort = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString(locale, { weekday: 'short' }).replace('.', '');
  const longDate = (date: string) => {
    const s = new Date(`${date}T12:00:00`).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  };
  const ore = (v: number) => String(Math.max(0, Math.round(v * 100)));

  const sel = points[Math.min(selected, points.length - 1)];
  const readoutDetail =
    sel.kind === 'forecast'
      ? `${t(`outlook.dir.${directionOf(sel.value, today.avg)}`)} · ${t('outlook.range', { low: ore(sel.low), high: ore(sel.high) })}${sel.uncertain ? ` · ${t('outlook.uncertain')}` : ''}`
      : `${t('outlook.averageOre', { ore: ore(sel.value) })} · ${sel.date === today.date ? t('outlook.todayWord') : t('outlook.actualWord')}`;

  return (
    <View>
      <View style={styles.readoutRow} accessibilityLiveRegion="polite">
        <Text style={styles.readout}>
          <Text style={styles.readoutDay}>{longDate(sel.date)}</Text>
          {`  ${readoutDetail}`}
        </Text>
      </View>
      <Pressable onPress={onPress} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)} accessible={false}>
        {width > 0 && (
          <Svg width={width} height={HEIGHT}>
            {/* Forecast zone label */}
            {firstForecast > 0 && (
              <SvgText x={x(firstForecast) - 4} y={12} fill={theme.colors.textSecondary} fontSize={theme.type.xs} fontFamily={theme.typography.bodyMedium}>
                {t('outlook.forecastTag')} →
              </SvgText>
            )}

            {/* Today's level */}
            <Line x1={SIDE} x2={width - SIDE} y1={y(today.avg)} y2={y(today.avg)} stroke={theme.colors.textMuted} strokeWidth={1} strokeDasharray="3 4" />

            {/* Likely range */}
            {bandPath ? <Path d={bandPath} fill={BAND} opacity={0.22} /> : null}

            {/* Selected day */}
            <Rect x={x(selected) - step / 2} y={TOP - 6} width={step} height={HEIGHT - TOP - BOTTOM + 12} fill={theme.colors.textPrimary} opacity={0.06} rx={6} />

            {/* Actual (solid) and forecast (dashed) */}
            <Path d={actualPath} stroke={ACTUAL} strokeWidth={2} fill="none" strokeLinejoin="round" />
            {forecastPath ? <Path d={forecastPath} stroke={FORECAST} strokeWidth={2} strokeDasharray="5 5" fill="none" /> : null}

            {points.map((p, i) =>
              p.kind === 'actual' ? (
                <Circle
                  key={p.date}
                  cx={x(i)}
                  cy={y(p.value)}
                  r={p.date === today.date ? 5.5 : i === selected ? 5 : 3.5}
                  fill={p.date === today.date ? theme.colors.textPrimary : ACTUAL}
                  stroke={theme.colors.surface}
                  strokeWidth={2}
                />
              ) : (
                <Circle
                  key={p.date}
                  cx={x(i)}
                  cy={y(p.value)}
                  r={i === selected ? 6.5 : 5}
                  fill={DIRECTION_STYLE[directionOf(p.value, today.avg)].color}
                  stroke={theme.colors.surface}
                  strokeWidth={2}
                  opacity={p.uncertain ? 0.65 : 1}
                />
              ),
            )}

            {/* Day labels: every labelStride-th day counted out from today, so they never overlap on narrow phones. */}
            {points.map((p, i) =>
              (i - todayIndex) % labelStride !== 0 ? null : (
              <SvgText
                key={`l${p.date}`}
                x={x(i)}
                y={HEIGHT - 6}
                textAnchor="middle"
                fill={p.date === today.date ? theme.colors.textPrimary : theme.colors.textSecondary}
                fontSize={theme.type.xs}
                fontFamily={p.date === today.date ? theme.typography.bodySemibold : theme.typography.body}
              >
                {p.date === today.date ? t('outlook.todayShort') : weekdayShort(p.date)}
              </SvgText>
              ),
            )}
          </Svg>
        )}
      </Pressable>

      {/* One-row legend (dataviz: legend always visible). The point colours are
          named right below by the day rows' pills (direct labels). */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendLine, { backgroundColor: ACTUAL }]} />
          <Text style={styles.legendText}>{t('outlook.legendActual')}</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={styles.legendBand}>
            <View style={styles.legendDashed} />
          </View>
          <Text style={styles.legendText}>{t('outlook.legendForecast')}</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendLine, styles.legendToday]} />
          <Text style={styles.legendText}>{t('outlook.legendToday', { ore: ore(today.avg) })}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  readoutRow: { minHeight: 22, marginBottom: 4 },
  readout: { fontFamily: theme.typography.body, fontSize: theme.type.sm, color: theme.colors.textSecondary },
  readoutDay: { fontFamily: theme.typography.bodySemibold, color: theme.colors.textPrimary },
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 6, marginTop: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center' },
  legendLine: { width: 16, height: 2, borderRadius: 1, marginRight: 6 },
  legendDashed: { width: 18, borderTopWidth: 2, borderStyle: 'dashed', borderColor: FORECAST, height: 0 },
  legendBand: { width: 18, height: 10, borderRadius: 2, backgroundColor: `${BAND}4D` /* 30 % */, justifyContent: 'center', marginRight: 6 },
  legendToday: { height: 0, borderTopWidth: 1, borderStyle: 'dashed', borderColor: theme.colors.textMuted },
  legendText: { fontFamily: theme.typography.body, fontSize: theme.type.xs, color: theme.colors.textSecondary },
});
