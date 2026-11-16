import { useEffect, useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { IconArrowLeft, IconBolt, IconChevronRight } from '@tabler/icons-react-native';
import { db } from '../lib/firebase';
import { useUserStore } from '../stores/useUserStore';
import { useUiStore } from '../stores/useUiStore';
import { useApplianceStore } from '../stores/useApplianceStore';
import { saveNotificationPrefs, setAppliancePushes } from '../lib/notificationPrefs';
import { APPLIANCE_ICONS, getHouseholdAppliances, resolveApplianceLabel } from '../lib/applianceDisplay';
import { theme } from '../theme';
import { Card } from '../components/Card';
import { Chip } from '../components/Chip';
import { OptionCard } from '../components/OptionCard';

interface NotificationSettingsScreenProps {
  uid: string;
  onBack: () => void;
}

const QUIET_START_OPTIONS = [21, 22, 23];
const QUIET_END_OPTIONS = [6, 7, 8];
const MAX_PER_DAY_OPTIONS = [1, 2, 3, 4];
/** Öre/kWh thresholds for the "expensive tomorrow" alert; null = off. */
const HIGH_ALERT_OPTIONS: (number | null)[] = [null, 150, 200, 300];

/**
 * "Notiser": the one place for every push Elpuls sends, free and Pro.
 * Opens with a sample notification so people see what they're switching
 * on. Every change saves right away (no Save button). Advisory only:
 * pushes suggest, they never control a device.
 */
export function NotificationSettingsScreen({ uid, onBack }: NotificationSettingsScreenProps) {
  const { t } = useTranslation();
  const prefs = useUserStore((s) => s.notificationPrefs);
  const isPro = useUserStore((s) => s.isProSubscriber);
  const trialDays = useUserStore((s) => s.trialDays);
  const heatingType = useUserStore((s) => s.heatingType);
  const hasEv = useUserStore((s) => s.hasEv);
  const disabledDefaults = useUserStore((s) => s.disabledDefaultAppliances);
  const highThreshold = useUserStore((s) => s.priceAlertHighThresholdOre);
  const lowEnabled = useUserStore((s) => s.priceAlertLowEnabled);
  const setPriceAlertPrefs = useUserStore((s) => s.setPriceAlertPrefs);
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

  function savePriceAlerts(high: number | null, low: boolean) {
    setPriceAlertPrefs(high, low);
    setDoc(
      doc(db, 'users', uid),
      { priceAlertHighThresholdOre: high, priceAlertLowEnabled: low, updatedAt: serverTimestamp() },
      { merge: true },
    ).catch((err) => console.log('Saving price alerts failed:', err));
  }

  // A custom threshold set earlier (not one of the chips) still shows as its own chip.
  const highOptions = highThreshold !== null && !HIGH_ALERT_OPTIONS.includes(highThreshold)
    ? [...HIGH_ALERT_OPTIONS, highThreshold]
    : HIGH_ALERT_OPTIONS;

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

      {/* What a push looks like: makes the feature concrete before any switch. */}
      <View style={styles.sample} accessible accessibilityLabel={`${t('notifications.sampleA11y')} ${t('notifications.sampleTitle')}. ${t('notifications.sampleBody')}`}>
        <View style={styles.sampleIcon}>
          <IconBolt size={18} color={theme.colors.onInkButton} />
        </View>
        <View style={styles.sampleText}>
          <View style={styles.sampleMeta}>
            <Text style={styles.sampleApp}>ELPULS</Text>
            <Text style={styles.sampleWhen}>{t('notifications.sampleWhen')}</Text>
          </View>
          <Text style={styles.sampleTitle}>{t('notifications.sampleTitle')}</Text>
          <Text style={styles.sampleBody}>{t('notifications.sampleBody')}</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>{t('notifications.pricesTitle')}</Text>
      <Card style={styles.card}>
        <ToggleRow
          title={t('notifications.pricesPublishedTitle')}
          text={t('notifications.pricesPublishedText')}
          value={prefs.pricesPublished}
          onChange={(v) => save({ pricesPublished: v })}
        />
        <View style={styles.divider}>
          <Text style={styles.rowTitle}>{t('notifications.highAlertTitle')}</Text>
          <Text style={styles.rowText}>{t('notifications.highAlertText')}</Text>
          <View style={[styles.chipRow, styles.chipRowSpaced]} accessibilityRole="radiogroup" accessibilityLabel={t('notifications.highAlertTitle')}>
            {highOptions.map((value) => (
              <Chip
                key={String(value)}
                label={value === null ? t('notifications.off') : t('notifications.ore', { value })}
                selected={highThreshold === value}
                onPress={() => savePriceAlerts(value, lowEnabled)}
              />
            ))}
          </View>
        </View>
        <ToggleRow
          divider
          title={t('notifications.lowAlertTitle')}
          text={t('notifications.lowAlertText')}
          value={lowEnabled}
          onChange={(v) => savePriceAlerts(highThreshold, v)}
        />
      </Card>

      <View style={styles.proHeader}>
        <Text style={[styles.sectionTitle, styles.sectionTitleInline]}>{t('notifications.smartTitle')}</Text>
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
        <ToggleRow
          divider
          title={t('notifications.dailyBriefingTitle')}
          text={t('notifications.dailyBriefingText')}
          value={isPro && prefs.dailyBriefing}
          disabled={!isPro}
          onChange={(v) => save({ dailyBriefing: v })}
        />
        {!isPro && (
          <Pressable onPress={() => showPaywall('proTips')} style={[styles.divider, styles.link]} accessibilityRole="button">
            <Text style={styles.linkText}>{trialDays ? t('pro.tryFree', { days: trialDays }) : t('pro.getPro')}</Text>
            <IconChevronRight size={16} color={theme.colors.accentPurpleDeep} />
          </Pressable>
        )}
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
            <View style={styles.optionList} accessibilityRole="radiogroup" accessibilityLabel={t('notifications.maxPerDayTitle')}>
              {MAX_PER_DAY_OPTIONS.map((n) => (
                <OptionCard
                  key={n}
                  label={t('notifications.maxPerDayOption', { count: n })}
                  description={t(`notifications.maxPerDayDesc${n}`)}
                  selected={prefs.maxPerDay === n}
                  onPress={() => save({ maxPerDay: n })}
                />
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
  subtitle: { fontFamily: theme.typography.body, fontSize: theme.type.md, lineHeight: 22, color: theme.colors.textSecondary, marginTop: 4, marginBottom: 16 },
  // Sample push, styled like an iOS notification banner.
  sample: {
    flexDirection: 'row',
    gap: 12,
    padding: 14,
    marginBottom: 24,
    borderRadius: 20,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.accentPurple,
  },
  sampleIcon: {
    width: 36,
    height: 36,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.inkButton,
  },
  sampleText: { flex: 1, gap: 2 },
  sampleMeta: { flexDirection: 'row', justifyContent: 'space-between' },
  sampleApp: { fontFamily: theme.typography.bodyMedium, fontSize: theme.type.xs, letterSpacing: 0.5, color: theme.colors.textSecondary },
  sampleWhen: { fontFamily: theme.typography.body, fontSize: theme.type.xs, color: theme.colors.textSecondary },
  sampleTitle: { fontFamily: theme.typography.bodySemibold, fontSize: theme.type.md, color: theme.colors.textPrimary },
  sampleBody: { fontFamily: theme.typography.body, fontSize: theme.type.sm, lineHeight: 20, color: theme.colors.textPrimary },
  sectionTitle: { fontFamily: theme.typography.displayMedium, fontSize: theme.type.lg, color: theme.colors.textPrimary, marginBottom: 10 },
  sectionTitleInline: { marginBottom: 0 },
  proHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  card: { gap: 14, marginBottom: 24 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  toggleText: { flex: 1 },
  divider: { borderTopWidth: 1, borderTopColor: theme.colors.borderMuted, paddingTop: 14 },
  rowTitle: { fontFamily: theme.typography.bodyMedium, fontSize: theme.type.md, color: theme.colors.textPrimary },
  dimmed: { color: theme.colors.textSecondary },
  rowText: { fontFamily: theme.typography.body, fontSize: theme.type.sm, lineHeight: 20, color: theme.colors.textSecondary, marginTop: 2 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 44 },
  linkText: { fontFamily: theme.typography.bodySemibold, fontSize: theme.type.sm, color: theme.colors.accentPurpleDeep },
  applianceRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  applianceLabel: { flex: 1, fontFamily: theme.typography.body, fontSize: theme.type.md, color: theme.colors.textPrimary },
  chipLabel: { fontFamily: theme.typography.bodyMedium, fontSize: theme.type.sm, color: theme.colors.textSecondary },
  chipRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chipRowSpaced: { marginTop: 10 },
  optionList: { gap: 8 },
});
