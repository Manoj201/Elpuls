import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { IconArrowLeft, IconBolt, IconFlame } from '@tabler/icons-react-native';
import { APPLIANCE_PRESETS, type AppliancePreset } from '../config/appliances';
import { APPLIANCE_ICONS, resolveApplianceLabel, toAppliancePreset } from '../lib/applianceDisplay';
import {
  compareApplianceCost,
  findCheapestWindow,
  findCurrentPrice,
  groupPricesByHour,
  type CheapestWindow,
} from '../lib/priceUtils';
import { formatOre, formatPrice } from '../lib/formatNumber';
import { findRelatableComparison } from '../lib/relatableCost';
import type { HourlyPrice } from '../providers/types';
import type { SupportedLanguage } from '../i18n';
import { useApplianceStore } from '../stores/useApplianceStore';
import { useCountryStore } from '../stores/useCountryStore';
import { usePriceStore } from '../stores/usePriceStore';
import { useUiStore } from '../stores/useUiStore';
import { theme } from '../theme';
import { Card } from '../components/Card';
import { Chip } from '../components/Chip';
import { InfoRow } from '../components/InfoRow';
import { SecondaryButton } from '../components/SecondaryButton';

const BATCH_COOK_DURATION_HOURS = 3;
const BATCH_COOK_AFTERNOON_START_HOUR = 12;
const BATCH_COOK_AFTERNOON_END_HOUR = 18;

/**
 * The day-ahead market only ever publishes today + tomorrow, never a full
 * week out — so "Sunday's cheapest afternoon" is only ever knowable on the
 * one day it's actually published: Saturday, when tomorrowPrices *is*
 * Sunday. No general "Sundays tend to be cheap" claim, since we don't have
 * the historical data to back that (same reasoning as the deferred weekly
 * rhythm insight).
 */
function findSundayBatchCookWindow(tomorrowPrices: HourlyPrice[], today: Date): CheapestWindow | null {
  if (today.getDay() !== 6) {
    return null;
  }

  const afternoon = groupPricesByHour(tomorrowPrices).filter((p) => {
    const hour = p.hour.getHours();
    return hour >= BATCH_COOK_AFTERNOON_START_HOUR && hour < BATCH_COOK_AFTERNOON_END_HOUR;
  });

  return findCheapestWindow(afternoon, BATCH_COOK_DURATION_HOURS, new Date(0));
}

function RelatableCaption({ costSek }: { costSek: number }) {
  const { t } = useTranslation();
  const match = findRelatableComparison(costSek);
  if (!match) return null;

  const item = t(`ticker.relatable.${match.itemKey}`);
  const isNearMatch = match.multiple >= 0.7 && match.multiple <= 1.4;
  const multiple = match.multiple < 1 ? Math.round(match.multiple * 10) / 10 : Math.round(match.multiple);

  return (
    <Text style={styles.relatable}>
      {isNearMatch ? t('ticker.relatableApprox', { item }) : t('ticker.relatableMultiple', { item, multiple })}
    </Text>
  );
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${pad(minutes)}:${pad(seconds)}`;
}

function ApplianceRow({ appliance, onPress }: { appliance: AppliancePreset; onPress: (appliance: AppliancePreset) => void }) {
  const { t } = useTranslation();
  const Icon = APPLIANCE_ICONS[appliance.id] ?? IconBolt;
  const label = resolveApplianceLabel(appliance, t);

  return (
    <Pressable onPress={() => onPress(appliance)}>
      <Card style={styles.presetCard}>
        <View style={styles.presetLeft}>
          <View style={styles.presetIcon}>
            <Icon size={18} color={theme.colors.textSecondary} />
          </View>
          <Text style={styles.presetLabel}>{label}</Text>
        </View>
        <Chip label={`${appliance.watts} W`} variant="neutral" />
      </Card>
    </Pressable>
  );
}

interface TickerScreenProps {
  uid: string;
  /** Present only when pushed as a stack screen (from Översikt); renders a back header when given. */
  onBack?: () => void;
}

export function TickerScreen({ uid, onBack }: TickerScreenProps) {
  const { t, i18n } = useTranslation();
  const language = i18n.language as SupportedLanguage;
  const zone = useCountryStore((s) => s.zone);
  const config = useCountryStore((s) => s.config);
  const { todayPrices, tomorrowPrices, fetchPrices } = usePriceStore();
  const { ticker, startTicker, stopTicker } = useUiStore();
  const { appliances: registeredAppliances, fetchAppliances } = useApplianceStore();
  const [customWatts, setCustomWatts] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const [selectedAppliance, setSelectedAppliance] = useState<AppliancePreset | null>(null);

  useEffect(() => {
    fetchPrices(zone);
  }, [fetchPrices, zone]);

  useEffect(() => {
    fetchAppliances(uid);
  }, [fetchAppliances, uid]);

  const registeredAppliancePresets = useMemo(
    () => registeredAppliances.map(toAppliancePreset),
    [registeredAppliances],
  );

  useEffect(() => {
    if (!ticker) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [ticker]);

  const combinedHourly = useMemo(
    () => [...groupPricesByHour(todayPrices), ...groupPricesByHour(tomorrowPrices)],
    [todayPrices, tomorrowPrices],
  );

  const batchCookWindow = useMemo(
    () => findSundayBatchCookWindow(tomorrowPrices, new Date(now)),
    [tomorrowPrices, now],
  );

  function handleSelectAppliance(appliance: AppliancePreset) {
    if (appliance.liveTracking) {
      startTicker(appliance.watts, resolveApplianceLabel(appliance, t));
    } else {
      setSelectedAppliance(appliance);
    }
  }

  // Running state (EV / custom wattage only) — live counting-up cost.
  if (ticker) {
    const currentPrice = findCurrentPrice(todayPrices, new Date(now));
    const elapsedMs = now - ticker.startedAt;

    return (
      <View style={styles.centered}>
        <Text style={styles.tickerLabel}>{ticker.label}</Text>
        <Text style={styles.tickerWatts}>{t('ticker.zoneLabel', { watts: ticker.watts, zone })}</Text>

        {currentPrice ? (
          <>
            <Text style={styles.cost}>
              {formatPrice((ticker.watts / 1000) * currentPrice.price * (elapsedMs / 3_600_000), language)}{' '}
              <Text style={styles.costUnit}>{config.currency}</Text>
            </Text>
            <Text style={styles.costHint}>
              {t('ticker.atPrice', { price: formatOre(currentPrice.price, language), currency: 'öre' })}
            </Text>
            <RelatableCaption costSek={(ticker.watts / 1000) * currentPrice.price * (elapsedMs / 3_600_000)} />
          </>
        ) : (
          <Text style={styles.waiting}>{t('ticker.waitingForPrices')}</Text>
        )}

        <Text style={styles.elapsed}>{formatElapsed(elapsedMs)}</Text>

        <View style={styles.stopButtonWrapper}>
          <SecondaryButton label={t('ticker.stopTracking')} onPress={stopTicker} />
        </View>
      </View>
    );
  }

  // Pre-use decision check (washing machine, dishwasher, dryer, oven).
  if (selectedAppliance) {
    const Icon = APPLIANCE_ICONS[selectedAppliance.id] ?? IconBolt;
    const label = resolveApplianceLabel(selectedAppliance, t);
    const { costNow, cheapestWindow, costAtWindow, showWaitOption } = compareApplianceCost(
      selectedAppliance,
      combinedHourly,
      new Date(now),
    );

    return (
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.decisionHeader}>
          <View style={styles.presetIcon}>
            <Icon size={20} color={theme.colors.textSecondary} />
          </View>
          <Text style={styles.decisionTitle}>{label}</Text>
        </View>

        {costNow !== null ? (
          <Card style={StyleSheet.flatten([styles.decisionCard, { backgroundColor: theme.colors.background, borderColor: theme.colors.border }])}>
            <Text style={styles.decisionLabel}>{t('ticker.costNow')}</Text>
            <Text style={styles.decisionPrice}>
              {formatPrice(costNow, language)} {config.currency}
            </Text>
            <RelatableCaption costSek={costNow} />
          </Card>
        ) : (
          <Text style={styles.waiting}>{t('ticker.waitingForPrices')}</Text>
        )}

        {!selectedAppliance.shiftable && (
          <Text style={styles.fixedScheduleHint}>{t('ticker.fixedScheduleHint')}</Text>
        )}

        {showWaitOption && cheapestWindow && costAtWindow !== null && costNow !== null && (
          <Card style={StyleSheet.flatten([styles.decisionCard, { backgroundColor: theme.colors.positiveTealSoft, borderColor: theme.colors.positiveTealSoft }])}>
            <Text style={[styles.decisionLabel, { color: theme.colors.positiveTealDeep }]}>
              {t('ticker.costAtTime', { time: `${cheapestWindow.start.hour.getHours()}:00` })}
            </Text>
            <Text style={styles.decisionPrice}>
              {formatPrice(costAtWindow, language)} {config.currency}
            </Text>
            <RelatableCaption costSek={costAtWindow} />
            <Text style={styles.savingsHint}>
              {t('ticker.savingsHint', { amount: formatPrice(costNow - costAtWindow, language), currency: config.currency })}
            </Text>
          </Card>
        )}

        <View style={styles.stopButtonWrapper}>
          <SecondaryButton label={t('ticker.back')} onPress={() => setSelectedAppliance(null)} />
        </View>
      </ScrollView>
    );
  }

  // Appliance picker.
  return (
    <ScrollView contentContainerStyle={styles.container}>
      {onBack && (
        <Pressable onPress={onBack} hitSlop={8} style={styles.backRow} accessibilityLabel={t('common.back')}>
          <IconArrowLeft size={20} color={theme.colors.textSecondary} />
        </Pressable>
      )}
      <Text style={styles.title}>{t('ticker.title')}</Text>
      <Text style={styles.subtitle}>{t('ticker.subtitle')}</Text>

      {batchCookWindow && (
        <Card style={styles.batchCookCard}>
          <InfoRow
            icon={IconFlame}
            variant="amber"
            title={t('ticker.batchCookTitle')}
            subtitle={t('ticker.batchCookWindow', { time: `${batchCookWindow.start.hour.getHours()}:00` })}
          />
        </Card>
      )}

      {registeredAppliancePresets.length > 0 && (
        <>
          <Text style={styles.groupTitle}>{t('ticker.myAppliancesTitle')}</Text>
          <View style={styles.presetList}>
            {registeredAppliancePresets.map((appliance) => (
              <ApplianceRow key={appliance.id} appliance={appliance} onPress={handleSelectAppliance} />
            ))}
          </View>
        </>
      )}

      <Text style={styles.groupTitle}>{t('ticker.presetsTitle')}</Text>
      <View style={styles.presetList}>
        {APPLIANCE_PRESETS.map((appliance) => (
          <ApplianceRow key={appliance.id} appliance={appliance} onPress={handleSelectAppliance} />
        ))}
      </View>

      <View style={styles.customCard}>
        <Text style={styles.customHeading}>{t('ticker.customHeading')}</Text>
        <View style={styles.customRow}>
          <TextInput
            style={styles.customInput}
            placeholder={t('ticker.wattsPlaceholder')}
            placeholderTextColor={theme.colors.textFaint}
            keyboardType="numeric"
            value={customWatts}
            onChangeText={setCustomWatts}
          />
          <Pressable
            style={styles.customButton}
            onPress={() => {
              const watts = parseFloat(customWatts);
              if (!Number.isFinite(watts) || watts <= 0) return;
              startTicker(watts, t('ticker.customApplianceLabel'));
              setCustomWatts('');
            }}
          >
            <Text style={styles.customButtonText}>{t('ticker.start')}</Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingTop: 60, paddingBottom: 100 },
  backRow: { marginBottom: 12, alignSelf: 'flex-start' },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: { fontFamily: theme.typography.display, fontSize: 26, color: theme.colors.textPrimary },
  subtitle: { fontFamily: theme.typography.body, fontSize: 14, color: theme.colors.textMuted, marginTop: 4, marginBottom: 24 },
  batchCookCard: { marginBottom: 16 },
  groupTitle: {
    fontFamily: theme.typography.bodyMedium,
    fontSize: 12,
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 20,
    marginBottom: 10,
  },
  presetList: { gap: 10 },
  presetCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  presetLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  presetIcon: {
    width: 32,
    height: 32,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetLabel: { fontFamily: theme.typography.bodyMedium, fontSize: 15, color: theme.colors.textPrimary },
  customCard: {
    marginTop: 24,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderStyle: 'dashed',
    borderRadius: theme.radius.lg,
    padding: 14,
  },
  customHeading: { fontFamily: theme.typography.body, fontSize: 13, color: theme.colors.textMuted, marginBottom: 10 },
  customRow: { flexDirection: 'row', gap: 10 },
  customInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontFamily: theme.typography.body,
    fontSize: 16,
    color: theme.colors.textPrimary,
  },
  customButton: {
    backgroundColor: theme.colors.inkButton,
    borderRadius: theme.radius.md,
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  customButtonText: { fontFamily: theme.typography.bodyMedium, color: theme.colors.onInkButton, fontSize: 15 },
  tickerLabel: { fontFamily: theme.typography.displayMedium, fontSize: 20, color: theme.colors.textPrimary },
  tickerWatts: { fontFamily: theme.typography.body, fontSize: 14, color: theme.colors.textMuted, marginTop: 4, marginBottom: 32 },
  cost: { fontFamily: theme.typography.display, fontSize: 48, color: theme.colors.accentAmber },
  costUnit: { fontFamily: theme.typography.body, fontSize: 18, color: theme.colors.textMuted },
  costHint: { fontFamily: theme.typography.body, fontSize: 13, color: theme.colors.textMuted, marginTop: 6 },
  relatable: { fontFamily: theme.typography.body, fontSize: 13, color: theme.colors.accentAmberDeep, marginTop: 4 },
  waiting: { fontFamily: theme.typography.body, fontSize: 16, color: theme.colors.textMuted },
  elapsed: {
    fontFamily: theme.typography.bodyMedium,
    fontSize: 18,
    color: theme.colors.textSecondary,
    marginTop: 24,
    fontVariant: ['tabular-nums'],
  },
  stopButtonWrapper: { marginTop: 24, alignSelf: 'center', minWidth: 180 },
  decisionHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  decisionTitle: { fontFamily: theme.typography.displayMedium, fontSize: 20, color: theme.colors.textPrimary },
  decisionCard: { borderWidth: 1, alignItems: 'center', paddingVertical: 20, marginBottom: 16 },
  decisionLabel: {
    fontFamily: theme.typography.bodyMedium,
    fontSize: 12,
    color: theme.colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  decisionPrice: { fontFamily: theme.typography.display, fontSize: 30, color: theme.colors.textPrimary, marginTop: 6 },
  savingsHint: { fontFamily: theme.typography.body, fontSize: 13, color: theme.colors.positiveTealDeep, marginTop: 6 },
  fixedScheduleHint: {
    fontFamily: theme.typography.body,
    fontSize: 13,
    color: theme.colors.textMuted,
    marginBottom: 16,
  },
});
