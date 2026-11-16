import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { IconArrowDownRight, IconArrowUpRight, IconBolt } from '@tabler/icons-react-native';
import { APPLIANCE_ICONS } from '../lib/applianceDisplay';
import { whenOf } from '../lib/whenLabel';
import { useUserStore } from '../stores/useUserStore';
import { groupPricesByHour, findCurrentPrice } from '../lib/priceUtils';
import { formatClock, formatOre } from '../lib/formatNumber';
import { BAND_COLOR, BAND_ORDER, HIGHLIGHT_COLOR, type ChartRange } from '../lib/priceBands';
import type { SupportedLanguage } from '../i18n';
import type { HourlyPrice } from '../providers/types';
import { theme } from '../theme';
import { Chip } from './Chip';
import { PriceAreaChart } from './PriceAreaChart';
import { PriceBar } from './PriceBar';

export interface BestTime {
  id: string;
  /** Preset kind (e.g. 'dishwasher') for the icon. */
  kind: string;
  label: string;
  start: Date;
  end: Date;
  /** Kronor saved vs. running it right now (incl. VAT); null when unknown. */
  saving: number | null;
  startsNow: boolean;
}

// Tabular figures so times and prices line up row to row.
const TABULAR = { fontVariant: ['tabular-nums' as const] };

interface PriceChartProps {
  /** Raw 15-minute prices (already converted to "what you pay" if that view is on), today + tomorrow. */
  slots: HourlyPrice[];
  now: Date;
  /** Pro: best window per household appliance, shaded on the chart and listed below it. */
  bestTimes?: BestTime[];
}

/**
 * The price chart with a "Per timme / Per 15 min" switch (remembered per
 * phone), a one-line summary in words for each day (cheapest and dearest
 * slot), and the Pro "best times" for the user's appliances.
 */
export function PriceChart({ slots, now, bestTimes }: PriceChartProps) {
  const { t, i18n } = useTranslation();
  const language = i18n.language as SupportedLanguage;
  const view = useUserStore((s) => s.chartView);
  // Only promise a trial this Apple ID can still get.
  const setView = useUserStore((s) => s.setChartView);

  const sorted = useMemo(() => [...slots].sort((a, b) => a.hour.getTime() - b.hour.getTime()), [slots]);
  const hourly = useMemo(() => groupPricesByHour(sorted), [sorted]);
  const currentHour = useMemo(() => findCurrentPrice(hourly, now)?.hour ?? null, [hourly, now]);
  const ranges: ChartRange[] = useMemo(() => (bestTimes ?? []).map((b) => ({ start: b.start, end: b.end })), [bestTimes]);

  // Per day: cheapest and dearest quarter-hour, shown as ↓ / ↑ rows.
  const days = useMemo(() => {
    const byDay = new Map<string, HourlyPrice[]>();
    for (const s of sorted) {
      const key = s.hour.toDateString();
      byDay.set(key, [...(byDay.get(key) ?? []), s]);
    }
    return [...byDay.values()].map((day, index) => ({
      label: t(index === 0 ? 'chart.today' : 'chart.tomorrow'),
      cheapest: day.reduce((a, b) => (b.price < a.price ? b : a)),
      dearest: day.reduce((a, b) => (b.price > a.price ? b : a)),
    }));
  }, [sorted, t]);

  if (sorted.length === 0) return null;

  return (
    <View>
      <View style={styles.switchRow} accessibilityRole="radiogroup" accessibilityLabel={t('chart.viewLabel')}>
        <Chip label={t('chart.viewHourly')} selected={view === 'hourly'} onPress={() => setView('hourly')} />
        <Chip label={t('chart.viewQuarter')} selected={view === 'quarter'} onPress={() => setView('quarter')} />
      </View>

      {view === 'quarter' ? (
        <PriceAreaChart slots={sorted} now={now} highlightRanges={ranges} />
      ) : (
        <PriceBar prices={hourly} highlightHour={currentHour} highlightRanges={ranges} />
      )}

      {/* Legend right under the chart: what each colour means, in words. */}
      <View style={styles.legend} accessibilityRole="text">
        {BAND_ORDER.map((band) => (
          <View key={band} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: BAND_COLOR[band] }]} />
            <Text style={styles.legendLabel}>{t(`chart.legend.${band}`)}</Text>
          </View>
        ))}
        {bestTimes && bestTimes.length > 0 && (
          <View style={styles.legendItem}>
            <View style={[styles.legendBlock, { backgroundColor: `${HIGHLIGHT_COLOR}55` }]} />
            <Text style={styles.legendLabel}>{t('chart.legend.best')}</Text>
          </View>
        )}
      </View>

      {/* Cheapest / dearest per day as a small table: labelled columns, so
          nothing relies on the arrow or colour alone, and fixed columns so
          the values line up and never wrap under the day name. */}
      <View style={styles.summary}>
        <View style={styles.summaryRow} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          <View style={styles.dayCol} />
          <View style={[styles.valueCol, styles.headCell]}>
            <IconArrowDownRight size={14} color={theme.colors.positiveTeal} />
            <Text style={styles.headText}>{t('chart.colCheapest')}</Text>
          </View>
          <View style={[styles.valueCol, styles.headCell]}>
            <IconArrowUpRight size={14} color={theme.colors.dangerEmber} />
            <Text style={styles.headText}>{t('chart.colDearest')}</Text>
          </View>
        </View>
        {days.map((d, i) => (
          <View
            key={d.label}
            style={[styles.summaryRow, styles.dayRow, i > 0 && styles.dayRowDivider]}
            accessible
            accessibilityLabel={t('chart.summary', {
              day: d.label,
              cheapTime: formatClock(d.cheapest.hour),
              cheapPrice: formatOre(d.cheapest.price, language),
              dearTime: formatClock(d.dearest.hour),
              dearPrice: formatOre(d.dearest.price, language),
            })}
          >
            <Text style={[styles.dayCol, styles.dayLabel]} numberOfLines={1}>
              {d.label}
            </Text>
            {[d.cheapest, d.dearest].map((slot, j) => (
              <View key={j} style={styles.valueCol}>
                <Text style={[styles.timeText, TABULAR]}>{formatClock(slot.hour)}</Text>
                <Text style={[styles.priceText, TABULAR]}>{formatOre(slot.price, language)} öre</Text>
              </View>
            ))}
          </View>
        ))}
      </View>

      {bestTimes && bestTimes.length > 0 && (
        <View style={styles.bestTimes}>
          <Text style={styles.bestTitle} accessibilityRole="header">
            {t('chart.bestTimesTitle')}
          </Text>
          <View style={styles.legendRow}>
            <View style={[styles.legendBlock, { backgroundColor: `${HIGHLIGHT_COLOR}55` }]} />
            <Text style={styles.legendText}>{t('chart.bestTimesLegend')}</Text>
          </View>

          {bestTimes.map((b, i) => {
            const Icon = APPLIANCE_ICONS[b.kind] ?? IconBolt;
            const when = whenOf(b.start, now, b.startsNow);
            const timeText =
              when === 'now'
                ? t('chart.when.nowUntil', { end: formatClock(b.end) })
                : `${t(`chart.when.${when}`)} ${formatClock(b.start)}–${formatClock(b.end)}`;
            const saving = b.saving !== null ? Math.round(b.saving) : 0;
            return (
              <View
                key={`${b.id}-${b.start.toISOString()}`}
                style={[styles.bestRow, i > 0 && styles.bestRowDivider]}
                accessible
                accessibilityLabel={`${b.label}. ${timeText}.${
                  b.startsNow ? ` ${t('chart.bestNow')}.` : saving >= 1 ? ` ${t('chart.saveKr', { kr: saving })}.` : ''
                }`}
              >
                <View style={styles.bestIcon}>
                  <Icon size={18} color={theme.colors.accentPurpleDeep} />
                </View>
                <View style={styles.bestText}>
                  <Text style={styles.bestLabel}>{b.label}</Text>
                  <Text style={[styles.bestTime, TABULAR]}>{timeText}</Text>
                </View>
                {b.startsNow ? (
                  <Chip label={t('chart.bestNow')} variant="amber" />
                ) : saving >= 1 ? (
                  <Chip label={t('chart.saveKr', { kr: saving })} variant="teal" />
                ) : null}
              </View>
            );
          })}
        </View>
      )}

    </View>
  );
}

const styles = StyleSheet.create({
  switchRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 6, marginTop: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendBlock: { width: 14, height: 10, borderRadius: 2 },
  legendLabel: { fontFamily: theme.typography.body, fontSize: theme.type.xs, color: theme.colors.textSecondary },
  summary: { marginTop: 16 },
  summaryRow: { flexDirection: 'row', alignItems: 'center' },
  dayCol: { flex: 1.1 },
  valueCol: { flex: 1 },
  headCell: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingBottom: 6 },
  headText: { flexShrink: 1, fontFamily: theme.typography.bodyMedium, fontSize: theme.type.xs, color: theme.colors.textSecondary },
  dayRow: { paddingVertical: 10 },
  dayRowDivider: { borderTopWidth: 1, borderTopColor: theme.colors.borderMuted },
  dayLabel: { fontFamily: theme.typography.bodyMedium, fontSize: theme.type.md, color: theme.colors.textPrimary },
  timeText: { fontFamily: theme.typography.bodyMedium, fontSize: theme.type.md, color: theme.colors.textPrimary },
  priceText: { fontFamily: theme.typography.body, fontSize: theme.type.sm, color: theme.colors.textSecondary, marginTop: 2 },
  bestTimes: {
    marginTop: 16,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 6,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  bestTitle: { fontFamily: theme.typography.display, fontSize: theme.type.md, color: theme.colors.textPrimary },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, marginBottom: 6 },
  legendText: { fontFamily: theme.typography.body, fontSize: theme.type.xs, color: theme.colors.textSecondary },
  bestRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 8 },
  bestRowDivider: { borderTopWidth: 1, borderTopColor: theme.colors.borderMuted },
  bestIcon: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.accentPurpleSoft,
  },
  bestText: { flex: 1, gap: 2 },
  bestLabel: { fontFamily: theme.typography.bodyMedium, fontSize: theme.type.md, color: theme.colors.textPrimary },
  bestTime: { fontFamily: theme.typography.body, fontSize: theme.type.sm, color: theme.colors.textSecondary },
});
