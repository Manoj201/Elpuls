import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { IconFlask, IconPencil, IconPlus, IconReceipt, IconTrash } from '@tabler/icons-react-native';
import { db } from '../lib/firebase';
import { openManageSubscriptions } from '../lib/purchases';
import { useApplianceStore, type RegisteredAppliance } from '../stores/useApplianceStore';
import { useCountryStore } from '../stores/useCountryStore';
import { useUiStore } from '../stores/useUiStore';
import { useUserStore, type HeatingType } from '../stores/useUserStore';
import { theme } from '../theme';
import { Card } from '../components/Card';
import { Chip } from '../components/Chip';
import { InfoRow } from '../components/InfoRow';
import { OptionCard } from '../components/OptionCard';
import { PrimaryButton } from '../components/PrimaryButton';
import { SecondaryButton } from '../components/SecondaryButton';
import { LanguageSwitcher } from '../components/LanguageSwitcher';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const HEATING_VALUES: NonNullable<HeatingType>[] = ['district', 'electric', 'heat_pump', 'other'];

interface SettingsScreenProps {
  uid: string;
  onOpenApplianceScan: (editAppliance?: RegisteredAppliance) => void;
  onOpenBillScan: () => void;
  onDevReset: () => Promise<void>;
}

function parsePositiveFloat(value: string): number | null {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function SettingsScreen({ uid, onOpenApplianceScan, onOpenBillScan, onDevReset }: SettingsScreenProps) {
  const { t } = useTranslation();
  const config = useCountryStore((s) => s.config);
  const setActiveZone = useCountryStore((s) => s.setZone);
  const user = useUserStore();
  const setOnboardingInfo = useUserStore((s) => s.setOnboardingInfo);
  const setEstimatedMonthlyKwh = useUserStore((s) => s.setEstimatedMonthlyKwh);
  const setProStatus = useUserStore((s) => s.setProStatus);
  const showPaywall = useUiStore((s) => s.showPaywall);
  const [managingSubscription, setManagingSubscription] = useState(false);
  const registeredAppliances = useApplianceStore((s) => s.appliances);
  const fetchAppliances = useApplianceStore((s) => s.fetchAppliances);
  const deleteAppliance = useApplianceStore((s) => s.deleteAppliance);

  useEffect(() => {
    fetchAppliances(uid);
  }, [fetchAppliances, uid]);

  function handleDeleteAppliance(appliance: RegisteredAppliance) {
    Alert.alert(
      t('settings.deleteApplianceConfirmTitle'),
      t('settings.deleteApplianceConfirmMessage', { label: appliance.label }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('common.delete'), style: 'destructive', onPress: () => deleteAppliance(uid, appliance.id) },
      ],
    );
  }

  // Dev-only: lets Pro features be tested locally without a real purchase,
  // which isn't possible until RevenueCat + App Store/Play Store IAP
  // products exist (CLAUDE.md §12). __DEV__ is false in any real release
  // build, so this never ships. Session-only — configurePurchases() will
  // overwrite it back to the real (unsubscribed) status on next app launch.
  function setDevProOverride(enabled: boolean) {
    setProStatus({ isProSubscriber: enabled, periodType: enabled ? 'NORMAL' : null, expirationMillis: null });
  }

  const [resetting, setResetting] = useState(false);

  async function handleDevReset() {
    setResetting(true);
    try {
      await onDevReset();
    } finally {
      setResetting(false);
    }
  }

  async function handleManageSubscription() {
    setManagingSubscription(true);
    try {
      await openManageSubscriptions();
    } catch (err) {
      console.log('Could not open subscription management:', err);
    } finally {
      setManagingSubscription(false);
    }
  }

  const [zone, setZone] = useState(user.zone ?? config.zones[0]);
  const [heatingType, setHeatingType] = useState<HeatingType>(user.heatingType);
  const [hasSolar, setHasSolar] = useState(user.hasSolar);
  const [hasEv, setHasEv] = useState(user.hasEv);
  const [gridFeeFixedInput, setGridFeeFixedInput] = useState(
    user.gridFeeFixedSekPerMonth !== null ? String(user.gridFeeFixedSekPerMonth) : '',
  );
  const [gridFeeVariableInput, setGridFeeVariableInput] = useState(
    user.gridFeeVariableSekPerKwh !== null ? String(Math.round(user.gridFeeVariableSekPerKwh * 100)) : '',
  );
  const [estimatedMonthlyKwhInput, setEstimatedMonthlyKwhInput] = useState(
    user.estimatedMonthlyKwh !== null ? String(user.estimatedMonthlyKwh) : '',
  );
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  async function handleSave() {
    setSaving(true);
    const gridFeeFixedSekPerMonth = parsePositiveFloat(gridFeeFixedInput);
    const gridFeeVariableOre = parsePositiveFloat(gridFeeVariableInput);
    const estimatedMonthlyKwh = parsePositiveFloat(estimatedMonthlyKwhInput);
    const info = {
      zone,
      heatingType,
      hasEv,
      hasSolar,
      gridFeeFixedSekPerMonth,
      gridFeeVariableSekPerKwh: gridFeeVariableOre === null ? null : gridFeeVariableOre / 100,
    };

    try {
      await setDoc(doc(db, 'users', uid), { ...info, estimatedMonthlyKwh, updatedAt: serverTimestamp() }, { merge: true });
      setOnboardingInfo(info);
      setEstimatedMonthlyKwh(estimatedMonthlyKwh);
      setActiveZone(info.zone);
      setSavedAt(Date.now());
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>{t('settings.title')}</Text>

      <Section title={t('settings.subscriptionTitle')}>
        <Card style={styles.subscriptionCard}>
          <View style={styles.subscriptionRow}>
            <Chip label={user.isProSubscriber ? t('settings.proStatus') : t('settings.freeStatus')} variant={user.isProSubscriber ? 'amber' : 'neutral'} />
            <Text style={styles.trialDaysText}>
              {user.isProSubscriber && user.proPeriodType === 'TRIAL' && user.proExpirationMillis !== null
                ? t('trialBanner.daysLeft', { count: Math.max(0, Math.ceil((user.proExpirationMillis - Date.now()) / MS_PER_DAY)) })
                : user.isProSubscriber
                  ? t('settings.proActiveStatus')
                  : t('settings.freeStatusHint')}
            </Text>
          </View>
          <View style={styles.subscriptionDivider} />
          {user.isProSubscriber ? (
            <PrimaryButton
              label={managingSubscription ? t('settings.saving') : t('settings.manageSubscription')}
              onPress={handleManageSubscription}
              disabled={managingSubscription}
            />
          ) : (
            <PrimaryButton label={t('settings.upgrade')} onPress={showPaywall} />
          )}
        </Card>
      </Section>

      {__DEV__ && (
        <Section title={t('settings.devToolsTitle')}>
          <Card style={styles.subscriptionCard}>
            <InfoRow icon={IconFlask} variant="amber" title={t('settings.devForceProTitle')} subtitle={t('settings.devForceProSubtitle')} />
            <View style={styles.yesNoRow}>
              <Chip label={t('common.yes')} selected={user.isProSubscriber} onPress={() => setDevProOverride(true)} />
              <Chip label={t('common.no')} selected={!user.isProSubscriber} onPress={() => setDevProOverride(false)} />
            </View>
          </Card>
          <Card style={styles.devClearCard}>
            <InfoRow icon={IconTrash} variant="danger" title={t('settings.devClearStorageTitle')} subtitle={t('settings.devClearStorageSubtitle')} />
            <SecondaryButton
              label={resetting ? t('settings.saving') : t('settings.devClearStorageButton')}
              onPress={handleDevReset}
              disabled={resetting}
            />
          </Card>
        </Section>
      )}

      <Section title={t('settings.zoneTitle')}>
        <View style={styles.zoneRow}>
          {config.zones.map((z) => (
            <Chip key={z} label={z} selected={z === zone} onPress={() => setZone(z)} />
          ))}
        </View>
      </Section>

      <Section title={t('settings.heatingTitle')}>
        <View style={styles.optionList}>
          {HEATING_VALUES.map((value) => (
            <OptionCard
              key={value}
              label={t(`onboarding.heating.${value}`)}
              selected={heatingType === value}
              onPress={() => setHeatingType(value)}
            />
          ))}
        </View>
      </Section>

      <Section title={t('onboarding.solarTitle')}>
        <View style={styles.yesNoRow}>
          <Chip label={t('common.yes')} selected={hasSolar} onPress={() => setHasSolar(true)} />
          <Chip label={t('common.no')} selected={!hasSolar} onPress={() => setHasSolar(false)} />
        </View>
      </Section>

      <Section title={t('onboarding.evTitle')}>
        <View style={styles.yesNoRow}>
          <Chip label={t('common.yes')} selected={hasEv} onPress={() => setHasEv(true)} />
          <Chip label={t('common.no')} selected={!hasEv} onPress={() => setHasEv(false)} />
        </View>
      </Section>

      <Section title={t('onboarding.gridFeeTitle')}>
        <TextInput
          style={styles.gridFeeInput}
          placeholder={t('onboarding.gridFeeFixedPlaceholder')}
          placeholderTextColor={theme.colors.textFaint}
          keyboardType="numeric"
          value={gridFeeFixedInput}
          onChangeText={setGridFeeFixedInput}
        />
        <TextInput
          style={styles.gridFeeInput}
          placeholder={t('onboarding.gridFeeVariablePlaceholder')}
          placeholderTextColor={theme.colors.textFaint}
          keyboardType="numeric"
          value={gridFeeVariableInput}
          onChangeText={setGridFeeVariableInput}
        />
        <TextInput
          style={styles.gridFeeInput}
          placeholder={t('settings.estimatedMonthlyKwhPlaceholder')}
          placeholderTextColor={theme.colors.textFaint}
          keyboardType="numeric"
          value={estimatedMonthlyKwhInput}
          onChangeText={setEstimatedMonthlyKwhInput}
        />
        <Pressable onPress={onOpenBillScan}>
          <Card style={styles.entryCard}>
            <InfoRow icon={IconReceipt} title={t('settings.billScanTitle')} subtitle={t('settings.billScanSubtitle')} />
          </Card>
        </Pressable>
      </Section>

      <Section title={t('settings.appliancesTitle')}>
        {registeredAppliances.map((appliance) => (
          <Card key={appliance.id} style={styles.applianceRow}>
            <View style={styles.applianceRowLeft}>
              <Text style={styles.applianceLabel}>{appliance.label}</Text>
              <Chip label={`${appliance.watts} W`} variant="neutral" />
            </View>
            <View style={styles.applianceRowActions}>
              <Pressable onPress={() => onOpenApplianceScan(appliance)} hitSlop={8}>
                <IconPencil size={20} color={theme.colors.textSecondary} />
              </Pressable>
              <Pressable onPress={() => handleDeleteAppliance(appliance)} hitSlop={8}>
                <IconTrash size={20} color={theme.colors.dangerEmber} />
              </Pressable>
            </View>
          </Card>
        ))}
        <Pressable onPress={() => onOpenApplianceScan()}>
          <Card style={styles.entryCard}>
            <InfoRow icon={IconPlus} title={t('settings.addApplianceTitle')} subtitle={t('settings.addApplianceSubtitle')} />
          </Card>
        </Pressable>
      </Section>

      <Section title={t('settings.languageTitle')}>
        <LanguageSwitcher />
      </Section>

      <PrimaryButton label={saving ? t('settings.saving') : t('settings.save')} onPress={handleSave} disabled={saving} />
      {savedAt !== null && <Text style={styles.savedHint}>{t('settings.saved')}</Text>}
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingTop: 60, paddingBottom: 48 },
  title: { fontFamily: theme.typography.display, fontSize: 26, color: theme.colors.textPrimary, marginBottom: 24 },
  section: { marginBottom: 24 },
  sectionTitle: {
    fontFamily: theme.typography.bodyMedium,
    fontSize: 12,
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  zoneRow: { flexDirection: 'row', gap: 8 },
  optionList: { gap: 10 },
  yesNoRow: { flexDirection: 'row', gap: 8 },
  gridFeeInput: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontFamily: theme.typography.body,
    fontSize: 15,
    color: theme.colors.textPrimary,
    marginBottom: 10,
  },
  entryCard: { marginTop: 4 },
  applianceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  applianceRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
  applianceLabel: { fontFamily: theme.typography.bodyMedium, fontSize: 15, color: theme.colors.textPrimary, flexShrink: 1 },
  applianceRowActions: { flexDirection: 'row', gap: 16 },
  subscriptionCard: { gap: 14 },
  devClearCard: { gap: 14, marginTop: 12 },
  subscriptionRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  subscriptionDivider: { height: 1, backgroundColor: theme.colors.borderMuted },
  trialDaysText: { fontFamily: theme.typography.body, fontSize: 13, color: theme.colors.textMuted },
  savedHint: {
    fontFamily: theme.typography.body,
    fontSize: 13,
    color: theme.colors.positiveTealDeep,
    textAlign: 'center',
    marginTop: 10,
  },
});
