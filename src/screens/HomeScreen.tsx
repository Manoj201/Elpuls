import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  IconAlertTriangle,
  IconCalculator,
  IconCloud,
  IconFlame,
  IconListCheck,
  IconShare,
  IconSnowflake,
  IconWind,
} from '@tabler/icons-react-native';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { useCountryStore } from '../stores/useCountryStore';
import { usePriceStore } from '../stores/usePriceStore';
import { useWeatherStore } from '../stores/useWeatherStore';
import { useUserStore } from '../stores/useUserStore';
import { findCurrentPrice, findExtremeHours, groupPricesByHour } from '../lib/priceUtils';
import { assessPriceRisk, type PriceRiskAssessment } from '../lib/priceRisk';
import { findWeatherPrepTip } from '../lib/weatherPrep';
import { findHeatingPlan } from '../lib/heatingPlan';
import { writeWidgetSnapshot } from '../lib/widgetBridge';
import { estimateSolarPotential } from '../lib/solarPotential';
import { findSolarBonusHours } from '../lib/solarBonusHours';
import { compareToOtherZones, type ZoneComparison } from '../lib/zoneComparison';
import { calculateLandedPrice } from '../lib/landedCost';
import { zoneReferencePoints } from '../config/zoneReferencePoints';
import { useExplainer } from '../hooks/useExplainer';
import { theme } from '../theme';
import { formatOre } from '../lib/formatNumber';
import type { SupportedLanguage } from '../i18n';
import { Card } from '../components/Card';
import { Chip, type ChipVariant } from '../components/Chip';
import { InfoRow } from '../components/InfoRow';
import { PriceDial } from '../components/PriceDial';
import { PriceBar } from '../components/PriceBar';
import { ComparisonCard } from '../components/ComparisonCard';
import { ProLockedCard } from '../components/ProLockedCard';
import { SolarBonusCard } from '../components/SolarBonusCard';
import { TrialBanner } from '../components/TrialBanner';

const RISK_VARIANT: Record<PriceRiskAssessment['level'], ChipVariant> = {
  low: 'teal',
  medium: 'amber',
  high: 'danger',
};

const WEATHER_PREP_ICON = {
  coldSnapEv: IconSnowflake,
  coldSnapGeneric: IconSnowflake,
  dryingWindow: IconWind,
} as const;

interface HomeScreenProps {
  onOpenKostnadskoll: () => void;
  onOpenApplianceRecommendations: () => void;
}

export function HomeScreen({ onOpenKostnadskoll, onOpenApplianceRecommendations }: HomeScreenProps) {
  const { t, i18n } = useTranslation();
  const language = i18n.language as SupportedLanguage;
  const { todayPrices, isLoading, error, fetchPrices } = usePriceStore();
  const { forecast, fetchForecast } = useWeatherStore();
  const zone = useCountryStore((s) => s.zone);
  const setZone = useCountryStore((s) => s.setZone);
  const config = useCountryStore((s) => s.config);
  const zones = config.zones;
  const gridFeeVariableSekPerKwh = useUserStore((s) => s.gridFeeVariableSekPerKwh);
  const isProSubscriber = useUserStore((s) => s.isProSubscriber);
  const retailerMarkupSekPerKwh = useUserStore((s) => s.retailerMarkupSekPerKwh);
  const hasEv = useUserStore((s) => s.hasEv);
  const heatingType = useUserStore((s) => s.heatingType);

  const [comparison, setComparison] = useState<ZoneComparison | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  const [showLanded, setShowLanded] = useState(false);
  const comparisonCardRef = useRef<View>(null);

  useEffect(() => {
    fetchPrices(zone);
  }, [fetchPrices, zone]);

  useEffect(() => {
    const point = zoneReferencePoints[zone];
    if (point) fetchForecast(point.lat, point.lon);
  }, [fetchForecast, zone]);

  const risk = useMemo(() => assessPriceRisk(forecast, new Date()), [forecast]);
  const weatherPrepTip = useMemo(() => findWeatherPrepTip(forecast, new Date(), hasEv), [forecast, hasEv]);
  const explainer = useExplainer(zone);

  const hourlyPrices = useMemo(() => groupPricesByHour(todayPrices), [todayPrices]);
  const heatingPlan = useMemo(() => findHeatingPlan(hourlyPrices), [hourlyPrices]);

  // The free home-screen widget always shows raw spot öre/kWh, independent
  // of the in-app landed-cost toggle below — it's a background sync, not
  // tied to whatever view state this screen happens to be in.
  const widgetCurrentPrice = useMemo(() => findCurrentPrice(hourlyPrices, new Date()), [hourlyPrices]);
  const widgetAveragePrice = useMemo(
    () => (hourlyPrices.length > 0 ? hourlyPrices.reduce((s, p) => s + p.price, 0) / hourlyPrices.length : null),
    [hourlyPrices],
  );

  useEffect(() => {
    if (!widgetCurrentPrice || widgetAveragePrice === null) return;
    const trendArrow = widgetCurrentPrice.price > widgetAveragePrice ? 'up' : widgetCurrentPrice.price < widgetAveragePrice ? 'down' : 'flat';
    writeWidgetSnapshot({
      priceOre: Math.round(widgetCurrentPrice.price * 100),
      trendArrow,
      updatedAt: new Date().toISOString(),
    });
  }, [widgetCurrentPrice, widgetAveragePrice]);

  // Landed price is an affine transform of spot (same +C, ×1.25 on every
  // hour), so cheapest/priciest never reshuffle between views — only the
  // displayed numbers change. Solar bonus hours stay on spot (below).
  const displayPrices = useMemo(() => {
    if (!showLanded || gridFeeVariableSekPerKwh === null) return hourlyPrices;
    return hourlyPrices.map((p) => ({
      ...p,
      price: calculateLandedPrice(p.price, gridFeeVariableSekPerKwh, retailerMarkupSekPerKwh),
    }));
  }, [hourlyPrices, showLanded, gridFeeVariableSekPerKwh, retailerMarkupSekPerKwh]);

  const { cheapest, priciest } = useMemo(() => findExtremeHours(displayPrices), [displayPrices]);
  const currentPrice = useMemo(() => findCurrentPrice(displayPrices, new Date()), [displayPrices]);
  const averagePrice = useMemo(
    () => (displayPrices.length > 0 ? displayPrices.reduce((s, p) => s + p.price, 0) / displayPrices.length : 0),
    [displayPrices],
  );
  // Kept separate from `averagePrice` (which follows the landed toggle):
  // compareToOtherZones fetches other zones' raw spot prices, so the
  // comparison must stay spot-vs-spot regardless of what's displayed.
  const spotAveragePrice = useMemo(
    () => (hourlyPrices.length > 0 ? hourlyPrices.reduce((s, p) => s + p.price, 0) / hourlyPrices.length : 0),
    [hourlyPrices],
  );

  const solarPotential = useMemo(() => {
    const point = zoneReferencePoints[zone];
    return point ? estimateSolarPotential(forecast, point.lat, point.lon) : [];
  }, [forecast, zone]);
  const bonusHours = useMemo(
    () => findSolarBonusHours(hourlyPrices, solarPotential),
    [hourlyPrices, solarPotential],
  );

  // Once a comparison is computed, the ComparisonCard mounts off-screen
  // (below) with real content; this effect waits for that render to commit,
  // captures it as an image, and opens the native share sheet. Failures are
  // logged only — this is a nice-to-have growth feature, not core
  // functionality, and shouldn't be able to break the main screen.
  useEffect(() => {
    if (!comparison) return;
    let cancelled = false;

    (async () => {
      try {
        const uri = await captureRef(comparisonCardRef, { format: 'png', quality: 1 });
        if (cancelled) return;
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: t('home.share.dialogTitle') });
        }
      } catch (err) {
        console.log('Share failed:', err);
      } finally {
        if (!cancelled) {
          setComparison(null);
          setIsSharing(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [comparison, t]);

  async function handleShare() {
    if (isSharing || hourlyPrices.length === 0) return;
    setIsSharing(true);
    try {
      const result = await compareToOtherZones({
        priceProvider: config.priceProvider,
        yourZone: zone,
        yourAvgPrice: spotAveragePrice,
        currency: hourlyPrices[0].currency,
        allZones: zones,
        date: new Date(),
      });
      if (!result) {
        setIsSharing(false);
        return;
      }
      setComparison(result);
    } catch (err) {
      console.log('Comparison fetch failed:', err);
      setIsSharing(false);
    }
  }

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.colors.accentAmber} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Text style={styles.wordmark}>Elpuls</Text>
        <View style={styles.headerRightTop}>
          <Chip label={zone} dot variant="teal" />
          <Pressable
            onPress={handleShare}
            disabled={isSharing}
            accessibilityLabel={t('home.share.buttonLabel')}
            hitSlop={8}
          >
            {isSharing ? (
              <ActivityIndicator size="small" color={theme.colors.textSecondary} />
            ) : (
              <IconShare size={20} color={theme.colors.textSecondary} />
            )}
          </Pressable>
        </View>
      </View>

      <View style={styles.zoneRow}>
        {zones.map((z) => (
          <Chip key={z} label={z} selected={z === zone} onPress={() => setZone(z)} />
        ))}
      </View>

      <TrialBanner />

      {hourlyPrices.length === 0 ? (
        <Text style={styles.empty}>{t('home.noPricesYet')}</Text>
      ) : (
        <>
          {/* "Today" card — everything glanceable at a glance, no scroll needed:
              current price, cheapest/peak hour, and one actionable tip. */}
          {currentPrice && cheapest && priciest && (
            <Card style={styles.todayCard}>
              <View style={styles.todayHeaderRow}>
                <Text style={styles.todayLabel}>{t('home.todayLabel')}</Text>
                {gridFeeVariableSekPerKwh !== null && (
                  <View style={styles.priceToggleRow}>
                    <Chip
                      label={t('home.priceToggleSpot')}
                      selected={!showLanded}
                      onPress={() => setShowLanded(false)}
                    />
                    <Chip
                      label={t('home.priceToggleLanded')}
                      selected={showLanded}
                      onPress={() => setShowLanded(true)}
                    />
                  </View>
                )}
              </View>

              {showLanded && retailerMarkupSekPerKwh === null && (
                <Text style={styles.landedEstimateCaption}>{t('home.landedEstimateCaption')}</Text>
              )}

              <View style={styles.dialSection}>
                <PriceDial value={currentPrice.price} min={cheapest.price} max={priciest.price} />
                <Text style={styles.heroPrice}>{formatOre(currentPrice.price, language)}</Text>
                <Text style={styles.heroUnit}>{t('home.priceUnitNow')}</Text>
                <View style={styles.averageChipWrapper}>
                  <Chip
                    label={
                      currentPrice.price < averagePrice
                        ? t('home.belowAverage')
                        : currentPrice.price > averagePrice
                          ? t('home.aboveAverage')
                          : t('home.aroundAverage')
                    }
                    variant={currentPrice.price <= averagePrice ? 'teal' : 'amber'}
                  />
                </View>
              </View>

              <View style={styles.statsRow}>
                <View style={styles.statBlock}>
                  <Text style={[styles.statLabel, { color: theme.colors.positiveTealDeep }]}>{t('common.cheapest')}</Text>
                  <Text style={styles.statPrice}>{formatOre(cheapest.price, language)} öre</Text>
                  <Text style={styles.statHour}>{cheapest.hour.getHours()}:00</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statBlock}>
                  <Text style={[styles.statLabel, { color: theme.colors.dangerEmberDeep }]}>{t('common.priciest')}</Text>
                  <Text style={styles.statPrice}>{formatOre(priciest.price, language)} öre</Text>
                  <Text style={styles.statHour}>{priciest.hour.getHours()}:00</Text>
                </View>
              </View>

              {risk && (
                <View style={styles.tipRow}>
                  <InfoRow
                    icon={IconAlertTriangle}
                    variant={RISK_VARIANT[risk.level]}
                    title={risk.level === 'low' ? t('home.normalRisk') : risk.level === 'high' ? t('home.higherRisk') : t('home.elevatedRisk')}
                    subtitle={risk.factors.length > 0 ? risk.factors.join(' · ') : undefined}
                  />
                </View>
              )}
            </Card>
          )}

          {isProSubscriber ? (
            explainer.text && (
              <Card style={styles.sectionCard}>
                <InfoRow icon={IconCloud} title={t('home.explainerTitle')} subtitle={explainer.text} />
              </Card>
            )
          ) : (
            <View style={styles.sectionCard}>
              <ProLockedCard title={t('home.explainerTitle')} subtitle={t('paywall.lockedExplainerSubtitle')} />
            </View>
          )}

          {!isProSubscriber ? (
            <View style={styles.sectionCard}>
              <ProLockedCard title={t('weatherPrep.title')} subtitle={t('paywall.lockedWeatherPrepSubtitle')} />
            </View>
          ) : (
            <Card style={styles.sectionCard}>
              <InfoRow
                icon={weatherPrepTip ? WEATHER_PREP_ICON[weatherPrepTip.type] : IconSnowflake}
                variant={weatherPrepTip?.type === 'dryingWindow' ? 'teal' : weatherPrepTip ? 'amber' : 'neutral'}
                title={t('weatherPrep.title')}
                subtitle={
                  weatherPrepTip
                    ? t(`weatherPrep.${weatherPrepTip.type}`, { start: weatherPrepTip.startHour, end: weatherPrepTip.endHour })
                    : t('weatherPrep.noTip')
                }
              />
            </Card>
          )}

          {(heatingType === 'electric' || heatingType === 'heat_pump') &&
            (!isProSubscriber ? (
              <View style={styles.sectionCard}>
                <ProLockedCard title={t('heatingPlan.title')} subtitle={t('paywall.lockedHeatingPlanSubtitle')} />
              </View>
            ) : (
              <Card style={styles.sectionCard}>
                <InfoRow
                  icon={IconFlame}
                  variant={heatingPlan ? 'amber' : 'neutral'}
                  title={t('heatingPlan.title')}
                  subtitle={
                    heatingPlan
                      ? t('heatingPlan.advisory', {
                          bankStart: heatingPlan.bankStartHour,
                          bankEnd: heatingPlan.bankEndHour,
                          coastStart: heatingPlan.coastStartHour,
                          coastEnd: heatingPlan.coastEndHour,
                        })
                      : t('heatingPlan.noPlanToday')
                  }
                />
              </Card>
            ))}

          <Pressable onPress={onOpenKostnadskoll}>
            <Card style={styles.sectionCard}>
              <InfoRow
                icon={IconCalculator}
                title={t('home.openKostnadskollTitle')}
                subtitle={t('home.openKostnadskollSubtitle')}
              />
            </Card>
          </Pressable>

          <Pressable onPress={onOpenApplianceRecommendations}>
            <Card style={styles.sectionCard}>
              <InfoRow
                icon={IconListCheck}
                title={t('paywall.features.recommendations')}
                subtitle={t('home.openApplianceRecommendationsSubtitle')}
              />
            </Card>
          </Pressable>

          <Text style={styles.sectionTitle}>{t('home.hourlyTitle')}</Text>
          <PriceBar prices={displayPrices} highlightHour={currentPrice?.hour ?? null} />

          <Text style={styles.sectionTitle}>{t('home.solarBonusHours')}</Text>
          {isProSubscriber ? (
            <SolarBonusCard bonusHours={bonusHours} language={language} />
          ) : (
            <ProLockedCard title={t('home.solarBonusHours')} subtitle={t('paywall.lockedSolarBonusSubtitle')} />
          )}
        </>
      )}

      {comparison && (
        <View style={styles.hiddenCard} ref={comparisonCardRef} collapsable={false}>
          <ComparisonCard comparison={comparison} />
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingTop: 60 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  headerRightTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  hiddenCard: { position: 'absolute', top: -9999, left: -9999 },
  wordmark: { fontFamily: theme.typography.display, fontSize: 26, color: theme.colors.textPrimary },
  zoneRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  todayCard: { marginBottom: 16, backgroundColor: theme.colors.surfaceElevated },
  todayHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  todayLabel: {
    fontFamily: theme.typography.bodyMedium,
    fontSize: 12,
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  priceToggleRow: { flexDirection: 'row', gap: 6 },
  landedEstimateCaption: {
    fontFamily: theme.typography.body,
    fontSize: 12,
    color: theme.colors.textMuted,
    marginBottom: 12,
  },
  dialSection: { alignItems: 'center', marginBottom: 20 },
  averageChipWrapper: { alignItems: 'center' },
  heroPrice: { fontFamily: theme.typography.display, fontSize: 48, color: theme.colors.textPrimary, marginTop: 8 },
  heroUnit: {
    fontFamily: theme.typography.bodyMedium,
    fontSize: 11,
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 2,
    marginBottom: 12,
  },
  statsRow: { flexDirection: 'row', alignItems: 'center' },
  statBlock: { flex: 1, alignItems: 'center' },
  statDivider: { width: 1, height: 36, backgroundColor: theme.colors.borderMuted },
  statLabel: { fontFamily: theme.typography.bodyMedium, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 },
  statPrice: { fontFamily: theme.typography.display, fontSize: 16, color: theme.colors.textPrimary, marginTop: 4 },
  statHour: { fontFamily: theme.typography.body, fontSize: 12, color: theme.colors.textSecondary, marginTop: 2 },
  tipRow: { borderTopWidth: 1, borderTopColor: theme.colors.borderMuted, marginTop: 16, paddingTop: 16 },
  sectionCard: { marginBottom: 16 },
  empty: { fontFamily: theme.typography.body, fontSize: 15, color: theme.colors.textMuted },
  error: { fontFamily: theme.typography.body, fontSize: 15, color: theme.colors.dangerEmber },
  sectionTitle: { fontFamily: theme.typography.displayMedium, fontSize: 16, color: theme.colors.textPrimary, marginTop: 24, marginBottom: 10 },
});
