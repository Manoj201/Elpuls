import { useEffect, useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { IconArrowLeft, IconBolt } from '@tabler/icons-react-native';
import { APPLIANCE_PRESETS, type AppliancePreset } from '../config/appliances';
import { APPLIANCE_ICONS, resolveApplianceLabel, toAppliancePreset } from '../lib/applianceDisplay';
import { compareApplianceCost, groupPricesByHour } from '../lib/priceUtils';
import { formatPrice } from '../lib/formatNumber';
import type { SupportedLanguage } from '../i18n';
import { useApplianceStore } from '../stores/useApplianceStore';
import { useCountryStore } from '../stores/useCountryStore';
import { usePriceStore } from '../stores/usePriceStore';
import { useUserStore } from '../stores/useUserStore';
import { theme } from '../theme';
import { Card } from '../components/Card';
import { Chip } from '../components/Chip';
import { ProLockedCard } from '../components/ProLockedCard';

interface ApplianceRecommendationsScreenProps {
  uid: string;
  onBack: () => void;
}

function ApplianceRow({ appliance, uid }: { appliance: AppliancePreset; uid: string }) {
  const { t, i18n } = useTranslation();
  const language = i18n.language as SupportedLanguage;
  const config = useCountryStore((s) => s.config);
  const { todayPrices, tomorrowPrices } = usePriceStore();
  const registered = useApplianceStore((s) => s.appliances.find((a) => a.id === appliance.id));
  const setNotifyEnabled = useApplianceStore((s) => s.setNotifyEnabled);

  const combinedHourly = useMemo(
    () => [...groupPricesByHour(todayPrices), ...groupPricesByHour(tomorrowPrices)],
    [todayPrices, tomorrowPrices],
  );

  const { costNow, cheapestWindow, costAtWindow, showWaitOption } = useMemo(
    () => compareApplianceCost(appliance, combinedHourly, new Date()),
    [appliance, combinedHourly],
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

      {registered && (
        <View style={styles.notifyRow}>
          <Chip
            label={t('applianceRecommendations.notifyMe')}
            selected={registered.notifyEnabled}
            onPress={() => setNotifyEnabled(uid, appliance.id, !registered.notifyEnabled)}
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
              {t('ticker.costAtTime', { time: `${cheapestWindow.start.hour.getHours()}:00` })}:{' '}
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

  const allAppliances = useMemo(
    () => [...APPLIANCE_PRESETS, ...registeredAppliances.map(toAppliancePreset)],
    [registeredAppliances],
  );

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Pressable onPress={onBack} hitSlop={8} style={styles.backRow} accessibilityLabel={t('common.back')}>
        <IconArrowLeft size={20} color={theme.colors.textSecondary} />
      </Pressable>
      <Text style={styles.title}>{t('applianceRecommendations.title')}</Text>
      <Text style={styles.subtitle}>{t('applianceRecommendations.subtitle')}</Text>

      {!isProSubscriber ? (
        <ProLockedCard title={t('paywall.features.recommendations')} subtitle={t('paywall.lockedRecommendationsSubtitle')} />
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
  title: { fontFamily: theme.typography.display, fontSize: 26, color: theme.colors.textPrimary },
  subtitle: { fontFamily: theme.typography.body, fontSize: 14, color: theme.colors.textMuted, marginTop: 4, marginBottom: 20 },
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
  label: { fontFamily: theme.typography.bodyMedium, fontSize: 15, color: theme.colors.textPrimary },
  notifyRow: { marginTop: 10 },
  resultBlock: { gap: 4 },
  costNow: { fontFamily: theme.typography.body, fontSize: 13, color: theme.colors.textSecondary },
  waitHint: { fontFamily: theme.typography.bodyMedium, fontSize: 13, color: theme.colors.positiveTealDeep },
  alreadyBest: { fontFamily: theme.typography.body, fontSize: 13, color: theme.colors.textMuted },
  waiting: { fontFamily: theme.typography.body, fontSize: 13, color: theme.colors.textMuted },
  fixedScheduleHint: { fontFamily: theme.typography.body, fontSize: 13, color: theme.colors.textMuted },
});
