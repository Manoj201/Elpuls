import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { IconBellRinging, IconFlask, IconPencil, IconPlus, IconReceipt, IconTrash, IconUserCircle } from '@tabler/icons-react-native';
import { db } from '../lib/firebase';
import { openManageSubscriptions } from '../lib/purchases';
import { authErrorKey, currentEmail, isGuest, linkGuestToEmail } from '../lib/auth';
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
import { LabeledInput } from '../components/LabeledInput';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const HEATING_VALUES: NonNullable<HeatingType>[] = ['district', 'electric', 'heat_pump', 'other'];

interface SettingsScreenProps {
  uid: string;
  onOpenApplianceScan: (editAppliance?: RegisteredAppliance) => void;
  onOpenBillScan: () => void;
  onDevReset: () => Promise<void>;
  onAccountDeleted: () => Promise<void>;
  onSignedIn: (uid: string) => Promise<void>;
  onSignedOut: () => Promise<void>;
}

/** Accepts Swedish decimal commas ("24,5") as well as dots. */
function parsePositiveFloat(value: string): number | null {
  const parsed = parseFloat(value.replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function SettingsScreen({ uid, onOpenApplianceScan, onOpenBillScan, onDevReset, onAccountDeleted, onSignedIn, onSignedOut }: SettingsScreenProps) {
  const { t } = useTranslation();
  const config = useCountryStore((s) => s.config);
  const setActiveZone = useCountryStore((s) => s.setZone);
  const user = useUserStore();
  const setOnboardingInfo = useUserStore((s) => s.setOnboardingInfo);
  const setEstimatedMonthlyKwh = useUserStore((s) => s.setEstimatedMonthlyKwh);
  const setPriceAlertPrefs = useUserStore((s) => s.setPriceAlertPrefs);
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

  // Account status is read from Firebase Auth on render; bumped after
  // create-account so the card switches from "Guest" to "Signed in".
  const [, setAccountVersion] = useState(0);
  const guest = isGuest();
  const email = currentEmail();
  const [accountEmail, setAccountEmail] = useState('');
  const [accountPassword, setAccountPassword] = useState('');
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);

  async function handleCreateAccount() {
    if (!accountEmail.trim() || !accountPassword) {
      setAccountError(t('login.missingFields'));
      return;
    }
    setCreatingAccount(true);
    setAccountError(null);
    try {
      const newUid = await linkGuestToEmail(accountEmail, accountPassword);
      setAccountPassword('');
      setAccountVersion((v) => v + 1);
      await onSignedIn(newUid);
    } catch (err) {
      console.log('Create account failed:', err);
      setAccountError(t(authErrorKey(err)));
    } finally {
      setCreatingAccount(false);
    }
  }

  function handleSignOut() {
    Alert.alert(t('settings.signOutConfirmTitle'), t(user.isProSubscriber ? 'settings.signOutConfirmMessagePro' : 'settings.signOutConfirmMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('settings.signOut'),
        style: 'destructive',
        onPress: async () => {
          setSigningOut(true);
          setAccountError(null);
          try {
            await onSignedOut();
          } catch (err) {
            console.log('Sign out failed:', err);
            setAccountError(t(authErrorKey(err)));
            setSigningOut(false);
          }
        },
      },
    ]);
  }

  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState<string | null>(null);

  async function performAccountDeletion() {
    setDeletingAccount(true);
    setDeleteAccountError(null);
    try {
      await onAccountDeleted();
    } catch (err) {
      setDeleteAccountError(err instanceof Error ? err.message : String(err));
      setDeletingAccount(false);
    }
  }

  function handleDeleteAccount() {
    Alert.alert(t('settings.deleteAccountConfirmTitle'), t('settings.deleteAccountConfirmMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: performAccountDeletion },
    ]);
  }

  const [zone, setZone] = useState(user.zone ?? config.zones[0]);
  const [heatingType, setHeatingType] = useState<HeatingType>(user.heatingType);
  const [hasSolar, setHasSolar] = useState(user.hasSolar);
  const [hasEv, setHasEv] = useState(user.hasEv);
  const [gridFeeFixedInput, setGridFeeFixedInput] = useState(
    user.gridFeeFixedSekPerMonth !== null ? String(user.gridFeeFixedSekPerMonth) : '',
  );
  const [gridFeeVariableInput, setGridFeeVariableInput] = useState(
    user.gridFeeVariableSekPerKwh !== null ? String(Number((user.gridFeeVariableSekPerKwh * 100).toFixed(2))) : '',
  );
  const [estimatedMonthlyKwhInput, setEstimatedMonthlyKwhInput] = useState(
    user.estimatedMonthlyKwh !== null ? String(user.estimatedMonthlyKwh) : '',
  );
  const [priceAlertHighInput, setPriceAlertHighInput] = useState(
    user.priceAlertHighThresholdOre !== null ? String(user.priceAlertHighThresholdOre) : '',
  );
  const [priceAlertLowEnabled, setPriceAlertLowEnabled] = useState(user.priceAlertLowEnabled);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  async function handleSave() {
    setSaving(true);
    const gridFeeFixedSekPerMonth = parsePositiveFloat(gridFeeFixedInput);
    const gridFeeVariableOre = parsePositiveFloat(gridFeeVariableInput);
    const estimatedMonthlyKwh = parsePositiveFloat(estimatedMonthlyKwhInput);
    const priceAlertHighThresholdOre = parsePositiveFloat(priceAlertHighInput);
    const info = {
      zone,
      heatingType,
      hasEv,
      hasSolar,
      gridFeeFixedSekPerMonth,
      gridFeeVariableSekPerKwh: gridFeeVariableOre === null ? null : gridFeeVariableOre / 100,
    };

    try {
      await setDoc(
        doc(db, 'users', uid),
        { ...info, estimatedMonthlyKwh, priceAlertHighThresholdOre, priceAlertLowEnabled, updatedAt: serverTimestamp() },
        { merge: true },
      );
      setOnboardingInfo(info);
      setEstimatedMonthlyKwh(estimatedMonthlyKwh);
      setPriceAlertPrefs(priceAlertHighThresholdOre, priceAlertLowEnabled);
      setActiveZone(info.zone);
      setSavedAt(Date.now());
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
      <Text style={styles.title}>{t('settings.title')}</Text>

      <GroupHeader first title={t('settings.groupHome')} subtitle={t('settings.groupHomeSubtitle')} />
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
        <LabeledInput
          label={t('fields.gridFeeFixedLabel')}
          unit={t('fields.unitKrPerMonth')}
          placeholder={t('fields.exampleGridFeeFixed')}
          keyboardType="decimal-pad"
          value={gridFeeFixedInput}
          onChangeText={setGridFeeFixedInput}
        />
        <LabeledInput
          label={t('fields.gridFeeVariableLabel')}
          unit={t('fields.unitOrePerKwh')}
          placeholder={t('fields.exampleGridFeeVariable')}
          keyboardType="decimal-pad"
          value={gridFeeVariableInput}
          onChangeText={setGridFeeVariableInput}
        />
        <LabeledInput
          label={t('fields.estimatedMonthlyKwhLabel')}
          unit={t('fields.unitKwhPerMonth')}
          placeholder={t('fields.exampleMonthlyKwh')}
          helper={t('fields.estimatedMonthlyKwhHelper')}
          keyboardType="decimal-pad"
          value={estimatedMonthlyKwhInput}
          onChangeText={setEstimatedMonthlyKwhInput}
        />
        <Pressable onPress={onOpenBillScan}>
          <Card style={styles.entryCard}>
            <InfoRow
              icon={IconReceipt}
              variant={user.retailerMarkupSekPerKwh !== null ? 'teal' : 'neutral'}
              title={t('settings.billScanTitle')}
              subtitle={
                user.retailerMarkupSekPerKwh !== null
                  ? t('fields.retailerMarkupScanned', { value: Number((user.retailerMarkupSekPerKwh * 100).toFixed(2)) })
                  : t('settings.billScanSubtitle')
              }
            />
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

      <GroupHeader title={t('settings.groupNotifications')} />
      <Section title={t('settings.priceAlertsTitle')}>
        <Text style={styles.sectionSubtitle}>{t('settings.priceAlertsSubtitle')}</Text>
        <LabeledInput
          label={t('fields.priceAlertHighLabel')}
          unit={t('fields.unitOrePerKwh')}
          placeholder={t('fields.examplePriceAlert')}
          helper={t('fields.priceAlertHighHelper')}
          keyboardType="decimal-pad"
          value={priceAlertHighInput}
          onChangeText={setPriceAlertHighInput}
        />
        <Card style={styles.toggleCard}>
          <View style={styles.toggleText}>
            <InfoRow icon={IconBellRinging} title={t('settings.priceAlertLowTitle')} subtitle={t('settings.priceAlertLowSubtitle')} />
          </View>
          <Switch
            value={priceAlertLowEnabled}
            onValueChange={setPriceAlertLowEnabled}
            trackColor={{ false: theme.colors.borderMuted, true: theme.colors.accentPurple }}
            accessibilityLabel={t('settings.priceAlertLowTitle')}
          />
        </Card>
      </Section>

      <View style={styles.saveBlock}>
      <PrimaryButton label={saving ? t('settings.saving') : t('settings.saveChanges')} onPress={handleSave} disabled={saving} />
      {savedAt !== null && <Text style={styles.savedHint}>{t('settings.saved')}</Text>}
      </View>

      <GroupHeader title={t('settings.groupApp')} />
      <Section title={t('settings.languageTitle')}>
        <LanguageSwitcher />
      </Section>

      <GroupHeader title={t('settings.groupAccount')} />
      <Section title={t('settings.accountTitle')}>
        <Card style={styles.accountCard}>
          <InfoRow
            icon={IconUserCircle}
            title={guest ? t('settings.accountGuestTitle') : t('settings.accountSignedInTitle', { email: email ?? '' })}
            subtitle={guest ? t('settings.accountGuestSubtitle') : t('settings.accountSignedInSubtitle')}
          />
          {guest ? (
            <>
              <TextInput
                style={styles.accountInput}
                placeholder={t('login.emailPlaceholder')}
                placeholderTextColor={theme.colors.textFaint}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="username"
                autoComplete="username"
                value={accountEmail}
                onChangeText={setAccountEmail}
              />
              <TextInput
                style={styles.accountInput}
                placeholder={t('login.passwordPlaceholder')}
                placeholderTextColor={theme.colors.textFaint}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                // 'oneTimeCode' opts out of iOS "Automatic Strong Password",
                // which without associated domains shows a yellow
                // "cover view text" box over this create-account field.
                textContentType="oneTimeCode"
                autoComplete="off"
                value={accountPassword}
                onChangeText={setAccountPassword}
              />
              <Text style={styles.accountHint}>{t('login.passwordHint')}</Text>
              <PrimaryButton
                label={creatingAccount ? t('settings.saving') : t('login.createAccount')}
                onPress={handleCreateAccount}
                disabled={creatingAccount}
              />
            </>
          ) : (
            <SecondaryButton label={signingOut ? t('settings.saving') : t('settings.signOut')} onPress={handleSignOut} disabled={signingOut} />
          )}
          {accountError && <Text style={styles.error}>{accountError}</Text>}
        </Card>
      </Section>

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

      <Section title={t('settings.dangerZoneTitle')}>
        <Card style={styles.accountCard}>
          <InfoRow
            icon={IconTrash}
            variant="danger"
            title={t('settings.deleteAccountTitle')}
            subtitle={user.isProSubscriber ? t('settings.deleteAccountSubtitlePro') : t('settings.deleteAccountSubtitle')}
          />
          <SecondaryButton
            label={deletingAccount ? t('settings.saving') : t('settings.deleteAccountButton')}
            onPress={handleDeleteAccount}
            disabled={deletingAccount}
          />
          {deleteAccountError && <Text style={styles.error}>{deleteAccountError}</Text>}
        </Card>
      </Section>

      {__DEV__ && (
        <>
          <GroupHeader title={t('settings.groupDeveloper')} subtitle={t('settings.groupDeveloperSubtitle')} />
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
        </>
      )}
    </ScrollView>
  );
}

function GroupHeader({ title, subtitle, first }: { title: string; subtitle?: string; first?: boolean }) {
  return (
    <View style={[styles.groupHeader, first && styles.groupHeaderFirst]}>
      <Text style={styles.groupTitle}>{title}</Text>
      {subtitle ? <Text style={styles.groupSubtitle}>{subtitle}</Text> : null}
    </View>
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
  groupHeader: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderMuted,
    paddingTop: 20,
    marginTop: 8,
    marginBottom: 16,
  },
  groupTitle: { fontFamily: theme.typography.display, fontSize: 20, color: theme.colors.textPrimary },
  groupSubtitle: { fontFamily: theme.typography.body, fontSize: 13, color: theme.colors.textMuted, marginTop: 4, lineHeight: 18 },
  groupHeaderFirst: { borderTopWidth: 0, paddingTop: 0, marginTop: 0 },
  saveBlock: { marginBottom: 32 },
  accountCard: { gap: 14 },
  sectionTitle: {
    fontFamily: theme.typography.bodyMedium,
    fontSize: 12,
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  sectionSubtitle: {
    fontFamily: theme.typography.body,
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginBottom: 12,
    lineHeight: 18,
  },
  zoneRow: { flexDirection: 'row', gap: 8 },
  optionList: { gap: 10 },
  yesNoRow: { flexDirection: 'row', gap: 8 },
  accountInput: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingVertical: 12,
    paddingHorizontal: 16,
    fontFamily: theme.typography.body,
    fontSize: 15,
    color: theme.colors.textPrimary,
  },
  accountHint: { fontFamily: theme.typography.body, fontSize: 12, color: theme.colors.textFaint },
  entryCard: { marginTop: 4 },
  toggleCard: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  toggleText: { flex: 1 },
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
  error: {
    fontFamily: theme.typography.body,
    fontSize: 13,
    color: theme.colors.dangerEmber,
  },
});
