import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';
import Svg, { Line, Path, Rect, Circle } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { theme } from '../theme';
import { formatClock, formatOre } from '../lib/formatNumber';
import { BAND_COLOR, HIGHLIGHT_COLOR, inRanges, makeBander, type ChartRange, type PriceBand } from '../lib/priceBands';
import type { SupportedLanguage } from '../i18n';
import type { HourlyPrice } from '../providers/types';

interface PriceAreaChartProps {
  /** Raw 15-minute prices, today (and tomorrow when published), sorted. */
  slots: HourlyPrice[];
  now: Date;
  /** Pro: best appliance windows to shade. */
  highlightRanges?: ChartRange[];
}

const SLOT_WIDTH = 6; // px per 15 minutes → 24 px per hour
const PLOT_HEIGHT = 150;
const TOP_PAD = 12;
const BOTTOM_PAD = 26; // hour labels
const SIDE_PAD = 16;

/**
 * 15-minute price chart: a 2px step line coloured by price band over a soft
 * area, a faint 3-hour grid, a "now" line, a tomorrow divider and (Pro)
 * shaded best windows. Tap anywhere to read the exact quarter-hour price.
 * Scrolls sideways and opens centred on "now".
 */
export function PriceAreaChart({ slots, now, highlightRanges = [] }: PriceAreaChartProps) {
  const { t, i18n } = useTranslation();
  const language = i18n.language as SupportedLanguage;
  const scrollRef = useRef<ScrollView>(null);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);

  const { yMin, yMax } = useMemo(() => {
    const prices = slots.map((s) => s.price);
    const lo = Math.min(...prices);
    const hi = Math.max(...prices);
    return { yMin: Math.min(0, lo), yMax: hi > 0 ? hi * 1.1 : 1 };
  }, [slots]);
  // Each slot's band, judged against its own day's average.
  const bands = useMemo(() => {
    const bandOf = makeBander(slots);
    return slots.map((s) => bandOf(s));
  }, [slots]);

  const width = slots.length * SLOT_WIDTH;
  const totalHeight = TOP_PAD + PLOT_HEIGHT + BOTTOM_PAD;
  const y = (price: number) => TOP_PAD + PLOT_HEIGHT - ((price - yMin) / (yMax - yMin || 1)) * PLOT_HEIGHT;
  const baseline = y(Math.max(0, yMin));

  const nowIndex = slots.findIndex((s, i) => {
    const next = slots[i + 1];
    return s.hour.getTime() <= now.getTime() && (!next || next.hour.getTime() > now.getTime());
  });
  const dividerIndex = slots.findIndex((s, i) => i > 0 && s.hour.getDate() !== slots[i - 1].hour.getDate());

  useEffect(() => {
    if (nowIndex < 0 || viewportWidth === 0) return;
    const x = SIDE_PAD + nowIndex * SLOT_WIDTH;
    scrollRef.current?.scrollTo({ x: Math.max(0, x - viewportWidth / 3), animated: false });
  }, [nowIndex, viewportWidth]);

  // Consecutive slots in the same band, each as one closed area shape.
  const bandRuns = useMemo(() => {
    const runs: { band: PriceBand; from: number; d: string }[] = [];
    let i = 0;
    while (i < slots.length) {
      const band = bands[i];
      let j = i;
      while (j + 1 < slots.length && bands[j + 1] === band) j++;
      let d = `M ${i * SLOT_WIDTH} ${baseline}`;
      for (let k = i; k <= j; k++) {
        d += ` L ${k * SLOT_WIDTH} ${y(slots[k].price)} L ${(k + 1) * SLOT_WIDTH} ${y(slots[k].price)}`;
      }
      d += ` L ${(j + 1) * SLOT_WIDTH} ${baseline} Z`;
      runs.push({ band, from: i, d });
      i = j + 1;
    }
    return runs;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots, bands, baseline, yMin, yMax]);

  // Runs of consecutive slots inside a highlighted window: [firstIndex, lastIndex].
  const highlightSpans = useMemo(() => {
    const spans: [number, number][] = [];
    slots.forEach((s, i) => {
      if (!inRanges(s.hour, new Date(s.hour.getTime() + 15 * 60000), highlightRanges)) return;
      const last = spans[spans.length - 1];
      if (last && last[1] === i - 1) last[1] = i;
      else spans.push([i, i]);
    });
    return spans;
  }, [slots, highlightRanges]);

  function handlePress(e: GestureResponderEvent) {
    const index = Math.floor(e.nativeEvent.locationX / SLOT_WIDTH);
    if (index >= 0 && index < slots.length) setSelected(index === selected ? null : index);
  }

  const sel = selected !== null ? slots[selected] : null;
  const selEnd = sel ? new Date(sel.hour.getTime() + 15 * 60000) : null;

  return (
    <View>
      <View style={styles.readoutRow} accessibilityLiveRegion="polite">
        {sel && selEnd ? (
          <Text style={styles.readout}>
            {formatClock(sel.hour)}–{formatClock(selEnd)} · {formatOre(sel.price, language)} öre ·{' '}
            {t(`chart.band.${bands[selected ?? 0]}`)}
          </Text>
        ) : (
          <Text style={styles.readoutHint}>{t('chart.tapHint')}</Text>
        )}
      </View>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.scroll}
        contentContainerStyle={{ paddingHorizontal: SIDE_PAD }}
        onLayout={(e) => setViewportWidth(e.nativeEvent.layout.width)}
      >
        <Pressable onPress={handlePress} accessible={false}>
          <Svg width={width} height={totalHeight}>
            {/* Pro: shaded best windows, one continuous band per window (per-slot rects show seams) */}
            {highlightSpans.map(([from, to]) => (
              <Rect
                key={`h${from}`}
                x={from * SLOT_WIDTH}
                y={TOP_PAD}
                width={(to - from + 1) * SLOT_WIDTH}
                height={PLOT_HEIGHT}
                fill={HIGHLIGHT_COLOR}
                opacity={0.2}
              />
            ))}

            {/* 3-hour grid (recessive) */}
            {slots.map((s, i) =>
              s.hour.getMinutes() === 0 && s.hour.getHours() % 3 === 0 ? (
                <Line
                  key={`g${i}`}
                  x1={i * SLOT_WIDTH}
                  x2={i * SLOT_WIDTH}
                  y1={TOP_PAD}
                  y2={TOP_PAD + PLOT_HEIGHT}
                  stroke={theme.colors.borderMuted}
                  strokeWidth={1}
                />
              ) : null,
            )}

            {/* Area under the line, tinted by price band (~20% opacity), one shape per run */}
            {bandRuns.map((run) => (
              <Path key={`a${run.from}`} d={run.d} fill={BAND_COLOR[run.band]} opacity={run.band === 'normal' ? 0.14 : 0.2} />
            ))}

            {/* Step line, each quarter-hour in its price-band colour */}
            {slots.map((s, i) => {
              const yy = y(s.price);
              return (
                <Line
                  key={`l${i}`}
                  x1={i * SLOT_WIDTH}
                  x2={(i + 1) * SLOT_WIDTH}
                  y1={yy}
                  y2={yy}
                  stroke={BAND_COLOR[bands[i]]}
                  strokeWidth={2}
                  strokeLinecap="round"
                />
              );
            })}
            {slots.map((s, i) => {
              const next = slots[i + 1];
              if (!next || next.price === s.price) return null;
              return (
                <Line
                  key={`v${i}`}
                  x1={(i + 1) * SLOT_WIDTH}
                  x2={(i + 1) * SLOT_WIDTH}
                  y1={y(s.price)}
                  y2={y(next.price)}
                  stroke={theme.colors.textMuted}
                  strokeWidth={1}
                  opacity={0.6}
                />
              );
            })}

            {/* Tomorrow divider */}
            {dividerIndex > 0 && (
              <Line
                x1={dividerIndex * SLOT_WIDTH}
                x2={dividerIndex * SLOT_WIDTH}
                y1={TOP_PAD - 8}
                y2={TOP_PAD + PLOT_HEIGHT}
                stroke={theme.colors.textSecondary}
                strokeWidth={1}
                strokeDasharray="4 4"
              />
            )}

            {/* Now */}
            {nowIndex >= 0 && (
              <>
                <Line
                  x1={nowIndex * SLOT_WIDTH + SLOT_WIDTH / 2}
                  x2={nowIndex * SLOT_WIDTH + SLOT_WIDTH / 2}
                  y1={TOP_PAD}
                  y2={TOP_PAD + PLOT_HEIGHT}
                  stroke={theme.colors.textPrimary}
                  strokeWidth={1.5}
                />
                <Circle cx={nowIndex * SLOT_WIDTH + SLOT_WIDTH / 2} cy={y(slots[nowIndex].price)} r={4} fill={theme.colors.textPrimary} />
              </>
            )}

            {/* Selected slot crosshair */}
            {selected !== null && (
              <Rect
                x={selected * SLOT_WIDTH}
                y={TOP_PAD}
                width={SLOT_WIDTH}
                height={PLOT_HEIGHT}
                fill={theme.colors.textPrimary}
                opacity={0.18}
              />
            )}
          </Svg>

          {/* Hour labels (every 3 hours) and the tomorrow label, as native text for crisp, scalable type */}
          {slots.map((s, i) =>
            s.hour.getMinutes() === 0 && s.hour.getHours() % 3 === 0 ? (
              <Text key={`t${i}`} style={[styles.hourLabel, { left: i * SLOT_WIDTH - 10 }]}>
                {String(s.hour.getHours()).padStart(2, '0')}
              </Text>
            ) : null,
          )}
          {dividerIndex > 0 && (
            <Text style={[styles.dayLabel, { left: dividerIndex * SLOT_WIDTH + 4 }]}>{t('chart.tomorrow')}</Text>
          )}
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { marginHorizontal: -16 },
  readoutRow: { minHeight: 22, marginBottom: 4 },
  readout: { fontFamily: theme.typography.bodyMedium, fontSize: theme.type.sm, color: theme.colors.textPrimary },
  readoutHint: { fontFamily: theme.typography.body, fontSize: theme.type.xs, color: theme.colors.textSecondary },
  hourLabel: {
    position: 'absolute',
    bottom: 4,
    width: 20,
    textAlign: 'center',
    fontFamily: theme.typography.body,
    fontSize: theme.type.xs,
    color: theme.colors.textSecondary,
  },
  dayLabel: {
    position: 'absolute',
    top: -2,
    fontFamily: theme.typography.bodyMedium,
    fontSize: theme.type.xs,
    color: theme.colors.textSecondary,
  },
});
