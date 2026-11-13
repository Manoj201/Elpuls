import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  IconAlertTriangle,
  IconCalculator,
  IconChevronDown,
  IconChevronUp,
  IconCloud,
  IconFlame,
  IconListCheck,
  IconReceipt,
  IconShare,
  IconSnowflake,
  IconSparkles,
  IconSun,
  IconWind,
} from '@tabler/icons-react-native';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { useCountryStore } from '../stores/useCountryStore';
import { usePriceStore } from '../stores/usePriceStore';
import { useWeatherStore } from '../stores/useWeatherStore';
import { useUserStore } from '../stores/useUserStore';
import { useApplianceStore } from '../stores/useApplianceStore';
import { findCurrentPrice, findExtremeHours, groupPricesByHour } from '../lib/priceUtils';
import { assessPriceRisk, type PriceRiskAssessment, type PriceRiskFactor } from '../lib/priceRisk';
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
import { AiNote } from '../components/AiNote';
import { Card } from '../components/Card';
import { Chip, type ChipVariant } from '../components/Chip';
import { InfoRow } from '../components/InfoRow';
import { PriceDial } from '../components/PriceDial';
import { PriceBar } from '../components/PriceBar';
import { ComparisonCard } from '../components/ComparisonCard';
import { PrimaryButton } from '../components/PrimaryButton';
import { ProLockedCard } from '../components/ProLockedCard';
import { SecondaryButton } from '../components/SecondaryButton';
import { SetupChecklist, type SetupStep } from '../components/SetupChecklist';
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
  uid: string;
  onOpenKostnadskoll: () => void;
  onOpenApplianceRecommendations: () => void;
  /** Opens the bill scan; `manual` goes straight to typing the numbers in. */
  onOpenBillScan: (manual?: boolean) => void;
  onOpenApplianceScan: () => void;
  onOpenSettings: () => void;
}

export function HomeScreen({
  uid,
  onOpenKostnadskoll,
  onOpenApplianceRecommendations,
  onOpenBillScan,
  onOpenApplianceScan,
  onOpenSettings,
}: HomeScreenProps) {
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
  const priceAlertHighThresholdOre = useUserStore((s) => s.priceAlertHighThresholdOre);
  const priceAlertLowEnabled = useUserStore((s) => s.priceAlertLowEnabled);
  const setupDismissedAt = useUserStore((s) => s.setupDismissedAt);
  const dismissSetup = useUserStore((s) => s.dismissSetup);
  const hasEv = useUserStore((s) => s.hasEv);
  const heatingType = useUserStore((s) => s.heatingType);
  const appliances = useApplianceStore((s) => s.appliances);
  const fetchAppliances = useApplianceStore((s) => s.fetchAppliances);

  const [comparison, setComparison] = useState<ZoneComparison | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  const [showLanded, setShowLanded] = useState(false);
  const [zonePickerOpen, setZonePickerOpen] = useState(false);
  const comparisonCardRef = useRef<View>(null);

  const hasGridFee = gridFeeVariableSekPerKwh !== null;
  const heatsWithElectricity = heatingType === 'electric' || heatingType === 'heat_pump';

  useEffect(() => {
    fetchPrices(zone);
  }, [fetchPrices, zone]);

  useEffect(() => {
    const point = zoneReferencePoints[zone];
    if (point) fetchForecast(point.lat, point.lon);
  }, [fetchForecast, zone]);

  useEffect(() => {
    fetchAppliances(uid);
  }, [fetchAppliances, uid]);

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
  const landedActive = showLanded && hasGridFee;
  const displayPrices = useMemo(() => {
    if (!landedActive || gridFeeVariableSekPerKwh === null) return hourlyPrices;
    return hourlyPrices.map((p) => ({
      ...p,
      price: calculateLandedPrice(p.price, gridFeeVariableSekPerKwh, retailerMarkupSekPerKwh),
    }));
  }, [hourlyPrices, landedActive, gridFeeVariableSekPerKwh, retailerMarkupSekPerKwh]);

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

  const setupSteps: SetupStep[] = [
    {
      id: 'gridFee',
      title: t('setup.gridFeeTitle'),
      subtitle: t('setup.gridFeeSubtitle'),
      done: hasGridFee,
      onPress: () => onOpenBillScan(),
    },
    {
      id: 'markup',
      title: t('setup.markupTitle'),
      subtitle: t('setup.markupSubtitle'),
      done: retailerMarkupSekPerKwh !== null,
      onPress: () => onOpenBillScan(),
    },
    {
      id: 'appliance',
      title: t('setup.applianceTitle'),
      subtitle: t('setup.applianceSubtitle'),
      done: appliances.length > 0,
      onPress: onOpenApplianceScan,
    },
    {
      id: 'alerts',
      title: t('setup.alertsTitle'),
      subtitle: t('setup.alertsSubtitle'),
      done: priceAlertHighThresholdOre !== null || priceAlertLowEnabled,
      onPress: onOpenSettings,
    },
  ];
  const showSetup = setupDismissedAt === null && setupSteps.some((s) => !s.done);

  function riskFactorText(factor: PriceRiskFactor): string {
    const value = factor.value.toFixed(1).replace('.', language === 'sv' ? ',' : '.');
    return t(`home.riskFactors.${factor.kind}`, { value });
  }

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
      <View style={styles.centered} accessibilityLabel={t('home.loading')}>
        <ActivityIndicator size="large" color={theme.colors.accentAmber} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>{t('home.loadFailed')}</Text>
        <View style={styles.retryButton}>
          <SecondaryButton label={t('app.retry')} onPress={() => fetchPrices(zone)} />
        </View>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Header: wordmark, the zone you're looking at (tap to switch), share. */}
      <View style={styles.header}>
        <Text style={styles.wordmark} accessibilityRole="header">
          Elpuls
        </Text>
        <View style={styles.headerRight}>
          <Pressable
            onPress={() => setZonePickerOpen((open) => !open)}
            style={styles.zoneButton}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={t('home.zoneButtonLabel', { zone })}
            accessibilityState={{ expanded: zonePickerOpen }}
          >
            <View style={styles.zoneDot} />
            <Text style={styles.zoneButtonText}>{zone}</Text>
            {zonePickerOpen ? (
              <IconChevronUp size={16} color={theme.colors.textSecondary} />
            ) : (
              <IconChevronDown size={16} color={theme.colors.textSecondary} />
            )}
          </Pressable>
          <Pressable
            onPress={handleShare}
            disabled={isSharing}
            accessibilityRole="button"
            accessibilityLabel={t('home.share.buttonLabel')}
            hitSlop={12}
            style={styles.iconButton}
          >
            {isSharing ? (
              <ActivityIndicator size="small" color={theme.colors.textSecondary} />
            ) : (
              <IconShare size={22} color={theme.colors.textSecondary} />
            )}
          </Pressable>
        </View>
      </View>

      {zonePickerOpen && (
        <View style={styles.zonePicker}>
          <Text style={styles.zonePickerHint}>{t('home.zonePickerHint')}</Text>
          <View style={styles.zoneRow}>
            {zones.map((z) => (
              <Chip
                key={z}
                label={z}
                selected={z === zone}
                onPress={() => {
                  setZone(z);
                  setZonePickerOpen(false);
                }}
              />
            ))}
          </View>
        </View>
      )}

      <TrialBanner />

      {hourlyPrices.length === 0 ? (
        <Card style={styles.sectionCard}>
          <Text style={styles.emptyTitle}>{t('home.noPricesYet')}</Text>
          <Text style={styles.emptyText}>{t('home.noPricesHint')}</Text>
        </Card>
      ) : (
        <>
          {/* Today: the price right now, today's cheapest and dearest hour,
              and the spot / "what you pay" switch. */}
          {currentPrice && cheapest && priciest && (
            <Card style={styles.todayCard}>
              <View
                style={styles.priceToggleRow}
                accessibilityRole="radiogroup"
                accessibilityLabel={t('home.priceToggleLabel')}
              >
                <Chip label={t('home.priceToggleSpot')} selected={!showLanded} onPress={() => setShowLanded(false)} />
                <Chip label={t('home.priceToggleLanded')} selected={showLanded} onPress={() => setShowLanded(true)} />
              </View>

              {showLanded && !hasGridFee ? (
                <View style={styles.landedPrompt}>
                  <InfoRow
                    icon={IconReceipt}
                    variant="teal"
                    title={t('home.landedPromptTitle')}
                    subtitle={t('home.landedPromptText')}
                  />
                  <View style={styles.promptActions}>
                    <PrimaryButton size="compact" style={styles.promptAction} label={t('home.landedPromptScan')} onPress={() => onOpenBillScan()} />
                    <SecondaryButton size="compact" style={styles.promptAction} label={t('home.landedPromptManual')} onPress={() => onOpenBillScan(true)} />
                  </View>
                </View>
              ) : (
                <>
                  {landedActive && (
                    <Text style={styles.landedCaption}>
                      {t(retailerMarkupSekPerKwh === null ? 'home.landedEstimateCaption' : 'home.landedExactCaption')}
                    </Text>
                  )}

                  <View style={styles.dialSection}>
                    <PriceDial value={currentPrice.price} min={cheapest.price} max={priciest.price} />
                    <Text style={styles.heroPrice} accessibilityLabel={t('home.priceNowA11y', { price: formatOre(currentPrice.price, language) })}>
                      {formatOre(currentPrice.price, language)}
                    </Text>
                    <Text style={styles.heroUnit}>{t(landedActive ? 'home.priceUnitLanded' : 'home.priceUnitNow')}</Text>
                    <Chip
                      label={
                        currentPrice.price < averagePrice
                          ? t('home.belowAverage')
                          : currentPrice.price > averagePrice
                            ? t('home.aboveAverage')
                            : t('home.aroundAverage')
                      }
                      variant={currentPrice.price <= averagePrice ? 'teal' : 'amber'}
                      style={styles.averageChip}
                    />
                  </View>

                  <View style={styles.statsRow}>
                    <View style={styles.statBlock}>
                      <Text style={[styles.statLabel, { color: theme.colors.positiveTealDeep }]}>{t('common.cheapest')}</Text>
                      <Text style={styles.statPrice}>{formatOre(cheapest.price, language)} öre</Text>
                      <Text style={styles.statHour}>{t('home.atHour', { hour: cheapest.hour.getHours() })}</Text>
                    </View>
                    <View style={styles.statDivider} />
                    <View style={styles.statBlock}>
                      <Text style={[styles.statLabel, { color: theme.colors.dangerEmberDeep }]}>{t('common.priciest')}</Text>
                      <Text style={styles.statPrice}>{formatOre(priciest.price, language)} öre</Text>
                      <Text style={styles.statHour}>{t('home.atHour', { hour: priciest.hour.getHours() })}</Text>
                    </View>
                  </View>

                  {risk && (
                    <View style={styles.tipRow}>
                      <InfoRow
                        icon={IconAlertTriangle}
                        variant={RISK_VARIANT[risk.level]}
                        title={
                          risk.level === 'low' ? t('home.normalRisk') : risk.level === 'high' ? t('home.higherRisk') : t('home.elevatedRisk')
                        }
                        subtitle={risk.factors.length > 0 ? risk.factors.map(riskFactorText).join(' · ') : undefined}
                      />
                    </View>
                  )}
                </>
              )}
            </Card>
          )}

          {showSetup && (
            <View style={styles.sectionCard}>
              <SetupChecklist steps={setupSteps} onDismiss={dismissSetup} />
            </View>
          )}

          {/* Quick actions: the two tools people use before switching something on. */}
          <View style={styles.tilesRow}>
            <Pressable
              style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
              onPress={onOpenKostnadskoll}
              accessibilityRole="button"
              accessibilityLabel={`${t('home.openKostnadskollTitle')}. ${t('home.openKostnadskollSubtitle')}`}
            >
              <IconCalculator size={26} color={theme.colors.accentPurpleDeep} />
              <Text style={styles.tileTitle}>{t('home.openKostnadskollTitle')}</Text>
              <Text style={styles.tileText}>{t('home.openKostnadskollSubtitle')}</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
              onPress={onOpenApplianceRecommendations}
              accessibilityRole="button"
              accessibilityLabel={`${t('home.openApplianceRecommendationsTitle')}. ${t('home.openApplianceRecommendationsSubtitle')}`}
            >
              <IconListCheck size={26} color={theme.colors.accentPurpleDeep} />
              <Text style={styles.tileTitle}>{t('home.openApplianceRecommendationsTitle')}</Text>
              <Text style={styles.tileText}>{t('home.openApplianceRecommendationsSubtitle')}</Text>
            </Pressable>
          </View>

          <Text style={styles.sectionTitle} accessibilityRole="header">
            {t('home.hourlyTitle')}
          </Text>
          <PriceBar prices={displayPrices} highlightHour={currentPrice?.hour ?? null} />

          <Text style={styles.sectionTitle} accessibilityRole="header">
            {t('home.explainerTitle')}
          </Text>
          {isProSubscriber ? (
            <Card style={styles.sectionCard}>
              {explainer.isLoading ? (
                <ActivityIndicator color={theme.colors.textSecondary} accessibilityLabel={t('home.loading')} />
              ) : explainer.text ? (
                <>
                  <View style={styles.explainerHeader}>
                    <IconCloud size={20} color={theme.colors.accentPurpleDeep} />
                    <Text style={styles.explainerText}>{explainer.text}</Text>
                  </View>
                  <AiNote kind="explainer" />
                </>
              ) : (
                <Text style={styles.emptyText}>{t('home.explainerNotReady')}</Text>
              )}
            </Card>
          ) : (
            <View style={styles.sectionCard}>
              <ProLockedCard
                icon={IconSparkles}
                title={t('home.explainerLockedTitle')}
                subtitle={t('home.explainerLockedText')}
                source="explainer"
                preview={<Text style={styles.previewText}>{t('home.explainerSample')}</Text>}
              />
            </View>
          )}

          {isProSubscriber ? (
            <>
              <Text style={styles.sectionTitle} accessibilityRole="header">
                {t('home.proTipsTitle')}
              </Text>
              {heatsWithElectricity && (
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
              )}
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
              <Text style={styles.subSectionTitle}>{t('home.solarBonusHours')}</Text>
              <SolarBonusCard bonusHours={bonusHours} language={language} />
            </>
          ) : (
            <View style={styles.proTipsLocked}>
              <ProLockedCard
                icon={IconSparkles}
                title={t('home.proTipsLockedTitle')}
                subtitle={t('home.proTipsLockedText')}
                source="proTips"
                preview={
                  <View style={styles.previewList}>
                    {heatsWithElectricity && (
                      <InfoRow icon={IconFlame} variant="amber" title={t('heatingPlan.title')} subtitle={t('home.proTipsSampleHeating')} />
                    )}
                    <InfoRow icon={IconSnowflake} variant="amber" title={t('weatherPrep.title')} subtitle={t('home.proTipsSampleWeather')} />
                    <InfoRow icon={IconSun} variant="teal" title={t('home.solarBonusHours')} subtitle={t('home.proTipsSampleSolar')} />
                  </View>
                }
              />
            </View>
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
  container: { padding: 16, paddingTop: 60, paddingBottom: 32 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  retryButton: { alignSelf: 'stretch' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  wordmark: { fontFamily: theme.typography.display, fontSize: theme.type.xl, color: theme.colors.textPrimary },
  zoneButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: `${theme.colors.positiveTeal}33`,
    backgroundColor: theme.colors.positiveTealSoft,
  },
  zoneDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.positiveTeal },
  zoneButtonText: { fontFamily: theme.typography.bodyMedium, fontSize: theme.type.md, color: theme.colors.positiveTealDeep },
  iconButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  zonePicker: { marginBottom: 16 },
  zonePickerHint: { fontFamily: theme.typography.body, fontSize: theme.type.sm, color: theme.colors.textSecondary, marginBottom: 8 },
  zoneRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  hiddenCard: { position: 'absolute', top: -9999, left: -9999 },
  todayCard: { marginBottom: 16, backgroundColor: theme.colors.surfaceElevated },
  priceToggleRow: { flexDirection: 'row', gap: 8, marginBottom: 12, flexWrap: 'wrap' },
  landedPrompt: { gap: 14, paddingVertical: 8 },
  // Two equal compact buttons side by side, 8pt apart (touch-spacing).
  promptActions: { flexDirection: 'row', gap: 8 },
  promptAction: { flex: 1, alignSelf: 'stretch' },
  landedCaption: { fontFamily: theme.typography.body, fontSize: theme.type.sm, lineHeight: 20, color: theme.colors.textSecondary, marginBottom: 8 },
  dialSection: { alignItems: 'center', marginBottom: 20 },
  heroPrice: { fontFamily: theme.typography.display, fontSize: theme.type.display, color: theme.colors.textPrimary, marginTop: 8 },
  heroUnit: { fontFamily: theme.typography.bodyMedium, fontSize: theme.type.sm, color: theme.colors.textSecondary, marginTop: 2, marginBottom: 12, textAlign: 'center' },
  averageChip: { alignSelf: 'center' },
  statsRow: { flexDirection: 'row', alignItems: 'center' },
  statBlock: { flex: 1, alignItems: 'center' },
  statDivider: { width: 1, height: 44, backgroundColor: theme.colors.borderMuted },
  statLabel: { fontFamily: theme.typography.bodyMedium, fontSize: theme.type.sm },
  statPrice: { fontFamily: theme.typography.display, fontSize: theme.type.lg, color: theme.colors.textPrimary, marginTop: 4 },
  statHour: { fontFamily: theme.typography.body, fontSize: theme.type.sm, color: theme.colors.textSecondary, marginTop: 2 },
  tipRow: { borderTopWidth: 1, borderTopColor: theme.colors.borderMuted, marginTop: 16, paddingTop: 16 },
  sectionCard: { marginBottom: 16 },
  tilesRow: { flexDirection: 'row', gap: 12, marginBottom: 8 },
  tile: {
    flex: 1,
    gap: 6,
    padding: 16,
    minHeight: 112,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  pressed: { opacity: 0.7 },
  tileTitle: { fontFamily: theme.typography.display, fontSize: theme.type.md, color: theme.colors.textPrimary, marginTop: 4 },
  tileText: { fontFamily: theme.typography.body, fontSize: theme.type.sm, lineHeight: 20, color: theme.colors.textSecondary },
  explainerHeader: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  explainerText: { flex: 1, fontFamily: theme.typography.body, fontSize: theme.type.md, lineHeight: 24, color: theme.colors.textPrimary },
  previewText: { fontFamily: theme.typography.body, fontSize: theme.type.sm, lineHeight: 20, color: theme.colors.textPrimary },
  previewList: { gap: 12 },
  proTipsLocked: { marginTop: 8, marginBottom: 16 },
  emptyTitle: { fontFamily: theme.typography.bodyMedium, fontSize: theme.type.md, color: theme.colors.textPrimary },
  emptyText: { fontFamily: theme.typography.body, fontSize: theme.type.sm, lineHeight: 20, color: theme.colors.textSecondary, marginTop: 4 },
  error: { fontFamily: theme.typography.body, fontSize: theme.type.md, color: theme.colors.dangerEmber, textAlign: 'center' },
  sectionTitle: { fontFamily: theme.typography.display, fontSize: theme.type.lg, color: theme.colors.textPrimary, marginTop: 24, marginBottom: 12 },
  subSectionTitle: { fontFamily: theme.typography.displayMedium, fontSize: theme.type.md, color: theme.colors.textPrimary, marginTop: 8, marginBottom: 10 },
});
