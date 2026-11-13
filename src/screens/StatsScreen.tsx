import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { IconChartBar, IconClockHour4 } from '@tabler/icons-react-native';
import { useCountryStore } from '../stores/useCountryStore';
import { usePriceStore } from '../stores/usePriceStore';
import { useUserStore } from '../stores/useUserStore';
import { groupPricesByHour, findCurrentPrice, findExtremeHours } from '../lib/priceUtils';
import { landedPriceBreakdown } from '../lib/landedCost';
import { compareAllZones, type ZoneAverage } from '../lib/zoneComparison';
import { formatOre, formatPrice } from '../lib/formatNumber';
import type { SupportedLanguage } from '../i18n';
import { theme } from '../theme';
import { Card } from '../components/Card';
import { Chip } from '../components/Chip';
import { InfoRow } from '../components/InfoRow';
import { PreviewRow, ProLockedCard } from '../components/ProLockedCard';

const USAGE_STEPS = [-20, -10, 0, 10, 20];
const SHIFT_STEPS = [0, 25, 50, 75, 100];
// No real consumption data source exists yet (CLAUDE.md §12) — when the
// user hasn't self-reported a monthly figure (Contract health check's
// field), fall back to a rough default conditioned on heating type, since
// electric/heat-pump heating dominates a Swedish household's usage far more
// than any other factor the onboarding profile captures.
const DEFAULT_MONTHLY_KWH_HIGH_HEATING = 1200;
const DEFAULT_MONTHLY_KWH_OTHER = 500;

export function StatsScreen() {
  const { t, i18n } = useTranslation();
  const language = i18n.language as SupportedLanguage;
  const zone = useCountryStore((s) => s.zone);
  const config = useCountryStore((s) => s.config);
  const zones = config.zones;
  const { todayPrices, fetchPrices } = usePriceStore();
  const gridFeeVariableSekPerKwh = useUserStore((s) => s.gridFeeVariableSekPerKwh);
  const retailerMarkupSekPerKwh = useUserStore((s) => s.retailerMarkupSekPerKwh);
  const estimatedMonthlyKwh = useUserStore((s) => s.estimatedMonthlyKwh);
  const heatingType = useUserStore((s) => s.heatingType);
  const isProSubscriber = useUserStore((s) => s.isProSubscriber);

  const [zoneAverages, setZoneAverages] = useState<ZoneAverage[] | null>(null);
  const [zoneAveragesLoading, setZoneAveragesLoading] = useState(false);
  const [usageIndex, setUsageIndex] = useState(USAGE_STEPS.indexOf(0));
  const [shiftIndex, setShiftIndex] = useState(0);

  useEffect(() => {
    fetchPrices(zone);
  }, [fetchPrices, zone]);

  useEffect(() => {
    let cancelled = false;
    setZoneAveragesLoading(true);
    compareAllZones({ priceProvider: config.priceProvider, allZones: zones, date: new Date() })
      .then((result) => {
        if (!cancelled) setZoneAverages(result);
      })
      .finally(() => {
        if (!cancelled) setZoneAveragesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [config.priceProvider, zones]);

  const hourlyPrices = useMemo(() => groupPricesByHour(todayPrices), [todayPrices]);
  const currentPrice = useMemo(() => findCurrentPrice(hourlyPrices, new Date()), [hourlyPrices]);

  const breakdown = currentPrice
    ? landedPriceBreakdown(currentPrice.price, gridFeeVariableSekPerKwh ?? 0, retailerMarkupSekPerKwh)
    : null;

  // Flat öre/kWh add-on, so the overpay vs. a 0-öre-markup contract reduces
  // to markup × consumption — no monthly spot-price average needed.
  const monthlyOverpayKr =
    retailerMarkupSekPerKwh !== null && estimatedMonthlyKwh !== null
      ? retailerMarkupSekPerKwh * estimatedMonthlyKwh
      : null;

  const { cheapest } = useMemo(() => findExtremeHours(hourlyPrices), [hourlyPrices]);
  const avgSpotPrice = hourlyPrices.length > 0 ? hourlyPrices.reduce((s, p) => s + p.price, 0) / hourlyPrices.length : null;

  const baseMonthlyKwh =
    estimatedMonthlyKwh ??
    (heatingType === 'electric' || heatingType === 'heat_pump' ? DEFAULT_MONTHLY_KWH_HIGH_HEATING : DEFAULT_MONTHLY_KWH_OTHER);

  const usagePct = USAGE_STEPS[usageIndex];
  const shiftPct = SHIFT_STEPS[shiftIndex];

  const whatIf =
    avgSpotPrice !== null
      ? (() => {
          const cheapestSpotPrice = cheapest?.price ?? avgSpotPrice;
          const adjustedKwh = baseMonthlyKwh * (1 + usagePct / 100);
          const blendedSpot = avgSpotPrice * (1 - shiftPct / 100) + cheapestSpotPrice * (shiftPct / 100);
          const landedPerKwh = landedPriceBreakdown(blendedSpot, gridFeeVariableSekPerKwh ?? 0, retailerMarkupSekPerKwh).total;
          const baselineLandedPerKwh = landedPriceBreakdown(avgSpotPrice, gridFeeVariableSekPerKwh ?? 0, retailerMarkupSekPerKwh).total;
          const projectedMonthlyKr = adjustedKwh * landedPerKwh;
          const baselineMonthlyKr = baseMonthlyKwh * baselineLandedPerKwh;
          return { projectedMonthlyKr, deltaKr: baselineMonthlyKr - projectedMonthlyKr };
        })()
      : null;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title} accessibilityRole="header">
        {t('stats.title')}
      </Text>
      <Text style={styles.subtitle}>{t('stats.subtitle')}</Text>

      {!isProSubscriber ? (
        <ProLockedCard
          icon={IconChartBar}
          title={t('paywall.headlineStats')}
          subtitle={t('paywall.lockedStatsSubtitle')}
          source="stats"
          preview={
            <View>
              <PreviewRow label={t('stats.spot')} value={t('stats.sample.spot')} />
              <PreviewRow label={t('stats.gridFee')} value={t('stats.sample.gridFee')} />
              <PreviewRow label={t('stats.energyTax')} value={t('stats.sample.energyTax')} />
              <PreviewRow label={t('stats.vat')} value={t('stats.sample.vat')} />
              <PreviewRow label={t('stats.total')} value={t('stats.sample.total')} strong />
            </View>
          }
        />
      ) : (
        <>
          <Text style={styles.sectionTitle}>{t('stats.costBreakdown')}</Text>
          {breakdown ? (
            <Card style={styles.sectionCard}>
              <BreakdownRow label={t('stats.spot')} value={breakdown.spot} language={language} />
              <BreakdownRow label={t('stats.gridFee')} value={breakdown.gridFee} language={language} />
              <BreakdownRow label={t('stats.energyTax')} value={breakdown.energyTax} language={language} />
              <BreakdownRow label={t('stats.elcertifikat')} value={breakdown.elcertifikat} language={language} />
              <BreakdownRow label={t('stats.retailerMarkup')} value={breakdown.retailerMarkup} language={language} isEstimate={retailerMarkupSekPerKwh === null} />
              <BreakdownRow label={t('stats.vat')} value={breakdown.vat} language={language} />
              <View style={styles.breakdownDivider} />
              <BreakdownRow label={t('stats.total')} value={breakdown.total} language={language} bold />
            </Card>
          ) : (
            <Text style={styles.empty}>{t('forecast.noPrices')}</Text>
          )}

          <Text style={styles.sectionTitle}>{t('stats.contractHealthTitle')}</Text>
          <Card style={styles.sectionCard}>
            {retailerMarkupSekPerKwh === null ? (
              <Text style={styles.empty}>{t('stats.contractHealthNeedsBillScan')}</Text>
            ) : estimatedMonthlyKwh === null ? (
              <Text style={styles.empty}>{t('stats.contractHealthNeedsUsage')}</Text>
            ) : (
              monthlyOverpayKr !== null && (
                <>
                  <Text style={styles.contractHealthHero}>
                    {formatPrice(monthlyOverpayKr, language)} {config.currency}
                  </Text>
                  <Text style={styles.contractHealthResult}>{t('stats.contractHealthResult')}</Text>
                  <Text style={styles.breakdownEstimateHint}>
                    {t('stats.contractHealthBasis', {
                      kwh: estimatedMonthlyKwh,
                      markup: formatOre(retailerMarkupSekPerKwh, language),
                    })}
                  </Text>
                </>
              )
            )}
          </Card>

          <Text style={styles.sectionTitle}>{t('stats.whatIfTitle')}</Text>
          <Card style={styles.sectionCard}>
            <Text style={styles.whatIfStepperLabel}>{t('stats.whatIfUsageLabel')}</Text>
            <View style={styles.whatIfStepperRow}>
              {USAGE_STEPS.map((step, i) => (
                <Chip
                  key={step}
                  label={step > 0 ? `+${step}%` : `${step}%`}
                  selected={i === usageIndex}
                  onPress={() => setUsageIndex(i)}
                />
              ))}
            </View>

            <Text style={[styles.whatIfStepperLabel, styles.whatIfStepperLabelSpaced]}>{t('stats.whatIfShiftLabel')}</Text>
            <View style={styles.whatIfStepperRow}>
              {SHIFT_STEPS.map((step, i) => (
                <Chip key={step} label={`${step}%`} selected={i === shiftIndex} onPress={() => setShiftIndex(i)} />
              ))}
            </View>

            {whatIf ? (
              <>
                <Text style={styles.contractHealthHero}>
                  {formatPrice(whatIf.projectedMonthlyKr, language)} {config.currency}
                  <Text style={styles.whatIfPerMonth}> /{t('common.month')}</Text>
                </Text>
                <Text style={styles.contractHealthResult}>
                  {t(whatIf.deltaKr >= 0 ? 'stats.whatIfSavingsResult' : 'stats.whatIfExtraResult', {
                    amount: formatPrice(Math.abs(whatIf.deltaKr), language),
                    currency: config.currency,
                  })}
                </Text>
                <Text style={styles.breakdownEstimateHint}>
                  {t('stats.whatIfBasis', { kwh: baseMonthlyKwh })}
                  {estimatedMonthlyKwh === null ? ` ${t('stats.whatIfGenericEstimateHint')}` : ''}
                </Text>
              </>
            ) : (
              <Text style={styles.empty}>{t('forecast.noPrices')}</Text>
            )}
          </Card>

          <Text style={styles.sectionTitle}>{t('stats.zoneComparison')}</Text>
          <Card style={styles.sectionCard}>
            {zoneAveragesLoading ? (
              <ActivityIndicator color={theme.colors.accentPurple} />
            ) : (
              (zoneAverages ?? []).map((z, i) => (
                <View key={z.zone} style={i > 0 ? styles.zoneRowDivider : undefined}>
                  <View style={styles.zoneRow}>
                    <Chip label={z.zone} variant={z.zone === zone ? 'amber' : 'neutral'} selected={z.zone === zone} />
                    <Text style={styles.zonePrice}>{formatOre(z.avgPrice, language)} öre/kWh</Text>
                  </View>
                </View>
              ))
            )}
          </Card>

          <Text style={styles.sectionTitle}>{t('stats.consumptionTrend')}</Text>
          <Card style={styles.sectionCard}>
            <InfoRow icon={IconClockHour4} title={t('stats.comingSoonTitle')} subtitle={t('stats.comingSoonSubtitle')} />
          </Card>
        </>
      )}
    </ScrollView>
  );
}

function BreakdownRow({
  label,
  value,
  language,
  bold,
  isEstimate,
}: {
  label: string;
  value: number;
  language: SupportedLanguage;
  bold?: boolean;
  isEstimate?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <View style={styles.breakdownRow}>
      <View style={styles.breakdownLabelBlock}>
        <Text style={[styles.breakdownLabel, bold && styles.breakdownLabelBold]}>{label}</Text>
        {isEstimate && <Text style={styles.breakdownEstimateHint}>{t('stats.estimateZero')}</Text>}
      </View>
      <Text style={[styles.breakdownValue, bold && styles.breakdownValueBold]}>{formatOre(value, language)} öre</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingTop: 60, paddingBottom: 40 },
  title: { fontFamily: theme.typography.display, fontSize: theme.type.xl, color: theme.colors.textPrimary },
  subtitle: { fontFamily: theme.typography.body, fontSize: theme.type.sm, color: theme.colors.textMuted, marginTop: 4, marginBottom: 20 },
  sectionTitle: { fontFamily: theme.typography.displayMedium, fontSize: theme.type.md, color: theme.colors.textPrimary, marginTop: 20, marginBottom: 10 },
  sectionCard: { marginBottom: 4 },
  empty: { fontFamily: theme.typography.body, fontSize: theme.type.sm, color: theme.colors.textMuted },
  breakdownRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 6, gap: 12 },
  breakdownLabelBlock: { flex: 1 },
  breakdownLabel: { fontFamily: theme.typography.body, fontSize: theme.type.sm, color: theme.colors.textSecondary },
  breakdownLabelBold: { fontFamily: theme.typography.displayMedium, color: theme.colors.textPrimary },
  breakdownEstimateHint: { fontFamily: theme.typography.body, fontSize: theme.type.xs, color: theme.colors.accentAmberDeep, marginTop: 2 },
  breakdownValue: {
    fontFamily: theme.typography.body,
    fontSize: theme.type.sm,
    color: theme.colors.textPrimary,
    fontVariant: ['tabular-nums'],
    flexShrink: 0,
  },
  breakdownValueBold: { fontFamily: theme.typography.displayMedium, fontSize: theme.type.md },
  breakdownDivider: { height: 1, backgroundColor: theme.colors.borderMuted, marginVertical: 8 },
  contractHealthHero: { fontFamily: theme.typography.display, fontSize: theme.type.xl, color: theme.colors.textPrimary },
  contractHealthResult: { fontFamily: theme.typography.body, fontSize: theme.type.sm, color: theme.colors.textSecondary, marginTop: 4 },
  whatIfStepperLabel: { fontFamily: theme.typography.bodyMedium, fontSize: theme.type.sm, color: theme.colors.textSecondary, marginBottom: 8 },
  whatIfStepperLabelSpaced: { marginTop: 16 },
  whatIfStepperRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 16 },
  whatIfPerMonth: { fontFamily: theme.typography.body, fontSize: theme.type.sm, color: theme.colors.textMuted },
  zoneRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  zoneRowDivider: { borderTopWidth: 1, borderTopColor: theme.colors.borderMuted },
  zonePrice: { fontFamily: theme.typography.displayMedium, fontSize: theme.type.sm, color: theme.colors.textPrimary },
});
