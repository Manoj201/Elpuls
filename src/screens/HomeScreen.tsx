import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  IconAlertTriangle,
  IconArrowDownRight,
  IconArrowUpRight,
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
import { findCheapestWindow, findCurrentPrice, findExtremeHours, groupPricesByHour } from '../lib/priceUtils';
import { getHouseholdAppliances, matchPresetId, resolveApplianceLabel } from '../lib/applianceDisplay';
import { useUiStore } from '../stores/useUiStore';
import { assessPriceRisk, type PriceRiskAssessment, type PriceRiskFactor } from '../lib/priceRisk';
import { findWeatherPrepTip } from '../lib/weatherPrep';
import { findHeatingPlan } from '../lib/heatingPlan';
import { writeWidgetSnapshot } from '../lib/widgetBridge';
import { getTimes } from 'suncalc';
import { estimateSolarPotential } from '../lib/solarPotential';
import { findSolarBonusHours } from '../lib/solarBonusHours';
import { compareToOtherZones, type ZoneComparison } from '../lib/zoneComparison';
import { calculateLandedPrice } from '../lib/landedCost';
import { zoneReferencePoints } from '../config/zoneReferencePoints';
import { useExplainer } from '../hooks/useExplainer';
import { theme } from '../theme';
import { formatClock, formatOre } from '../lib/formatNumber';
import type { SupportedLanguage } from '../i18n';
import { AiNote } from '../components/AiNote';
import { Card } from '../components/Card';
import { Chip, type ChipVariant } from '../components/Chip';
import { InfoRow } from '../components/InfoRow';
import { PriceDial } from '../components/PriceDial';
import { AnimatedNumber } from '../components/AnimatedNumber';
import { whenOf } from '../lib/whenLabel';
import { PriceChart, type BestTime } from '../components/PriceChart';
import { ComparisonCard } from '../components/ComparisonCard';
import { PrimaryButton } from '../components/PrimaryButton';
import { ProLockedCard } from '../components/ProLockedCard';
import { SecondaryButton } from '../components/SecondaryButton';
import { SetupChecklist, type SetupStep } from '../components/SetupChecklist';
import { SolarBonusCard } from '../components/SolarBonusCard';
import { TrialBanner } from '../components/TrialBanner';

/** Big hero number: whole öre from 10 up ("109"), one decimal below ("8,4"), Swedish comma. */
function formatHeroOre(ore: number, language: SupportedLanguage): string {
  const decimals = Math.abs(ore) < 10 ? 1 : 0;
  return ore.toLocaleString(language === 'sv' ? 'sv-SE' : 'en-GB', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

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
  const { todayPrices, tomorrowPrices, isLoading, error, fetchPrices } = usePriceStore();
  const showPaywall = useUiStore((s) => s.showPaywall);
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
  // slot), so cheapest/priciest never reshuffle between views; only the
  // displayed numbers change. Solar bonus hours stay on spot (below).
  // "What you pay" is the headline once the grid fee is known, unless the
  // user picked spot themselves (remembered per phone).
  const priceView = useUserStore((s) => s.priceView);
  const setPriceView = useUserStore((s) => s.setPriceView);
  const showLanded = priceView === null ? hasGridFee : priceView === 'landed';
  const setShowLanded = (landed: boolean) => setPriceView(landed ? 'landed' : 'spot');
  const landedActive = showLanded && hasGridFee;

  // Chart data: the real 15-minute prices for today and tomorrow, shown as
  // "what you pay" when that switch is on (same transform as the hero).
  const chartSlots = useMemo(() => {
    const all = [...todayPrices, ...tomorrowPrices];
    if (!landedActive || gridFeeVariableSekPerKwh === null) return all;
    return all.map((p) => ({ ...p, price: calculateLandedPrice(p.price, gridFeeVariableSekPerKwh, retailerMarkupSekPerKwh) }));
  }, [todayPrices, tomorrowPrices, landedActive, gridFeeVariableSekPerKwh, retailerMarkupSekPerKwh]);

  // Hero card: the real current quarter-hour price (not the hour's average),
  // the gauge range from today's quarter-hours, and the next cheapest and
  // dearest quarter-hour from now on (today + tomorrow when published).
  const hero = useMemo(() => {
    const now = new Date();
    const sorted = [...chartSlots].sort((a, b) => a.hour.getTime() - b.hour.getTime());
    const nowSlot = findCurrentPrice(sorted, now);
    const today = sorted.filter((s) => s.hour.toDateString() === now.toDateString());
    if (!nowSlot || today.length === 0) return null;
    const { cheapest: dayMin, priciest: dayMax } = findExtremeHours(today);
    const avg = today.reduce((sum, s) => sum + s.price, 0) / today.length;
    const upcoming = sorted.filter((s) => s.hour.getTime() > nowSlot.hour.getTime());
    const { cheapest: nextCheap, priciest: nextDear } = findExtremeHours(upcoming);
    return {
      now,
      price: nowSlot.price,
      validUntil: new Date(nowSlot.hour.getTime() + 15 * 60000),
      dayMin: dayMin!.price,
      dayMax: dayMax!.price,
      avg,
      nextCheap,
      nextDear,
    };
  }, [chartSlots]);

  // Pro: the best upcoming window for each appliance in this household,
  // shaded on the chart and listed under it.
  const disabledDefaults = useUserStore((s) => s.disabledDefaultAppliances);
  const bestTimes: BestTime[] = useMemo(() => {
    const now = new Date();
    const slots = [...todayPrices, ...tomorrowPrices];
    const nowSlot = findCurrentPrice(slots, now);
    const household = getHouseholdAppliances({ hasEv, disabledDefaults, registered: appliances }).filter((a) => a.shiftable);
    // Preset id for each appliance (registered ones by name), for icons and ordering.
    const kindOf = (a: (typeof household)[number]) => (a.householdDefault || a.id === 'ev' ? a.id : matchPresetId(a.label) ?? a.id);

    // The dryer needs the washed laundry, so plan the washing machine first
    // and only look for dryer windows after it has finished.
    const ordered = [...household].sort((a, b) => Number(kindOf(a) === 'dryer') - Number(kindOf(b) === 'dryer'));
    let washerEnd: Date | null = null;

    const result: BestTime[] = [];
    for (const a of ordered) {
      const kind = kindOf(a);
      const notBefore = kind === 'dryer' && washerEnd ? washerEnd : now;
      const window = findCheapestWindow(slots, a.typicalDurationHours, notBefore);
      if (!window) continue;
      if (kind === 'washing_machine') washerEnd = window.end;

      const kwh = (a.watts / 1000) * a.typicalDurationHours;
      // Spot difference × VAT: grid fee, tax and markup are the same per kWh whenever you run it.
      const saving = nowSlot ? kwh * (nowSlot.price - window.averagePrice) * 1.25 : null;
      result.push({
        id: a.id,
        kind,
        label: resolveApplianceLabel(a, t),
        start: window.start.hour,
        end: window.end,
        saving,
        startsNow: window.start.hour.getTime() <= now.getTime(),
      });
    }
    return result.sort((x, y) => x.start.getTime() - y.start.getTime());
  }, [todayPrices, tomorrowPrices, hasEv, disabledDefaults, appliances, t]);
  // Spot average for the share card: compareToOtherZones fetches other zones' raw spot prices, so the
  // comparison must stay spot-vs-spot regardless of what's displayed.
  const spotAveragePrice = useMemo(
    () => (hourlyPrices.length > 0 ? hourlyPrices.reduce((s, p) => s + p.price, 0) / hourlyPrices.length : 0),
    [hourlyPrices],
  );

  const solarPotential = useMemo(() => {
    const point = zoneReferencePoints[zone];
    return point ? estimateSolarPotential(forecast, point.lat, point.lon) : [];
  }, [forecast, zone]);
  const sunTimes = useMemo((): { sunrise: Date | null; sunset: Date | null } => {
    const point = zoneReferencePoints[zone];
    if (!point) return { sunrise: null, sunset: null };
    const times = getTimes(new Date(), point.lat, point.lon);
    // Polar day/night (far north) gives invalid dates.
    const valid = (d: Date | null): Date | null => (d && !Number.isNaN(d.getTime()) ? d : null);
    return { sunrise: valid(times.sunrise), sunset: valid(times.sunset) };
  }, [zone]);
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
          {hero && (
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
                    <PriceDial value={hero.price} min={hero.dayMin} max={hero.dayMax} />
                    <AnimatedNumber
                      value={hero.price * 100}
                      format={(ore) => formatHeroOre(ore, language)}
                      style={styles.heroPrice}
                      accessibilityLabel={t('home.priceNowA11y', { price: formatOre(hero.price, language) })}
                    />
                    <Text style={styles.heroUnit}>
                      {t(landedActive ? 'home.priceUnitLanded' : 'home.priceUnitNow')} · {t('home.validUntil', { time: formatClock(hero.validUntil) })}
                    </Text>
                    <Chip
                      label={
                        hero.price < hero.avg * 0.95
                          ? t('home.belowAverage')
                          : hero.price > hero.avg * 1.05
                            ? t('home.aboveAverage')
                            : t('home.aroundAverage')
                      }
                      variant={hero.price < hero.avg * 0.95 ? 'teal' : hero.price > hero.avg * 1.05 ? 'amber' : 'neutral'}
                      style={styles.averageChip}
                    />
                  </View>

                  {hero.nextCheap && hero.nextDear && (
                    <View style={styles.statsRow}>
                      {[
                        { slot: hero.nextCheap, label: t('home.nextCheapest'), color: theme.colors.positiveTealDeep, Icon: IconArrowDownRight, iconColor: theme.colors.positiveTeal },
                        { slot: hero.nextDear, label: t('home.nextDearest'), color: theme.colors.dangerEmberDeep, Icon: IconArrowUpRight, iconColor: theme.colors.dangerEmber },
                      ].map(({ slot, label, color, Icon, iconColor }, i) => {
                        const when = t(`chart.when.${whenOf(slot.hour, hero.now)}`);
                        return (
                          <View key={label} style={[styles.statBlock, i === 1 && styles.statBlockDivider]}>
                            <View style={styles.statLabelRow}>
                              <Icon size={14} color={iconColor} />
                              <Text style={[styles.statLabel, { color }]}>{label}</Text>
                            </View>
                            <Text style={[styles.statPrice, styles.tabular]}>{formatOre(slot.price, language)} öre</Text>
                            <Text style={[styles.statHour, styles.tabular]}>
                              {when} {formatClock(slot.hour)}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  )}

                  {/* Weather-based outlook: only shown when there is something to warn about. */}
                  {risk && risk.level !== 'low' && (
                    <View style={styles.tipRow}>
                      <InfoRow
                        icon={IconAlertTriangle}
                        variant={RISK_VARIANT[risk.level]}
                        title={
                          risk.level === 'high' ? t('home.higherRisk') : t('home.elevatedRisk')
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
            {t(tomorrowPrices.length > 0 ? 'home.chartTitleTwoDays' : 'home.hourlyTitle')}
          </Text>
          <PriceChart
            slots={chartSlots}
            now={new Date()}
            bestTimes={isProSubscriber ? bestTimes : undefined}
            onUpgrade={() => showPaywall('proTips')}
          />

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
              <SolarBonusCard
                bonusHours={bonusHours}
                solarPotential={solarPotential}
                sunrise={sunTimes.sunrise}
                sunset={sunTimes.sunset}
                now={new Date()}
                language={language}
              />
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
  statsRow: { flexDirection: 'row', alignItems: 'stretch' },
  statBlockDivider: { borderLeftWidth: 1, borderLeftColor: theme.colors.borderMuted },
  statLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  tabular: { fontVariant: ['tabular-nums'] },
  statBlock: { flex: 1, alignItems: 'center' },
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
