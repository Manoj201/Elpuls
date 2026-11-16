import { useEffect, useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useCountryStore } from '../stores/useCountryStore';
import { usePriceStore } from '../stores/usePriceStore';
import { groupPricesByHour } from '../lib/priceUtils';
import { summarizePricePeriods } from '../lib/pricePeriods';
import { BAND_COLOR, type PriceBand } from '../lib/priceBands';
import { formatClock, formatOre } from '../lib/formatNumber';
import type { SupportedLanguage } from '../i18n';
import { theme } from '../theme';
import { Card } from '../components/Card';
import { PriceChart } from '../components/PriceChart';
import {
  OutlookChartCard,
  OutlookDaysCard,
  SeasonalCard,
} from '../components/OutlookCards';
import { ProUpsellCard } from '../components/ProUpsellCard';
import { useNow } from '../hooks/useNow';
import { useOutlook } from '../hooks/useOutlook';
import { useUserStore } from '../stores/useUserStore';
import { IconCalendarMonth, IconCalendarStats, IconChartLine } from '@tabler/icons-react-native';

// Text tone for the band word, matching the row's bar. All ≥ 9:1 on the card.
const BAND_TEXT: Record<PriceBand, string> = {
  cheap: theme.colors.positiveTealDeep,
  normal: theme.colors.textSecondary,
  dear: theme.colors.accentAmberDeep,
  peak: theme.colors.dangerEmberDeep,
};

/** "HH:MM", but midnight at the end of a period reads 24:00. */
function clockLabel(d: Date, isEnd: boolean): string {
  if (isEnd && d.getHours() === 0 && d.getMinutes() === 0) return '24:00';
  return formatClock(d);
}

/**
 * The band in words. Plain text, not a pill (UI/UX Pro Max color-not-only,
 * compact-label-overflow): the bar on the left already carries the colour, and
 * filled pills on every row added a second coloured shape and looked tappable.
 */
function BandTag({ band }: { band: PriceBand }) {
  const { t } = useTranslation();
  return (
    <Text style={[styles.bandTag, { color: BAND_TEXT[band] }]} numberOfLines={1}>
      {t(`chart.legend.${band}`)}
    </Text>
  );
}

function DaySummary({
  title,
  hourlyPrices,
  language,
  emptyText,
  now,
}: {
  title: string;
  hourlyPrices: ReturnType<typeof groupPricesByHour>;
  language: SupportedLanguage;
  emptyText: string;
  now: Date;
}) {
  const { t } = useTranslation();
  const avgPrice = hourlyPrices.length > 0 ? hourlyPrices.reduce((s, p) => s + p.price, 0) / hourlyPrices.length : null;
  const periods = useMemo(() => summarizePricePeriods(hourlyPrices), [hourlyPrices]);

  return (
    <Card style={styles.dayCard}>
      <Text style={styles.dayTitle}>{title}</Text>

      {avgPrice === null ? (
        <Text style={styles.empty}>{emptyText}</Text>
      ) : (
        <>
          <Text style={styles.dayAverage}>
            {formatOre(avgPrice, language)} <Text style={styles.dayAverageUnit}>{t('forecast.averageUnit')}</Text>
          </Text>
          <Text style={styles.explain}>{t('forecast.periodsExplain')}</Text>

          <View style={styles.periodList}>
            {periods.map((period) => {
              const from = clockLabel(period.start, false);
              const to = clockLabel(period.end, true);
              const isNow = now >= period.start && now < period.end;
              const bandWord = t(`chart.legend.${period.band}`);
              const price = formatOre(period.averagePrice, language);
              return (
                <View
                  key={period.start.toISOString()}
                  style={styles.periodRow}
                  accessible
                  accessibilityLabel={t('forecast.periodA11y', { from, to, band: bandWord, price })}
                >
                  <View style={[styles.periodIndicator, { backgroundColor: BAND_COLOR[period.band] }]} />
                  <View style={styles.periodText}>
                    <Text style={styles.periodTime}>
                      {from}–{to}
                      {isNow ? <Text style={styles.nowText}>{`  ${t('forecast.now')}`}</Text> : null}
                    </Text>
                    <Text style={styles.periodHint}>{t(`forecast.hint.${period.band}`)}</Text>
                  </View>
                  <View style={styles.periodValue}>
                    <Text style={styles.periodPrice}>
                      {price} <Text style={styles.periodPriceUnit}>öre</Text>
                    </Text>
                    <BandTag band={period.band} />
                  </View>
                </View>
              );
            })}
          </View>
        </>
      )}
    </Card>
  );
}

export function ForecastScreen() {
  const { t, i18n } = useTranslation();
  const language = i18n.language as SupportedLanguage;
  const zone = useCountryStore((s) => s.zone);
  const { todayPrices, tomorrowPrices, fetchPrices } = usePriceStore();

  useEffect(() => {
    fetchPrices(zone);
  }, [fetchPrices, zone]);

  const now = useNow();
  const isProSubscriber = useUserStore((s) => s.isProSubscriber);
  const { outlook, isLoading: outlookLoading } = useOutlook(zone, isProSubscriber);
  const todayHourly = useMemo(() => groupPricesByHour(todayPrices), [todayPrices]);
  const tomorrowHourly = useMemo(() => groupPricesByHour(tomorrowPrices), [tomorrowPrices]);

  const todayAvg = todayHourly.length > 0 ? todayHourly.reduce((s, p) => s + p.price, 0) / todayHourly.length : null;
  const tomorrowAvg =
    tomorrowHourly.length > 0 ? tomorrowHourly.reduce((s, p) => s + p.price, 0) / tomorrowHourly.length : null;
  const diffPct = todayAvg !== null && tomorrowAvg !== null && todayAvg > 0 ? ((tomorrowAvg - todayAvg) / todayAvg) * 100 : null;

  const todaySummary = (
    <DaySummary title={t('forecast.today')} hourlyPrices={todayHourly} language={language} emptyText={t('forecast.noPrices')} now={now} />
  );
  const tomorrowSummary = (
    <DaySummary
      title={t('forecast.tomorrow')}
      hourlyPrices={tomorrowHourly}
      language={language}
      emptyText={t('forecast.tomorrowPending')}
      now={now}
    />
  );

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>{t('forecast.title')}</Text>
      <Text style={styles.subtitle}>{t('forecast.subtitle', { zone })}</Text>

      {diffPct !== null && (
        <Card style={styles.diffCard}>
          <Text style={styles.diffLabel}>
            {diffPct <= 0 ? t('forecast.tomorrowCheaper') : t('forecast.tomorrowPricier')}
          </Text>
          <Text style={[styles.diffValue, { color: diffPct <= 0 ? theme.colors.positiveTeal : theme.colors.dangerEmber }]}>
            {diffPct <= 0 ? '' : '+'}
            {Math.round(diffPct)}%
          </Text>
        </Card>
      )}

      {todayPrices.length > 0 && (
        <Card style={styles.chartCard}>
          <PriceChart slots={[...todayPrices, ...tomorrowPrices]} now={now} />
        </Card>
      )}

      {/*
        Order (UI/UX Pro Max content-priority, near → far): the quick answer and
        the 48 h chart, then the coming days (the screen's main question), then
        the hour-by-hour detail for tomorrow and today, then the longer views.
        Tomorrow comes before today once published: today is already on Home.
      */}
      {isProSubscriber ? (
        outlook ? (
          <OutlookDaysCard outlook={outlook} todayAvg={todayAvg} zone={zone} />
        ) : !outlookLoading ? (
          <Card style={styles.dayCard}>
            <Text style={styles.dayTitle}>{t('outlook.daysTitle')}</Text>
            <Text style={styles.empty}>{t('outlook.notReady')}</Text>
          </Card>
        ) : null
      ) : null}

      {tomorrowHourly.length > 0 ? (
        <>
          {tomorrowSummary}
          {todaySummary}
        </>
      ) : (
        <>
          {todaySummary}
          {tomorrowSummary}
        </>
      )}

      {isProSubscriber ? (
        outlook && (
          <>
            <OutlookChartCard outlook={outlook} todayAvg={todayAvg} tomorrowAvg={tomorrowAvg} />
            <SeasonalCard outlook={outlook} />
          </>
        )
      ) : (
        // Free: one Pro offer at the end instead of a locked card per section.
        <ProUpsellCard
          style={styles.locked}
          title={t('pro.upsell.forecastTitle')}
          source="generic"
          benefits={[
            { icon: IconCalendarStats, title: t('outlook.lockedTitle'), text: t('outlook.lockedText') },
            { icon: IconChartLine, title: t('outlook.lockedChartTitle'), text: t('outlook.lockedChartText') },
            { icon: IconCalendarMonth, title: t('outlook.lockedMonthsTitle'), text: t('outlook.lockedMonthsText') },
          ]}
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingTop: 60, paddingBottom: 40 },
  title: { fontFamily: theme.typography.display, fontSize: theme.type.xl, color: theme.colors.textPrimary },
  subtitle: { fontFamily: theme.typography.body, fontSize: theme.type.sm, color: theme.colors.textMuted, marginTop: 4, marginBottom: 20 },
  diffCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  diffLabel: { fontFamily: theme.typography.bodyMedium, fontSize: theme.type.sm, color: theme.colors.textPrimary, flex: 1 },
  diffValue: { fontFamily: theme.typography.display, fontSize: theme.type.lg },
  dayCard: { marginBottom: 16 },
  locked: { marginBottom: 16 },
  chartCard: { marginBottom: 16, overflow: 'hidden' },
  dayTitle: { fontFamily: theme.typography.displayMedium, fontSize: theme.type.md, color: theme.colors.textPrimary, marginBottom: 6 },
  dayAverage: { fontFamily: theme.typography.display, fontSize: theme.type.xl, color: theme.colors.textPrimary },
  dayAverageUnit: { fontFamily: theme.typography.body, fontSize: theme.type.sm, color: theme.colors.textSecondary },
  explain: {
    fontFamily: theme.typography.body,
    fontSize: theme.type.sm,
    lineHeight: 20,
    color: theme.colors.textSecondary,
    marginTop: 6,
    marginBottom: 18,
  },
  empty: { fontFamily: theme.typography.body, fontSize: theme.type.sm, color: theme.colors.textSecondary },
  periodList: { gap: 14 },
  periodRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  periodIndicator: { width: 4, alignSelf: 'stretch', borderRadius: 2, minHeight: 32 },
  periodText: { flex: 1, gap: 2 },
  periodTime: {
    fontFamily: theme.typography.bodyMedium,
    fontSize: theme.type.md,
    color: theme.colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  nowText: { fontFamily: theme.typography.bodySemibold, fontSize: theme.type.sm, color: theme.colors.accentPurple },
  periodHint: { fontFamily: theme.typography.body, fontSize: theme.type.sm, color: theme.colors.textSecondary },
  // Never squeezed: the text column on the left wraps instead.
  periodValue: { alignItems: 'flex-end', gap: 2, flexShrink: 0 },
  // The number people came for, so it's the strongest thing on the right.
  periodPrice: {
    fontFamily: theme.typography.displayMedium,
    fontSize: theme.type.md,
    color: theme.colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  periodPriceUnit: { fontFamily: theme.typography.body, fontSize: theme.type.xs, color: theme.colors.textSecondary },
  bandTag: { fontFamily: theme.typography.bodySemibold, fontSize: theme.type.sm },
});
