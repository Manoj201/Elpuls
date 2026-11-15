import { useEffect, useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { IconArrowLeft, IconBolt } from '@tabler/icons-react-native';
import { useUserStore } from '../stores/useUserStore';
import { useUiStore } from '../stores/useUiStore';
import { useApplianceStore } from '../stores/useApplianceStore';
import { saveNotificationPrefs, setAppliancePushes } from '../lib/notificationPrefs';
import { APPLIANCE_ICONS, getHouseholdAppliances, resolveApplianceLabel } from '../lib/applianceDisplay';
import { theme } from '../theme';
import { Card } from '../components/Card';
import { Chip } from '../components/Chip';
import { PrimaryButton } from '../components/PrimaryButton';

interface NotificationSettingsScreenProps {
  uid: string;
  onBack: () => void;
}

const QUIET_START_OPTIONS = [21, 22, 23];
const QUIET_END_OPTIONS = [6, 7, 8];
const MAX_PER_DAY_OPTIONS = [1, 2, 3, 4];

/**
 * "Notiser": one place for every push Elpuls sends. Free users can switch
 * the free push and see the Pro ones (with a way to try Pro); changes save
 * right away. Advisory only: pushes suggest, they never control a device.
 */
export function NotificationSettingsScreen({ uid, onBack }: NotificationSettingsScreenProps) {
  const { t } = useTranslation();
  const prefs = useUserStore((s) => s.notificationPrefs);
  const isPro = useUserStore((s) => s.isProSubscriber);
  const heatingType = useUserStore((s) => s.heatingType);
  const hasEv = useUserStore((s) => s.hasEv);
  const disabledDefaults = useUserStore((s) => s.disabledDefaultAppliances);
  const showPaywall = useUiStore((s) => s.showPaywall);
  const registered = useApplianceStore((s) => s.appliances);
  const fetchAppliances = useApplianceStore((s) => s.fetchAppliances);

  useEffect(() => {
    fetchAppliances(uid);
  }, [fetchAppliances, uid]);

  const appliances = useMemo(
    () => getHouseholdAppliances({ hasEv, disabledDefaults, registered }).filter((a) => a.shiftable),
    [hasEv, disabledDefaults, registered],
  );

  const heatsWithElectricity = heatingType === 'electric' || heatingType === 'heat_pump';
  const save = (changes: Parameters<typeof saveNotificationPrefs>[1]) => saveNotificationPrefs(uid, changes);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Pressable onPress={onBack} hitSlop={12} style={styles.backRow} accessibilityRole="button" accessibilityLabel={t('common.back')}>
        <IconArrowLeft size={22} color={theme.colors.textSecondary} />
        <Text style={styles.backText}>{t('common.back')}</Text>
      </Pressable>
      <Text style={styles.title} accessibilityRole="header">
        {t('notifications.title')}
      </Text>
      <Text style={styles.subtitle}>{t('notifications.subtitle')}</Text>

      <Text style={styles.sectionTitle}>{t('notifications.freeTitle')}</Text>
      <Card style={styles.card}>
        <ToggleRow
          title={t('notifications.pricesPublishedTitle')}
          text={t('notifications.pricesPublishedText')}
          value={prefs.pricesPublished}
          onChange={(v) => save({ pricesPublished: v })}
        />
        <Text style={styles.note}>{t('notifications.priceAlertsNote')}</Text>
      </Card>

      <View style={styles.proHeader}>
        <Text style={styles.sectionTitle}>{t('notifications.proTitle')}</Text>
        <Chip label={t('pro.tag')} variant="amber" />
      </View>
      <Card style={styles.card}>
        <ToggleRow
          title={t('notifications.applianceWindowsTitle')}
          text={t('notifications.applianceWindowsText')}
          value={isPro && prefs.applianceWindows}
          disabled={!isPro}
          onChange={(v) => save({ applianceWindows: v })}
        />
        <ToggleRow
          divider
          title={t('notifications.cheapNowTitle')}
          text={t('notifications.cheapNowText')}
          value={isPro && prefs.cheapNow}
          disabled={!isPro}
          onChange={(v) => save({ cheapNow: v })}
        />
        {heatsWithElectricity && (
          <ToggleRow
            divider
            title={t('notifications.heatAheadTitle')}
            text={t('notifications.heatAheadText')}
            value={isPro && prefs.heatAhead}
            disabled={!isPro}
            onChange={(v) => save({ heatAhead: v })}
          />
        )}
        {!isPro && <PrimaryButton size="compact" label={t('notifications.tryPro')} onPress={() => showPaywall('proTips')} />}
      </Card>

      {isPro && (
        <>
          <Text style={styles.sectionTitle}>{t('notifications.appliancesTitle')}</Text>
          <Card style={styles.card}>
            {appliances.map((appliance, index) => {
              const Icon = APPLIANCE_ICONS[appliance.id] ?? IconBolt;
              const label = resolveApplianceLabel(appliance, t);
              return (
                <View key={appliance.id} style={[styles.applianceRow, index > 0 && styles.divider]}>
                  <Icon size={20} color={theme.colors.textSecondary} />
                  <Text style={styles.applianceLabel}>{label}</Text>
                  <Switch
                    value={!prefs.mutedAppliances.includes(appliance.id)}
                    onValueChange={(v) => setAppliancePushes(uid, appliance.id, v)}
                    trackColor={{ false: theme.colors.borderMuted, true: theme.colors.accentPurple }}
                    accessibilityLabel={t('notifications.applianceA11y', { appliance: label })}
                  />
                </View>
              );
            })}
          </Card>

          <Text style={styles.sectionTitle}>{t('notifications.quietTitle')}</Text>
          <Card style={styles.card}>
            <Text style={styles.rowText}>{t('notifications.quietText')}</Text>
            <Text style={styles.chipLabel}>{t('notifications.quietFrom')}</Text>
            <View style={styles.chipRow}>
              {QUIET_START_OPTIONS.map((h) => (
                <Chip key={h} label={`${h}:00`} selected={prefs.quietStartHour === h} onPress={() => save({ quietStartHour: h })} />
              ))}
            </View>
            <Text style={styles.chipLabel}>{t('notifications.quietTo')}</Text>
            <View style={styles.chipRow}>
              {QUIET_END_OPTIONS.map((h) => (
                <Chip
                  key={h}
                  label={`${String(h).padStart(2, '0')}:00`}
                  selected={prefs.quietEndHour === h}
                  onPress={() => save({ quietEndHour: h })}
                />
              ))}
            </View>
          </Card>

          <Text style={styles.sectionTitle}>{t('notifications.maxPerDayTitle')}</Text>
          <Card style={styles.card}>
            <Text style={styles.rowText}>{t('notifications.maxPerDayText')}</Text>
            <View style={styles.chipRow}>
              {MAX_PER_DAY_OPTIONS.map((n) => (
                <Chip key={n} label={String(n)} selected={prefs.maxPerDay === n} onPress={() => save({ maxPerDay: n })} />
              ))}
            </View>
          </Card>
        </>
      )}
    </ScrollView>
  );
}

function ToggleRow({
  title,
  text,
  value,
  onChange,
  disabled,
  divider,
}: {
  title: string;
  text: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  divider?: boolean;
}) {
  return (
    <View style={[styles.toggleRow, divider && styles.divider]}>
      <View style={styles.toggleText}>
        <Text style={[styles.rowTitle, disabled && styles.dimmed]}>{title}</Text>
        <Text style={styles.rowText}>{text}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ false: theme.colors.borderMuted, true: theme.colors.accentPurple }}
        accessibilityLabel={title}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingTop: 60, paddingBottom: 40 },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, alignSelf: 'flex-start', marginBottom: 12 },
  backText: { fontFamily: theme.typography.bodyMedium, fontSize: theme.type.md, color: theme.colors.textSecondary },
  title: { fontFamily: theme.typography.display, fontSize: theme.type.xl, color: theme.colors.textPrimary },
  subtitle: { fontFamily: theme.typography.body, fontSize: theme.type.sm, lineHeight: 20, color: theme.colors.textSecondary, marginTop: 4, marginBottom: 20 },
  sectionTitle: { fontFamily: theme.typography.bodyMedium, fontSize: theme.type.sm, color: theme.colors.textSecondary, marginBottom: 8 },
  proHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  card: { gap: 12, marginBottom: 20 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  toggleText: { flex: 1 },
  divider: { borderTopWidth: 1, borderTopColor: theme.colors.borderMuted, paddingTop: 12 },
  rowTitle: { fontFamily: theme.typography.bodyMedium, fontSize: theme.type.md, color: theme.colors.textPrimary },
  dimmed: { color: theme.colors.textSecondary },
  rowText: { fontFamily: theme.typography.body, fontSize: theme.type.sm, lineHeight: 20, color: theme.colors.textSecondary, marginTop: 2 },
  note: { fontFamily: theme.typography.body, fontSize: theme.type.xs, lineHeight: 16, color: theme.colors.textSecondary },
  applianceRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  applianceLabel: { flex: 1, fontFamily: theme.typography.body, fontSize: theme.type.md, color: theme.colors.textPrimary },
  chipLabel: { fontFamily: theme.typography.bodyMedium, fontSize: theme.type.sm, color: theme.colors.textSecondary },
  chipRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
});
