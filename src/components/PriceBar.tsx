import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { theme } from '../theme';
import { formatOre } from '../lib/formatNumber';
import { BAND_COLOR, HIGHLIGHT_COLOR, inRanges, makeBander, type ChartRange } from '../lib/priceBands';
import type { SupportedLanguage } from '../i18n';
import type { HourlyPrice } from '../providers/types';

interface PriceBarProps {
  /** Hourly prices (averages of the 15-minute prices), today and tomorrow when published. */
  prices: HourlyPrice[];
  /** The bucket to highlight as "now"; the chart opens scrolled to it. */
  highlightHour?: Date | null;
  /** Pro: best appliance windows to shade behind the bars. */
  highlightRanges?: ChartRange[];
}

const BAR_MAX_HEIGHT = 140;
const BAR_WIDTH = 14;
const COLUMN_WIDTH = 38;
const CHART_PADDING_HORIZONTAL = 16;

/**
 * Hourly bar chart. Bars sit flat on the baseline with 4px rounded tops,
 * coloured by price band (cheap / normal / dear / peak). A dashed divider
 * and label mark where tomorrow starts. Each bar is read out by screen
 * readers as "kl 10, 61 öre, billigt", so colour is never the only signal.
 */
export function PriceBar({ prices, highlightHour, highlightRanges = [] }: PriceBarProps) {
  const { t, i18n } = useTranslation();
  const language = i18n.language as SupportedLanguage;
  const max = prices.reduce((m, p) => Math.max(m, p.price), -Infinity);
  const bandOf = makeBander(prices);

  const scrollRef = useRef<ScrollView>(null);
  const [viewportWidth, setViewportWidth] = useState(0);
  const currentIndex = highlightHour ? prices.findIndex((p) => p.hour.getTime() === highlightHour.getTime()) : -1;

  // Opens with "now" in view; the user can still scroll freely.
  useEffect(() => {
    if (currentIndex < 0 || viewportWidth === 0) return;
    const columnCenter = CHART_PADDING_HORIZONTAL + currentIndex * COLUMN_WIDTH + COLUMN_WIDTH / 2;
    const targetX = Math.max(0, columnCenter - viewportWidth / 3);
    scrollRef.current?.scrollTo({ x: targetX, animated: false });
  }, [currentIndex, viewportWidth]);

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scroll}
      onLayout={(e) => setViewportWidth(e.nativeEvent.layout.width)}
    >
      <View style={styles.chart}>
        {prices.map((p, i) => {
          const height = max > 0 ? (Math.max(p.price, 0) / max) * BAR_MAX_HEIGHT : 0;
          const isCurrent = highlightHour != null && p.hour.getTime() === highlightHour.getTime();
          const startsTomorrow = i > 0 && p.hour.getDate() !== prices[i - 1].hour.getDate();
          const end = new Date(p.hour.getTime() + 3600000);
          const highlighted = inRanges(p.hour, end, highlightRanges);
          const band = bandOf(p);
          return (
            <View key={p.hour.toISOString()} style={styles.columnWrap}>
              {startsTomorrow && (
                <View style={styles.divider}>
                  <Text style={styles.dividerLabel}>{t('chart.tomorrow')}</Text>
                </View>
              )}
              <View
                style={[styles.column, highlighted && styles.columnHighlighted]}
                accessible
                accessibilityLabel={t('chart.barA11y', {
                  hour: String(p.hour.getHours()).padStart(2, '0'),
                  price: formatOre(p.price, language),
                  band: t(`chart.band.${band}`),
                })}
              >
                <Text style={[styles.price, isCurrent && styles.priceCurrent]}>{formatOre(p.price, language)}</Text>
                {isCurrent && <View style={styles.currentDot} />}
                <View style={[styles.bar, { height: Math.max(height, 2), backgroundColor: BAND_COLOR[band] }]} />
                <Text style={[styles.hour, isCurrent && styles.hourCurrent]}>{String(p.hour.getHours()).padStart(2, '0')}</Text>
              </View>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { marginHorizontal: -16 },
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: CHART_PADDING_HORIZONTAL,
    height: BAR_MAX_HEIGHT + 64,
  },
  columnWrap: { flexDirection: 'row', alignItems: 'flex-end', height: '100%' },
  column: {
    alignItems: 'center',
    width: COLUMN_WIDTH,
    justifyContent: 'flex-end',
    height: '100%',
    paddingTop: 16,
    borderRadius: theme.radius.sm,
  },
  // Pro best-time windows: brand purple, so the highlight never reads as a price band.
  columnHighlighted: { backgroundColor: `${HIGHLIGHT_COLOR}2E` },
  divider: {
    width: 1,
    height: '100%',
    marginHorizontal: 4,
    borderLeftWidth: 1,
    borderStyle: 'dashed',
    borderColor: theme.colors.textSecondary,
  },
  dividerLabel: {
    position: 'absolute',
    top: 0,
    left: 6,
    width: 80,
    fontFamily: theme.typography.bodyMedium,
    fontSize: theme.type.xs,
    color: theme.colors.textSecondary,
  },
  price: { fontFamily: theme.typography.body, fontSize: theme.type.xs, color: theme.colors.textSecondary, marginBottom: 4 },
  priceCurrent: { fontFamily: theme.typography.bodyMedium, color: theme.colors.textPrimary },
  currentDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: theme.colors.textPrimary, marginBottom: 4 },
  // Flat on the baseline, rounded data end on top.
  bar: { width: BAR_WIDTH, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  hour: { fontFamily: theme.typography.body, fontSize: theme.type.xs, color: theme.colors.textSecondary, marginTop: 4, marginBottom: 2 },
  hourCurrent: { fontFamily: theme.typography.bodyMedium, color: theme.colors.textPrimary },
});
