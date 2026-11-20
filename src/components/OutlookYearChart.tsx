import { useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import { useTranslation } from 'react-i18next';
import Svg, { Circle, G, Line, Path, Text as SvgText } from 'react-native-svg';
import type { MonthAverage } from '../hooks/useOutlook';
import type { SupportedLanguage } from '../i18n';
import { theme } from '../theme';
import { LineSwatch } from './LineSwatch';
import { niceTicks, smooth } from './OutlookChart';

const HEIGHT = 200;
const TOP = 16;
const BOTTOM = 26;
const AXIS = 32;
/** Room on the right for the year labels at the line ends. */
const RIGHT = 40;
/** Minimum gap between month labels before every other one is skipped. */
const LABEL_GAP = 30;
/** Year labels closer than this (px) are pushed apart. */
const LABEL_MIN_DY = 14;

/**
 * At most three years (UI/UX Pro Max: 2–3 series per chart), told apart by
 * colour, line style and a direct label (never colour alone): this year
 * solid, last year dashed, the year before dotted. Categorical blue / pink /
 * green, checked with the dataviz validator on the card surface (lightness
 * band, colour-blind separation ΔE ≥ 12.7, contrast ≥ 3:1). Kept clear of the
 * app's meaning colours: teal = cheap, amber = dear, red = peak, purple =
 * forecast.
 */
const SERIES_STYLE = [
  { stroke: '#3B82F6', width: 2.5, dash: undefined },
  { stroke: '#EC4899', width: 2, dash: '6 4' },
  { stroke: '#65A30D', width: 2, dash: '1 5' },
] as const;

/** The Year chart's colour for `year` (newest year blue, then pink, then green), so cards match the chart. */
export function yearColor(year: number, newestYear: number): string {
  return SERIES_STYLE[newestYear - year]?.stroke ?? theme.colors.textMuted;
}

interface Series {
  year: number;
  /** Index 0–11 = Jan–Dec; null where the month has no data. */
  values: (number | null)[];
  partialMonth: number | null;
}

/** Group monthly averages into calendar-year series, newest year first (max 3). */
export function yearSeries(months: MonthAverage[]): Series[] {
  const byYear = new Map<number, Series>();
  for (const m of months) {
    const year = Number(m.month.slice(0, 4));
    const idx = Number(m.month.slice(5, 7)) - 1;
    const s = byYear.get(year) ?? { year, values: Array(12).fill(null), partialMonth: null };
    s.values[idx] = m.avg;
    if (m.partial) s.partialMonth = idx;
    byYear.set(year, s);
  }
  return [...byYear.values()]
    .filter((s) => s.values.filter((v) => v !== null).length >= 3)
    .sort((a, b) => b.year - a.year)
    .slice(0, 3);
}

/**
 * "År" view: average spot price per month, this year against the two years
 * before. History only, never a forecast (our 3-month pattern test was right
 * about 1 time in 3), so no AI label and no forward line. Tap or drag to read
 * a month across the years.
 */
export function OutlookYearChart({ months }: { months: MonthAverage[] }) {
  const { t, i18n } = useTranslation();
  const locale = (i18n.language as SupportedLanguage) === 'sv' ? 'sv-SE' : 'en-GB';
  const [width, setWidth] = useState(0);
  const originX = useRef(0);
  const series = useMemo(() => yearSeries(months), [months]);
  const current = series[0];
  const currentMonth = current ? (current.partialMonth ?? current.values.reduce<number>((last, v, i) => (v !== null ? i : last), 0)) : 0;
  const [picked, setPicked] = useState<number | null>(null);
  const selected = picked ?? currentMonth;

  const monthShort = (i: number) =>
    new Date(2000, i, 15).toLocaleDateString(locale, { month: 'short' }).replace('.', '');
  const monthLong = (i: number) => {
    const s = new Date(2000, i, 15).toLocaleDateString(locale, { month: 'long' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  };
  const ore = (v: number) => String(Math.max(0, Math.round(v * 100)));

  if (series.length < 2) {
    return <Text style={styles.empty}>{t('outlook.yearNotEnough')}</Text>;
  }

  const values = series.flatMap((s) => s.values.filter((v): v is number => v !== null));
  const yMin = Math.max(0, Math.min(...values)) * 0.9;
  const yMax = Math.max(...values) * 1.05 || 1;
  const ticks = niceTicks(yMin * 100, yMax * 100).map((o) => o / 100);
  const plotW = Math.max(1, width - AXIS - 6 - RIGHT);
  const step = plotW / 11;
  const x = (i: number) => AXIS + 6 + i * step;
  const y = (v: number) => TOP + (HEIGHT - TOP - BOTTOM) * (1 - (Math.max(v, yMin) - yMin) / (yMax - yMin || 1));
  const labelStride = step >= LABEL_GAP ? 1 : 2;

  // Paths per year, broken where a month is missing.
  const paths = series.map((s) => {
    const segs: { x: number; y: number }[][] = [];
    s.values.forEach((v, i) => {
      if (v === null) return;
      const prev = i > 0 ? s.values[i - 1] : null;
      if (prev !== null && segs.length) segs[segs.length - 1].push({ x: x(i), y: y(v) });
      else segs.push([{ x: x(i), y: y(v) }]);
    });
    return segs;
  });

  // Year labels at each line's last point, nudged apart so they never overlap.
  const labels = series
    .map((s, k) => {
      const last = s.values.reduce<number>((li, v, i) => (v !== null ? i : li), -1);
      return { k, x: x(last) + 8, y: y(s.values[last] as number) + 4 };
    })
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < labels.length; i++) {
    if (labels[i].y - labels[i - 1].y < LABEL_MIN_DY) labels[i].y = labels[i - 1].y + LABEL_MIN_DY;
  }

  function pickAt(pageX: number) {
    const i = Math.round((pageX - originX.current - AXIS - 6) / step);
    setPicked(Math.max(0, Math.min(11, i)));
  }

  const readoutParts = series.map((s) => {
    const v = s.values[selected];
    if (v === null) return `${s.year}: –`;
    return `${s.year}: ${t('outlook.oreShort', { ore: ore(v) })}${s.partialMonth === selected ? ` ${t('outlook.yearSoFar')}` : ''}`;
  });
  const a11y = [
    t('outlook.yearA11y'),
    `${monthLong(currentMonth)}: ${series
      .map((s) => (s.values[currentMonth] !== null ? `${s.year} ${t('outlook.oreShort', { ore: ore(s.values[currentMonth] as number) })}` : null))
      .filter(Boolean)
      .join(', ')}.`,
  ].join(' ');

  return (
    <View>
      <View style={styles.readoutRow} accessibilityLiveRegion="polite">
        <Text style={styles.readout}>
          <Text style={styles.readoutDay}>{monthLong(selected)}</Text>
          {`  ${readoutParts.join(' · ')}`}
        </Text>
      </View>
      <View
        onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
        accessible
        accessibilityRole="image"
        accessibilityLabel={a11y}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(e: GestureResponderEvent) => {
          originX.current = e.nativeEvent.pageX - e.nativeEvent.locationX;
          pickAt(e.nativeEvent.pageX);
        }}
        onResponderMove={(e: GestureResponderEvent) => pickAt(e.nativeEvent.pageX)}
        onResponderTerminationRequest={() => true}
      >
        {width > 0 && (
          <Svg width={width} height={HEIGHT}>
            {ticks.map((v) => (
              <G key={`g${v}`}>
                <Line x1={AXIS + 6} x2={width - RIGHT + 4} y1={y(v)} y2={y(v)} stroke={theme.colors.border} strokeWidth={1} />
                <SvgText x={AXIS} y={y(v) + 4} textAnchor="end" fill={theme.colors.textSecondary} fontSize={theme.type.xs} fontFamily={theme.typography.body}>
                  {ore(v)}
                </SvgText>
              </G>
            ))}

            <Line x1={x(selected)} x2={x(selected)} y1={TOP - 4} y2={HEIGHT - BOTTOM} stroke={theme.colors.textPrimary} strokeOpacity={0.35} strokeWidth={1} />

            {/* Oldest year first, so this year is drawn on top. */}
            {[...series.keys()].reverse().map((k) =>
              paths[k].map((seg, j) =>
                seg.length > 1 ? (
                  <Path
                    key={`p${k}-${j}`}
                    d={smooth(seg)}
                    stroke={SERIES_STYLE[k].stroke}
                    strokeWidth={SERIES_STYLE[k].width}
                    strokeDasharray={SERIES_STYLE[k].dash}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                ) : (
                  <Circle key={`p${k}-${j}`} cx={seg[0].x} cy={seg[0].y} r={2.5} fill={SERIES_STYLE[k].stroke} />
                ),
              ),
            )}

            {/* Selected month: a dot per year. */}
            {series.map((s, k) =>
              s.values[selected] === null ? null : (
                <Circle
                  key={`s${s.year}`}
                  cx={x(selected)}
                  cy={y(s.values[selected] as number)}
                  r={k === 0 ? 6 : 4.5}
                  fill={k === 0 ? SERIES_STYLE[0].stroke : theme.colors.surface}
                  stroke={k === 0 ? theme.colors.surface : SERIES_STYLE[k].stroke}
                  strokeWidth={2}
                />
              ),
            )}

            {/* Direct labels: the year at the end of its line. */}
            {labels.map((l) => (
              <SvgText
                key={`y${l.k}`}
                x={l.x}
                y={l.y}
                fill={l.k === 0 ? theme.colors.textPrimary : theme.colors.textSecondary}
                fontSize={theme.type.xs}
                fontFamily={l.k === 0 ? theme.typography.bodySemibold : theme.typography.body}
              >
                {series[l.k].year}
              </SvgText>
            ))}

            {Array.from({ length: 12 }, (_, i) =>
              i % labelStride !== 0 ? null : (
                <SvgText
                  key={`m${i}`}
                  x={x(i)}
                  y={HEIGHT - 6}
                  textAnchor="middle"
                  fill={i === selected ? theme.colors.textPrimary : theme.colors.textSecondary}
                  fontSize={theme.type.xs}
                  fontFamily={i === selected ? theme.typography.bodySemibold : theme.typography.body}
                >
                  {monthShort(i)}
                </SvgText>
              ),
            )}
          </Svg>
        )}
      </View>

      <View style={styles.legend}>
        {series.map((s, k) => (
          <View key={s.year} style={styles.legendItem}>
            <LineSwatch color={SERIES_STYLE[k].stroke} dash={SERIES_STYLE[k].dash} width={SERIES_STYLE[k].width} />
            <Text style={styles.legendText}>{s.year}</Text>
          </View>
        ))}
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
  legendText: { fontFamily: theme.typography.body, fontSize: theme.type.xs, color: theme.colors.textSecondary },
  empty: { fontFamily: theme.typography.body, fontSize: theme.type.sm, color: theme.colors.textSecondary, marginVertical: 24, textAlign: 'center' },
});
