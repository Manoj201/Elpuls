import { useEffect, useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { IconArrowLeft, IconBolt } from '@tabler/icons-react-native';
import type { AppliancePreset } from '../config/appliances';
import { APPLIANCE_ICONS, getHouseholdAppliances, resolveApplianceLabel } from '../lib/applianceDisplay';
import { compareApplianceCost } from '../lib/priceUtils';
import { formatClock, formatPrice } from '../lib/formatNumber';
import type { SupportedLanguage } from '../i18n';
import { useApplianceStore } from '../stores/useApplianceStore';
import { setAppliancePushes } from '../lib/notificationPrefs';
import { useCountryStore } from '../stores/useCountryStore';
import { usePriceStore } from '../stores/usePriceStore';
import { useUserStore } from '../stores/useUserStore';
import { theme } from '../theme';
import { Card } from '../components/Card';
import { Chip } from '../components/Chip';
import { PreviewRow, ProLockedCard } from '../components/ProLockedCard';

interface ApplianceRecommendationsScreenProps {
  uid: string;
  onBack: () => void;
}

function ApplianceRow({ appliance, uid }: { appliance: AppliancePreset; uid: string }) {
  const { t, i18n } = useTranslation();
  const language = i18n.language as SupportedLanguage;
  const config = useCountryStore((s) => s.config);
  const { todayPrices, tomorrowPrices } = usePriceStore();
  const pushesOn = useUserStore((s) => !s.notificationPrefs.mutedAppliances.includes(appliance.id));
  const smartPushesOn = useUserStore((s) => s.notificationPrefs.applianceWindows);

  // Real 15-minute prices, so the best window can start on any quarter-hour.
  const combinedSlots = useMemo(() => [...todayPrices, ...tomorrowPrices], [todayPrices, tomorrowPrices]);

  const { costNow, cheapestWindow, costAtWindow, showWaitOption } = useMemo(
    () => compareApplianceCost(appliance, combinedSlots, new Date()),
    [appliance, combinedSlots],
  );

  const Icon = APPLIANCE_ICONS[appliance.id] ?? IconBolt;
  const label = resolveApplianceLabel(appliance, t);

  return (
    <Card style={styles.row}>
      <View style={styles.rowHeader}>
        <View style={styles.rowLeft}>
          <View style={styles.presetIcon}>
            <Icon size={18} color={theme.colors.textSecondary} />
          </View>
          <Text style={styles.label}>{label}</Text>
        </View>
        <Chip label={`${appliance.watts} W`} variant="neutral" />
      </View>

      {appliance.shiftable && smartPushesOn && (
        <View style={styles.notifyRow}>
          <Chip
            label={t('applianceRecommendations.notifyMe')}
            selected={pushesOn}
            onPress={() => setAppliancePushes(uid, appliance.id, !pushesOn)}
          />
        </View>
      )}

      {costNow === null ? (
        <Text style={styles.waiting}>{t('ticker.waitingForPrices')}</Text>
      ) : !appliance.shiftable ? (
        <Text style={styles.fixedScheduleHint}>{t('ticker.fixedScheduleHint')}</Text>
      ) : (
        <View style={styles.resultBlock}>
          <Text style={styles.costNow}>
            {t('ticker.costNow')}: {formatPrice(costNow, language)} {config.currency}
          </Text>
          {showWaitOption && cheapestWindow && costAtWindow !== null ? (
            <Text style={styles.waitHint}>
              {t('ticker.costAtTime', { time: formatClock(cheapestWindow.start.hour) })}:{' '}
              {formatPrice(costAtWindow, language)} {config.currency} ·{' '}
              {t('ticker.savingsHint', { amount: formatPrice(costNow - costAtWindow, language), currency: config.currency })}
            </Text>
          ) : (
            <Text style={styles.alreadyBest}>{t('applianceRecommendations.alreadyBest')}</Text>
          )}
        </View>
      )}
    </Card>
  );
}

export function ApplianceRecommendationsScreen({ uid, onBack }: ApplianceRecommendationsScreenProps) {
  const { t } = useTranslation();
  const zone = useCountryStore((s) => s.zone);
  const { fetchPrices } = usePriceStore();
  const { appliances: registeredAppliances, fetchAppliances } = useApplianceStore();
  const isProSubscriber = useUserStore((s) => s.isProSubscriber);

  useEffect(() => {
    fetchPrices(zone);
  }, [fetchPrices, zone]);

  useEffect(() => {
    fetchAppliances(uid);
  }, [fetchAppliances, uid]);

  const hasEv = useUserStore((s) => s.hasEv);
  const disabledDefaults = useUserStore((s) => s.disabledDefaultAppliances);

  // This home's appliances: the standard household (minus ones switched off)
  // plus registered ones, so users who added nothing still get advice.
  const allAppliances = useMemo(
    () => getHouseholdAppliances({ hasEv, disabledDefaults, registered: registeredAppliances }),
    [hasEv, disabledDefaults, registeredAppliances],
  );

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Pressable onPress={onBack} hitSlop={8} style={styles.backRow} accessibilityLabel={t('common.back')}>
        <IconArrowLeft size={20} color={theme.colors.textSecondary} />
      </Pressable>
      <Text style={styles.title}>{t('applianceRecommendations.title')}</Text>
      <Text style={styles.subtitle}>{t('applianceRecommendations.subtitle')}</Text>

      {!isProSubscriber ? (
        <ProLockedCard
          icon={IconBolt}
          title={t('paywall.headlineRecommendations')}
          subtitle={t('paywall.lockedRecommendationsSubtitle')}
          source="recommendations"
          preview={
            <View>
              <PreviewRow label={t('ticker.appliances.dishwasher')} value={t('applianceRecommendations.sample.dishwasher')} />
              <PreviewRow label={t('ticker.appliances.washing_machine')} value={t('applianceRecommendations.sample.washingMachine')} />
              <PreviewRow label={t('ticker.appliances.ev')} value={t('applianceRecommendations.sample.ev')} />
            </View>
          }
        />
      ) : (
        <View style={styles.list}>
          {allAppliances.map((appliance) => (
            <ApplianceRow key={appliance.id} appliance={appliance} uid={uid} />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingTop: 60, paddingBottom: 40 },
  backRow: { marginBottom: 12, alignSelf: 'flex-start' },
  title: { fontFamily: theme.typography.display, fontSize: theme.type.xl, color: theme.colors.textPrimary },
  subtitle: { fontFamily: theme.typography.body, fontSize: theme.type.sm, color: theme.colors.textMuted, marginTop: 4, marginBottom: 20 },
  list: { gap: 12 },
  row: {},
  rowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  presetIcon: {
    width: 32,
    height: 32,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontFamily: theme.typography.bodyMedium, fontSize: theme.type.sm, color: theme.colors.textPrimary },
  notifyRow: { marginTop: 10 },
  resultBlock: { gap: 4 },
  costNow: { fontFamily: theme.typography.body, fontSize: theme.type.sm, color: theme.colors.textSecondary },
  waitHint: { fontFamily: theme.typography.bodyMedium, fontSize: theme.type.sm, color: theme.colors.positiveTealDeep },
  alreadyBest: { fontFamily: theme.typography.body, fontSize: theme.type.sm, color: theme.colors.textMuted },
  waiting: { fontFamily: theme.typography.body, fontSize: theme.type.sm, color: theme.colors.textMuted },
  fixedScheduleHint: { fontFamily: theme.typography.body, fontSize: theme.type.sm, color: theme.colors.textMuted },
});
