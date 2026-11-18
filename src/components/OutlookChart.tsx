import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, Text, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import { useTranslation } from 'react-i18next';
import Svg, { Circle, ClipPath, Defs, G, Line, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';
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

const HEIGHT = 180;
const TOP = 28;
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
 * Aurora shimmer in the likely-range band (experiment 2026-11-18): the AI
 * part of the chart slowly flows purple → blue → teal → pink, the same
 * colours as the AI badge (AuroraBorder), by request. Teal also means
 * "cheaper" on the dots; the band's teal is soft and always moving, the dots
 * are solid, and every day's word says the direction. Two identical cycles
 * side by side, shifted by one cycle width, so the loop is seamless.
 */
const AURORA_BAND = [theme.colors.accentPurple, '#4F7BFF', theme.colors.positiveTeal, '#C084FC'];
const AURORA_MS = 8000;
const AnimatedRect = Animated.createAnimatedComponent(Rect);

/**
 * Smooth path through points (Catmull-Rom → cubic Bézier, tension 0.5 with
 * the control points clamped vertically between neighbours, so the curve
 * never overshoots into a fake high or low).
 */
function smooth(pts: { x: number; y: number }[], moveTo = true): string {
  if (pts.length === 0) return '';
  let d = moveTo ? `M ${pts[0].x} ${pts[0].y}` : `L ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const lo = Math.min(p1.y, p2.y);
    const hi = Math.max(p1.y, p2.y);
    const c1y = Math.min(hi, Math.max(lo, p1.y + (p2.y - p0.y) / 6));
    const c2y = Math.min(hi, Math.max(lo, p2.y - (p3.y - p1.y) / 6));
    d += ` C ${p1.x + (p2.x - p0.x) / 6} ${c1y} ${p2.x - (p3.x - p1.x) / 6} ${c2y} ${p2.x} ${p2.y}`;
  }
  return d;
}

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
  const flow = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then(setReduceMotion)
      .catch(() => setReduceMotion(false));
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => sub.remove();
  }, []);
  useEffect(() => {
    if (reduceMotion !== false) return;
    // JS driver: SVG attributes can't run on the native driver. One small
    // rect, slow loop: cheap.
    const loop = Animated.loop(Animated.timing(flow, { toValue: 1, duration: AURORA_MS, easing: Easing.linear, useNativeDriver: false }));
    loop.start();
    return () => loop.stop();
  }, [reduceMotion, flow]);

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
  // null = nothing tapped yet: show the cheapest coming day (what the card is about).
  const [picked, setSelected] = useState<number | null>(null);

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
  const baseY = HEIGHT - BOTTOM;
  const actualPts = points.slice(0, lastActual + 1).map((p, i) => ({ x: x(i), y: y(p.value) }));
  const actualPath = smooth(actualPts);
  // Soft area under the known prices: depth without a second meaning.
  const actualArea = actualPts.length > 1 ? `${actualPath} L ${actualPts[actualPts.length - 1].x} ${baseY} L ${actualPts[0].x} ${baseY} Z` : '';
  const fc = (firstForecast > 0 ? points.slice(firstForecast) : []) as Extract<Point, { kind: 'forecast' }>[];
  const anchor = { x: x(lastActual), y: y(points[lastActual].value) };
  const forecastPath = fc.length ? smooth([anchor, ...fc.map((p, k) => ({ x: x(firstForecast + k), y: y(p.value) }))]) : '';
  // Band: starts as a point at the last known day and widens over the forecast; smoothed edges.
  const bandPath = fc.length
    ? `${smooth([anchor, ...fc.map((p, k) => ({ x: x(firstForecast + k), y: y(p.high) }))])} ${smooth(
        [...fc].reverse().map((p, k) => ({ x: x(points.length - 1 - k), y: y(p.low) })).concat([anchor]),
        false,
      )} Z`
    : '';
  // Selective direct label: only the cheapest forecast day gets its number.
  const cheapestIdx = fc.length ? firstForecast + fc.reduce((bi, p, k) => (p.value < fc[bi].value ? k : bi), 0) : -1;
  const selected = Math.min(picked ?? (cheapestIdx >= 0 ? cheapestIdx : todayIndex), points.length - 1);

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

  const sel = points[selected];
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
            <Defs>
              <LinearGradient id="bandFill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={BAND} stopOpacity={0.38} />
                <Stop offset="1" stopColor={BAND} stopOpacity={0.12} />
              </LinearGradient>
              <LinearGradient id="auroraFill" x1="0" y1="0" x2="1" y2="0">
                {[...AURORA_BAND, ...AURORA_BAND, AURORA_BAND[0]].map((c, i, all) => (
                  <Stop key={i} offset={i / (all.length - 1)} stopColor={c} stopOpacity={0.55} />
                ))}
              </LinearGradient>
              {bandPath ? (
                <ClipPath id="bandClip">
                  <Path d={bandPath} />
                </ClipPath>
              ) : null}
              <LinearGradient id="actualFill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={ACTUAL} stopOpacity={0.22} />
                <Stop offset="1" stopColor={ACTUAL} stopOpacity={0} />
              </LinearGradient>
            </Defs>

            {/* Future zone: a faint panel behind the forecast, labelled in words. */}
            {firstForecast > 0 && (
              <>
                <Rect x={anchor.x} y={TOP - 10} width={width - SIDE - anchor.x + SIDE / 2} height={baseY - TOP + 10} fill={BAND} opacity={0.06} rx={8} />
                <SvgText x={anchor.x + 8} y={TOP - 14} fill={theme.colors.accentPurpleDeep} fontSize={theme.type.xs} fontFamily={theme.typography.bodySemibold}>
                  {t('outlook.forecastTag')}
                </SvgText>
              </>
            )}

            {/* Today's level, labelled at the end instead of in the legend. */}
            <Line x1={SIDE} x2={width - SIDE} y1={y(today.avg)} y2={y(today.avg)} stroke={theme.colors.textMuted} strokeWidth={1} strokeDasharray="2 5" />

            {actualArea ? <Path d={actualArea} fill="url(#actualFill)" /> : null}
            {bandPath ? (
              <G clipPath="url(#bandClip)">
                {/* Aurora flowing left → right, then the vertical fade on top. */}
                <AnimatedRect
                  x={flow.interpolate({ inputRange: [0, 1], outputRange: [anchor.x - (width - anchor.x), anchor.x] })}
                  y={TOP - 10}
                  width={(width - anchor.x) * 2}
                  height={baseY - TOP + 10}
                  fill="url(#auroraFill)"
                />
                <Path d={bandPath} fill="url(#bandFill)" />
              </G>
            ) : null}

            {/* Selected day: thin crosshair line instead of a grey block. */}
            <Line x1={x(selected)} x2={x(selected)} y1={TOP - 4} y2={baseY} stroke={theme.colors.textPrimary} strokeOpacity={0.35} strokeWidth={1} />

            <Path d={actualPath} stroke={ACTUAL} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            {forecastPath ? (
              <Path d={forecastPath} stroke={FORECAST} strokeWidth={2.5} strokeDasharray="6 5" strokeLinecap="round" fill="none" />
            ) : null}

            {/* Dots only where they mean something: today, each forecast day, the selected day. */}
            {points.map((p, i) => {
              const isToday = p.date === today.date;
              const isSel = i === selected;
              if (p.kind === 'actual') {
                if (!isToday && !isSel) return null;
                return (
                  <Circle
                    key={p.date}
                    cx={x(i)}
                    cy={y(p.value)}
                    r={isToday ? 6 : 5}
                    fill={isToday ? theme.colors.textPrimary : ACTUAL}
                    stroke={theme.colors.surface}
                    strokeWidth={2.5}
                  />
                );
              }
              return (
                <Circle
                  key={p.date}
                  cx={x(i)}
                  cy={y(p.value)}
                  r={isSel ? 7 : 5}
                  fill={DIRECTION_STYLE[directionOf(p.value, today.avg)].color}
                  stroke={theme.colors.surface}
                  strokeWidth={2.5}
                  opacity={p.uncertain ? 0.7 : 1}
                />
              );
            })}

            {/* Direct labels: today's value at the right end of its line, and the cheapest forecast day. */}
            <SvgText
              x={SIDE}
              y={y(today.avg) - 6}
              textAnchor="start"
              fill={theme.colors.textSecondary}
              fontSize={theme.type.xs}
              fontFamily={theme.typography.bodyMedium}
            >
              {t('outlook.legendToday', { ore: ore(today.avg) })}
            </SvgText>
            {cheapestIdx >= 0 && (
              <SvgText
                x={x(cheapestIdx)}
                y={y(points[cheapestIdx].value) + 22}
                textAnchor="middle"
                fill={theme.colors.textPrimary}
                fontSize={theme.type.sm}
                fontFamily={theme.typography.bodySemibold}
              >
                {ore(points[cheapestIdx].value)}
              </SvgText>
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
  legendLine: { width: 16, height: 3, borderRadius: 1, marginRight: 6 },
  legendDashed: { width: 18, borderTopWidth: 2, borderStyle: 'dashed', borderColor: FORECAST, height: 0 },
  legendBand: { width: 18, height: 10, borderRadius: 2, backgroundColor: `${BAND}4D` /* 30 % */, justifyContent: 'center', marginRight: 6 },
  legendText: { fontFamily: theme.typography.body, fontSize: theme.type.xs, color: theme.colors.textSecondary },
});
