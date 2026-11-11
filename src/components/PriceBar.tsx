import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { theme } from '../theme';
import { formatOre } from '../lib/formatNumber';
import type { SupportedLanguage } from '../i18n';
import type { HourlyPrice } from '../providers/types';

interface PriceBarProps {
  prices: HourlyPrice[];
  /** The bucket to highlight as "now" — bar keeps its real price color, marked with a small dot above it instead. Pass `currentPrice.hour` from the caller. Also used to auto-scroll the chart to the current hour on load. */
  highlightHour?: Date | null;
}

const BAR_MAX_HEIGHT = 140;
const BAR_WIDTH = 14;
const COLUMN_WIDTH = 28;
const CHART_PADDING_HORIZONTAL = 16;

function barColor(price: number, min: number, max: number): string {
  if (price >= max) return theme.colors.dangerEmber;

  const range = max - min;
  if (range <= 0) return theme.colors.neutralBar;

  const ratio = (price - min) / range;
  if (ratio < 1 / 3) return theme.colors.positiveTeal;
  if (ratio < 2 / 3) return theme.colors.neutralBar;
  return theme.colors.accentAmber;
}

export function PriceBar({ prices, highlightHour }: PriceBarProps) {
  const { i18n } = useTranslation();
  const language = i18n.language as SupportedLanguage;
  const min = prices.reduce((m, p) => Math.min(m, p.price), Infinity);
  const max = prices.reduce((m, p) => Math.max(m, p.price), -Infinity);

  const scrollRef = useRef<ScrollView>(null);
  const [viewportWidth, setViewportWidth] = useState(0);
  const currentIndex = highlightHour ? prices.findIndex((p) => p.hour.getTime() === highlightHour.getTime()) : -1;

  // Opens centered on "now" so the current hour is visible without
  // scrolling — the user can still scroll freely to check other hours,
  // this only runs again if the current hour or layout width changes.
  useEffect(() => {
    if (currentIndex < 0 || viewportWidth === 0) return;
    const columnCenter = CHART_PADDING_HORIZONTAL + currentIndex * COLUMN_WIDTH + COLUMN_WIDTH / 2;
    const targetX = Math.max(0, columnCenter - viewportWidth / 2);
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
        {prices.map((p) => {
          const height = max > 0 ? (p.price / max) * BAR_MAX_HEIGHT : 0;
          const isCurrent = highlightHour != null && p.hour.getTime() === highlightHour.getTime();
          return (
            <View key={p.hour.toISOString()} style={styles.column}>
              <Text style={[styles.price, isCurrent && styles.priceCurrent]}>{formatOre(p.price, language)}</Text>
              {isCurrent && <View style={styles.currentDot} />}
              <View
                style={[
                  styles.bar,
                  { height: Math.max(height, 2), backgroundColor: barColor(p.price, min, max) },
                ]}
              />
              <Text style={[styles.hour, isCurrent && styles.hourCurrent]}>{p.hour.getHours()}</Text>
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
    height: BAR_MAX_HEIGHT + 50,
  },
  column: { alignItems: 'center', width: COLUMN_WIDTH, justifyContent: 'flex-end' },
  price: { fontFamily: theme.typography.body, fontSize: 9, color: theme.colors.textMuted, marginBottom: 4 },
  priceCurrent: { fontFamily: theme.typography.bodyMedium, color: theme.colors.textPrimary },
  currentDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: theme.colors.textPrimary, marginBottom: 4 },
  bar: { width: BAR_WIDTH, borderRadius: 7 },
  hour: { fontFamily: theme.typography.body, fontSize: 10, color: theme.colors.textFaint, marginTop: 4 },
  hourCurrent: { fontFamily: theme.typography.bodyMedium, color: theme.colors.textPrimary },
});
