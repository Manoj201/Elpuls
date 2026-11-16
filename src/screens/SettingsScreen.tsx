import { useEffect, useState, type ComponentType } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import Constants from 'expo-constants';
import { useTranslation } from 'react-i18next';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import {
  IconArrowLeft,
  IconBellRinging,
  IconChargingPile,
  IconChevronRight,
  IconCircle,
  IconCircleCheck,
  IconExternalLink,
  IconFileText,
  IconFlame,
  IconFlask,
  IconHelpCircle,
  IconLanguage,
  IconMail,
  IconMapPin,
  IconPencil,
  IconPlus,
  IconReceipt,
  IconShieldLock,
  IconSparkles,
  IconSun,
  IconTrash,
  IconUserCircle,
  IconWash,
} from '@tabler/icons-react-native';
import { db } from '../lib/firebase';
import { openManageSubscriptions } from '../lib/purchases';
import { authErrorKey, currentEmail, isGuest, linkGuestToEmail } from '../lib/auth';
import { useApplianceStore, type RegisteredAppliance } from '../stores/useApplianceStore';
import { APPLIANCE_PRESETS } from '../config/appliances';
import { APPLIANCE_ICONS, householdDefaultIds, matchPresetId, resolveApplianceLabel } from '../lib/applianceDisplay';
import { useCountryStore } from '../stores/useCountryStore';
import { usePriceStore } from '../stores/usePriceStore';
import { findCurrentPrice } from '../lib/priceUtils';
import { calculateLandedPrice, ENERGY_TAX_SEK_PER_KWH_EXCL_VAT, VAT_RATE } from '../lib/landedCost';
import { useUiStore } from '../stores/useUiStore';
import { useUserStore, type HeatingType, type UserProfile } from '../stores/useUserStore';
import { theme } from '../theme';
import { Card } from '../components/Card';
import { Chip } from '../components/Chip';
import { InfoRow } from '../components/InfoRow';
import { OptionCard } from '../components/OptionCard';
import { PrimaryButton } from '../components/PrimaryButton';
import { SecondaryButton } from '../components/SecondaryButton';
import { LanguageSwitcher } from '../components/LanguageSwitcher';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const PRIVACY_URL = 'https://elpuls.ravenbees.com/privacy';
const TERMS_URL = 'https://elpuls.ravenbees.com/terms';
// Same contact address as the website's privacy policy.
const SUPPORT_EMAIL = 'manoj.gam201@gmail.com';

const HEATING_VALUES: NonNullable<HeatingType>[] = ['heat_pump', 'district', 'electric', 'other'];

interface SettingsScreenProps {
  uid: string;
  onOpenApplianceScan: (editAppliance?: RegisteredAppliance) => void;
  onOpenBillScan: (manual?: boolean) => void;
  onOpenNotifications: () => void;
  onOpenGuide: () => void;
  onDevReset: () => Promise<void>;
  onAccountDeleted: () => Promise<void>;
  onSignedIn: (uid: string) => Promise<void>;
  onSignedOut: () => Promise<void>;
}

/** 24.5 → "24,5" (Swedish decimal comma), at most 2 decimals. */
function formatDecimal(value: number): string {
  return String(Number(value.toFixed(2))).replace('.', ',');
}

export function SettingsScreen({
  uid,
  onOpenApplianceScan,
  onOpenBillScan,
  onOpenNotifications,
  onOpenGuide,
  onDevReset,
  onAccountDeleted,
  onSignedIn,
  onSignedOut,
}: SettingsScreenProps) {
  const { t, i18n } = useTranslation();
  const config = useCountryStore((s) => s.config);
  const setActiveZone = useCountryStore((s) => s.setZone);
  const user = useUserStore();
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

  // Standard household: switch off what this home doesn't have. Saved right
  // away (like the appliance list), not through the Save bar.
  const setDisabledDefaultAppliances = useUserStore((s) => s.setDisabledDefaultAppliances);
  const replacedDefaults = new Set(registeredAppliances.map((a) => matchPresetId(a.label)).filter(Boolean));

  function toggleDefaultAppliance(presetId: string, has: boolean) {
    const current = useUserStore.getState().disabledDefaultAppliances;
    const next = has ? current.filter((id) => id !== presetId) : [...new Set([...current, presetId])];
    setDisabledDefaultAppliances(next);
    setDoc(doc(db, 'users', uid), { disabledDefaultAppliances: next, updatedAt: serverTimestamp() }, { merge: true }).catch((err) =>
      console.log('Saving household appliances failed:', err),
    );
  }

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

  // Every change on this screen saves right away (like Notiser and the
  // appliance switches) with a short "Sparat" confirmation. No Save button.
  const [toast, setToast] = useState<'saved' | 'error' | null>(null);
  useEffect(() => {
    if (toast === null) return;
    const timer = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(timer);
  }, [toast]);

  function saveProfile(changes: Partial<UserProfile>) {
    useUserStore.setState(changes);
    if (changes.zone) setActiveZone(changes.zone);
    setDoc(doc(db, 'users', uid), { ...changes, updatedAt: serverTimestamp() }, { merge: true })
      .then(() => setToast('saved'))
      .catch((err) => {
        console.log('Saving settings failed:', err);
        setToast('error');
      });
  }

  // Settings is a short list of summary rows; a row opens its own page.
  const [page, setPage] = useState<SettingsPage | null>(null);

  const hasGridFee = user.gridFeeVariableSekPerKwh !== null;
  const hasMarkup = user.retailerMarkupSekPerKwh !== null;

  // "3 av 7 på · Tyst 22–07": what's switched on, at a glance.
  const prefs = user.notificationPrefs;
  const heatsWithElectricity = user.heatingType === 'electric' || user.heatingType === 'heat_pump';
  const freeSwitches = [prefs.pricesPublished, user.priceAlertHighThresholdOre !== null, user.priceAlertLowEnabled];
  const proSwitches = [prefs.applianceWindows, prefs.cheapNow, prefs.dailyBriefing, ...(heatsWithElectricity ? [prefs.heatAhead] : [])];
  const switches = user.isProSubscriber ? [...freeSwitches, ...proSwitches] : freeSwitches;
  const notifySummary = [
    t('settings.notifyOnCount', { on: switches.filter(Boolean).length, total: switches.length }),
    user.isProSubscriber
      ? t('settings.notifyQuiet', { from: String(prefs.quietStartHour).padStart(2, '0'), to: String(prefs.quietEndHour).padStart(2, '0') })
      : t('settings.notifyProHint'),
  ].join(' · ');

  const todayPrices = usePriceStore((s) => s.todayPrices);
  const spotNow = findCurrentPrice(todayPrices, new Date());
  const realPriceNow =
    spotNow && user.gridFeeVariableSekPerKwh !== null
      ? {
          spot: Math.round(spotNow.price * 100),
          paid: Math.round(calculateLandedPrice(spotNow.price, user.gridFeeVariableSekPerKwh, user.retailerMarkupSekPerKwh) * 100),
        }
      : null;

  const proStatusText =
    user.proPeriodType === 'TRIAL' && user.proExpirationMillis !== null
      ? t('trialBanner.daysLeft', { count: Math.max(0, Math.ceil((user.proExpirationMillis - Date.now()) / MS_PER_DAY)) })
      : t('settings.proActiveStatus');
  const zoneValue = user.zone ? `${user.zone} · ${t(`onboarding.zoneName.${user.zone}`)}` : t('settings.notChosen');
  const heatingValue = user.heatingType ? t(`onboarding.heating.${user.heatingType}`) : t('settings.notChosen');
  const activeDefaults = householdDefaultIds(user.hasEv).filter(
    (id) => !user.disabledDefaultAppliances.includes(id) && !replacedDefaults.has(id),
  ).length;
  const applianceCount = activeDefaults + registeredAppliances.length;
  const languageValue = i18n.language === 'sv' ? 'Svenska' : 'English';
  const appVersion = Constants.expoConfig?.version ?? '';

  const toastView = toast !== null && (
    <View style={[styles.toast, toast === 'error' && styles.toastError]} accessibilityLiveRegion="polite" pointerEvents="none">
      <Text style={styles.toastText}>{t(toast === 'saved' ? 'settings.saved' : 'common.saveFailed')}</Text>
    </View>
  );

  if (page !== null) {
    return (
      <View style={styles.root}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <Pressable onPress={() => setPage(null)} hitSlop={12} style={styles.backRow} accessibilityRole="button" accessibilityLabel={t('common.back')}>
            <IconArrowLeft size={22} color={theme.colors.textSecondary} />
            <Text style={styles.backText}>{t('settings.title')}</Text>
          </Pressable>
          <Text style={styles.title} accessibilityRole="header">
            {t(`settings.page.${page}`)}
          </Text>

          {page === 'zone' && (
            <View style={styles.optionList}>
              {config.zones.map((z) => (
                <OptionCard
                  key={z}
                  label={`${z} · ${t(`onboarding.zoneName.${z}`)}`}
                  description={t(`onboarding.zoneTowns.${z}`)}
                  selected={z === user.zone}
                  onPress={() => saveProfile({ zone: z })}
                />
              ))}
              <Text style={styles.sectionSubtitle}>{t('onboarding.zoneBillHint')}</Text>
            </View>
          )}

          {page === 'heating' && (
            <>
              <Text style={styles.sectionSubtitle}>{t('onboarding.heatingSubtitle')}</Text>
              <View style={styles.optionList}>
                {HEATING_VALUES.map((value) => (
                  <OptionCard
                    key={value}
                    label={t(`onboarding.heating.${value}`)}
                    description={t(`onboarding.heatingDesc.${value}`)}
                    selected={user.heatingType === value}
                    onPress={() => saveProfile({ heatingType: value })}
                  />
                ))}
              </View>
            </>
          )}

          {page === 'appliances' && (
            <>
        <Text style={styles.sectionSubtitle}>{t('settings.householdIntro')}</Text>
        <Card style={styles.householdCard}>
          {householdDefaultIds(user.hasEv).map((presetId, index) => {
            const preset = APPLIANCE_PRESETS.find((p) => p.id === presetId)!;
            const Icon = APPLIANCE_ICONS[presetId];
            const label = resolveApplianceLabel(preset, t);
            const replaced = replacedDefaults.has(presetId);
            const has = !user.disabledDefaultAppliances.includes(presetId);
            return (
              <View key={presetId} style={[styles.householdRow, index > 0 && styles.householdRowDivider]}>
                {Icon ? <Icon size={20} color={theme.colors.textSecondary} /> : null}
                <View style={styles.householdText}>
                  <Text style={styles.householdLabel}>{label}</Text>
                  {replaced && <Text style={styles.householdNote}>{t('settings.householdReplaced')}</Text>}
                </View>
                {!replaced && (
                  <Switch
                    value={has}
                    onValueChange={(value) => toggleDefaultAppliance(presetId, value)}
                    trackColor={{ false: theme.colors.borderMuted, true: theme.colors.accentPurple }}
                    accessibilityLabel={t('settings.householdHasA11y', { appliance: label })}
                  />
                )}
              </View>
            );
          })}
        </Card>

        <Text style={styles.subSectionLabel}>{t('settings.registeredAppliancesTitle')}</Text>
        {registeredAppliances.map((appliance) => (
          <Card key={appliance.id} style={styles.applianceRow}>
            <View style={styles.applianceRowLeft}>
              <Text style={styles.applianceLabel}>{appliance.label}</Text>
              <Chip label={`${appliance.watts} W`} variant="neutral" />
            </View>
            <View style={styles.applianceRowActions}>
              <Pressable
                onPress={() => onOpenApplianceScan(appliance)}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel={t('settings.editApplianceA11y', { appliance: appliance.label })}
              >
                <IconPencil size={20} color={theme.colors.textSecondary} />
              </Pressable>
              <Pressable
                onPress={() => handleDeleteAppliance(appliance)}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel={t('settings.deleteApplianceA11y', { appliance: appliance.label })}
              >
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
            </>
          )}

          {page === 'language' && <LanguageSwitcher />}
        </ScrollView>
        {toastView}
      </View>
    );
  }

  return (
    <View style={styles.root}>
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
      <Text style={styles.title} accessibilityRole="header">
        {t('settings.title')}
      </Text>

      {!user.isProSubscriber && (
        <Pressable onPress={() => showPaywall('settings')} accessibilityRole="button" style={styles.topCard}>
          <Card style={styles.proCard}>
            <InfoRow icon={IconSparkles} variant="amber" title={t('settings.proCardTitle')} subtitle={t('settings.proCardText')} />
            <PrimaryButton size="compact" label={user.trialDays ? t('pro.tryFree', { days: user.trialDays }) : t('pro.getPro')} onPress={() => showPaywall('settings')} />
          </Card>
        </Pressable>
      )}

      {user.isProSubscriber && (
        <Pressable
          onPress={handleManageSubscription}
          accessibilityRole="button"
          accessibilityLabel={`${t('settings.proCardTitle')}. ${proStatusText}. ${t('settings.manage')}`}
          style={({ pressed }) => [styles.proStatus, pressed && styles.pressed]}
        >
          <View style={styles.proStatusIcon}>
            <IconSparkles size={20} color={theme.colors.accentAmberDeep} />
          </View>
          <View style={styles.proStatusTextWrap}>
            <Text style={styles.proStatusTitle}>{t('settings.proCardTitle')}</Text>
            <Text style={styles.proStatusText}>{proStatusText}</Text>
          </View>
          <Text style={styles.proStatusManage}>{t('settings.manage')}</Text>
          <IconChevronRight size={18} color={theme.colors.textSecondary} />
        </Pressable>
      )}

      <Card style={styles.realPriceCard}>
        <InfoRow
          icon={IconReceipt}
          variant={hasGridFee && hasMarkup ? 'teal' : 'neutral'}
          title={t('settings.realPriceTitle')}
          subtitle={t('settings.realPriceText')}
        />

        {/* The point of the card: the user's own price right now. */}
        {realPriceNow && (
          <View style={styles.realPriceNow} accessible accessibilityLabel={t('settings.realPriceNowA11y', realPriceNow)}>
            <Text style={styles.realPriceValue}>
              {realPriceNow.paid} <Text style={styles.realPriceUnit}>{t('fields.unitOrePerKwh')}</Text>
            </Text>
            <Text style={styles.realPriceCaption}>{t('settings.realPriceNowCaption')}</Text>
            <View style={styles.spotLine}>
              <Text style={styles.spotLineLabel}>{t('settings.spotNow')}</Text>
              <Text style={styles.spotLineValue}>{t('settings.valueOreShort', { value: realPriceNow.spot })}</Text>
            </View>
          </View>
        )}

        <View>
          {[
            {
              key: 'retailer',
              done: hasMarkup,
              company: user.retailerName,
              perKwhLabel: t('settings.markupLabel'),
              perKwh: user.retailerMarkupSekPerKwh,
              perMonth: user.retailerFixedSekPerMonth,
            },
            {
              key: 'grid',
              done: hasGridFee,
              company: user.gridCompanyName,
              perKwhLabel: t('settings.gridFeeLabel'),
              perKwh: user.gridFeeVariableSekPerKwh,
              perMonth: user.gridFeeFixedSekPerMonth,
            },
          ].map((row, index) => (
            // Company name on its own line (long names like "Vattenfall Eldistribution
            // AB" wrapped mid-title), and each fee as a label/value line, so öre/kWh
            // and kr/mån are never joined with a "+".
            <View
              key={row.key}
              style={[styles.statusRow, index > 0 && styles.statusRowDivider]}
              accessible
              accessibilityLabel={[
                t(`settings.realPrice.${row.key}`),
                row.company,
                row.done && row.perKwh !== null ? `${row.perKwhLabel} ${t('settings.valueOre', { value: formatDecimal(row.perKwh * 100) })}` : null,
                row.done && row.perMonth !== null ? `${t('settings.fixedFeeLabel')} ${t('settings.valueKrMonth', { value: Math.round(row.perMonth) })}` : null,
                row.done ? null : t(`settings.realPrice.${row.key}Missing`),
              ]
                .filter(Boolean)
                .join(', ')}
            >
              {row.done ? (
                <IconCircleCheck size={22} color={theme.colors.positiveTeal} />
              ) : (
                <IconCircle size={22} color={theme.colors.textMuted} />
              )}
              <View style={styles.statusText}>
                <Text style={styles.statusLabel}>{t(`settings.realPrice.${row.key}`)}</Text>
                {row.company ? (
                  <Text style={styles.statusCompany} numberOfLines={1}>
                    {row.company}
                  </Text>
                ) : null}
                {row.done ? (
                  <View style={styles.feeList}>
                    {row.perKwh !== null && (
                      <View style={styles.feeLine}>
                        <Text style={styles.feeLabel}>{row.perKwhLabel}</Text>
                        <Text style={styles.feeValue}>{t('settings.valueOre', { value: formatDecimal(row.perKwh * 100) })}</Text>
                      </View>
                    )}
                    {row.perMonth !== null && (
                      <View style={styles.feeLine}>
                        <Text style={styles.feeLabel}>{t('settings.fixedFeeLabel')}</Text>
                        <Text style={styles.feeValue}>{t('settings.valueKrMonth', { value: Math.round(row.perMonth) })}</Text>
                      </View>
                    )}
                  </View>
                ) : (
                  <Text style={styles.statusValue}>{t(`settings.realPrice.${row.key}Missing`)}</Text>
                )}
              </View>
            </View>
          ))}
        </View>

        <Text style={styles.taxNote}>
          {t('settings.taxIncluded', {
            tax: formatDecimal(ENERGY_TAX_SEK_PER_KWH_EXCL_VAT * 100),
            vat: Math.round(VAT_RATE * 100),
          })}
        </Text>

        <View style={styles.realPriceActions}>
          <SecondaryButton
            size="compact"
            label={t(hasGridFee && hasMarkup ? 'settings.scanNewBill' : 'settings.scanBill')}
            onPress={() => onOpenBillScan()}
          />
          <Pressable onPress={() => onOpenBillScan(true)} hitSlop={8} style={styles.textLink} accessibilityRole="button">
            <Text style={styles.textLinkLabel}>{t('settings.enterFeesManually')}</Text>
          </Pressable>
        </View>
      </Card>

      {/* Notifications are where Elpuls does the most for people, so they get
          their own highlighted card near the top instead of a plain row. */}
      <Pressable
        onPress={onOpenNotifications}
        accessibilityRole="button"
        accessibilityLabel={`${t('settings.notifyCardTitle')}. ${notifySummary}`}
        style={({ pressed }) => [styles.notifyCard, pressed && styles.pressed]}
      >
        <View style={styles.notifyIcon}>
          <IconBellRinging size={22} color={theme.colors.onInkButton} />
        </View>
        <View style={styles.notifyText}>
          <Text style={styles.notifyTitle}>{t('settings.notifyCardTitle')}</Text>
          <Text style={styles.notifyBody}>{t('settings.notifyCardText')}</Text>
          <Text style={styles.notifyStatus}>{notifySummary}</Text>
        </View>
        <IconChevronRight size={20} color={theme.colors.textSecondary} />
      </Pressable>

      <GroupHeader title={t('settings.groupHome')} />
      <Card style={styles.listCard}>
        <NavRow icon={IconMapPin} label={t('settings.zoneTitle')} value={zoneValue} onPress={() => setPage('zone')} />
        <NavRow divider icon={IconFlame} label={t('settings.heatingTitle')} value={heatingValue} onPress={() => setPage('heating')} />
        <SwitchRow divider icon={IconSun} label={t('settings.hasSolar')} value={user.hasSolar} onChange={(v) => saveProfile({ hasSolar: v })} />
        <SwitchRow divider icon={IconChargingPile} label={t('settings.hasEv')} value={user.hasEv} onChange={(v) => saveProfile({ hasEv: v })} />
        <NavRow
          divider
          icon={IconWash}
          label={t('settings.appliancesTitle')}
          value={t('settings.applianceCount', { count: applianceCount })}
          onPress={() => setPage('appliances')}
        />
      </Card>

      <GroupHeader title={t('settings.groupApp')} />
      <Card style={styles.listCard}>
        <NavRow icon={IconLanguage} label={t('settings.languageTitle')} value={languageValue} onPress={() => setPage('language')} />
      </Card>

      <GroupHeader title={t('settings.groupAccount')} />
        <Card style={styles.accountCardSpaced}>
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
              <PrimaryButton size="compact" label={t('login.createAccount')} onPress={handleCreateAccount} loading={creatingAccount} />
            </>
          ) : (
            <SecondaryButton size="compact" label={t('settings.signOut')} onPress={handleSignOut} loading={signingOut} />
          )}
          {accountError && <Text style={styles.error}>{accountError}</Text>}
        </Card>
      <Card style={styles.listCard}>
        <NavRow
          icon={IconSparkles}
          label={t('settings.subscriptionTitle')}
          value={user.isProSubscriber ? t('settings.proStatus') : t('settings.freeStatus')}
          onPress={user.isProSubscriber ? handleManageSubscription : () => showPaywall('settings')}
        />
      </Card>

      <GroupHeader title={t('settings.groupAbout')} />
      <Card style={styles.listCard}>
        <NavRow icon={IconHelpCircle} label={t('settings.guide')} onPress={onOpenGuide} />
        <NavRow divider icon={IconShieldLock} label={t('settings.privacy')} onPress={() => Linking.openURL(PRIVACY_URL)} external />
        <NavRow divider icon={IconFileText} label={t('settings.terms')} onPress={() => Linking.openURL(TERMS_URL)} external />
        <NavRow divider icon={IconMail} label={t('settings.contact')} onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=Elpuls%20${appVersion}`)} external />
      </Card>
      <Text style={styles.versionText}>{t('settings.version', { version: appVersion })}</Text>

      <Card style={styles.deleteCard}>
        <InfoRow
          icon={IconTrash}
          variant="danger"
          title={t('settings.deleteAccountTitle')}
          subtitle={user.isProSubscriber ? t('settings.deleteAccountSubtitlePro') : t('settings.deleteAccountSubtitle')}
        />
        <SecondaryButton size="compact" label={t('settings.deleteAccountButton')} onPress={handleDeleteAccount} loading={deletingAccount} />
        {deleteAccountError && <Text style={styles.error}>{deleteAccountError}</Text>}
      </Card>

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
            <SecondaryButton size="compact" label={t('settings.devClearStorageButton')} onPress={handleDevReset} loading={resetting} />
          </Card>
        </Section>
        </>
      )}
    </ScrollView>
    {toastView}
    </View>
  );
}

type SettingsPage = 'zone' | 'heating' | 'appliances' | 'language';

/** A settings row that opens a page (or a link): label, current value, chevron. 52 pt tall. */
function NavRow({
  icon: Icon,
  label,
  value,
  onPress,
  divider,
  external,
}: {
  icon: ComponentType<{ size?: number; color?: string }>;
  label: string;
  value?: string;
  onPress: () => void;
  divider?: boolean;
  external?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={external ? 'link' : 'button'}
      accessibilityLabel={value ? `${label}, ${value}` : label}
      style={({ pressed }) => [styles.navRow, divider && styles.rowDivider, pressed && styles.pressed]}
    >
      <Icon size={20} color={theme.colors.textSecondary} />
      <Text style={styles.navLabel}>{label}</Text>
      {value ? (
        <Text style={styles.navValue} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {external ? (
        <IconExternalLink size={18} color={theme.colors.textSecondary} />
      ) : (
        <IconChevronRight size={18} color={theme.colors.textSecondary} />
      )}
    </Pressable>
  );
}

/** A yes/no setting as a switch row, saved right away. */
function SwitchRow({
  icon: Icon,
  label,
  value,
  onChange,
  divider,
}: {
  icon: ComponentType<{ size?: number; color?: string }>;
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  divider?: boolean;
}) {
  return (
    <View style={[styles.navRow, divider && styles.rowDivider]}>
      <Icon size={20} color={theme.colors.textSecondary} />
      <Text style={styles.navLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: theme.colors.borderMuted, true: theme.colors.accentPurple }}
        accessibilityLabel={label}
      />
    </View>
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
  title: { fontFamily: theme.typography.display, fontSize: theme.type.xl, color: theme.colors.textPrimary, marginBottom: 20 },
  section: { marginBottom: 24 },
  groupHeader: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderMuted,
    paddingTop: 20,
    marginTop: 8,
    marginBottom: 16,
  },
  groupTitle: { fontFamily: theme.typography.display, fontSize: theme.type.lg, color: theme.colors.textPrimary },
  groupSubtitle: { fontFamily: theme.typography.body, fontSize: theme.type.sm, color: theme.colors.textSecondary, marginTop: 4, lineHeight: 20 },
  groupHeaderFirst: { borderTopWidth: 0, paddingTop: 0, marginTop: 0 },
  root: { flex: 1 },
  topCard: { marginBottom: 16 },
  proCard: { gap: 14, borderColor: `${theme.colors.accentAmber}55` },
  notifyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    marginBottom: 24,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.accentPurple,
    backgroundColor: theme.colors.accentPurpleSoft,
  },
  notifyIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.inkButton,
  },
  notifyText: { flex: 1, gap: 2 },
  notifyTitle: { fontFamily: theme.typography.displayMedium, fontSize: theme.type.lg, color: theme.colors.textPrimary },
  notifyBody: { fontFamily: theme.typography.body, fontSize: theme.type.sm, lineHeight: 20, color: theme.colors.textSecondary },
  notifyStatus: { fontFamily: theme.typography.bodyMedium, fontSize: theme.type.sm, color: theme.colors.accentPurpleDeep, marginTop: 4 },
  pressed: { opacity: 0.85 },
  realPriceCard: { gap: 14, marginBottom: 24 },
  realPriceNow: { backgroundColor: theme.colors.surfaceElevated, borderRadius: theme.radius.lg, padding: 14, gap: 2 },
  realPriceValue: { fontFamily: theme.typography.display, fontSize: theme.type.xxl, color: theme.colors.textPrimary, fontVariant: ['tabular-nums'] },
  realPriceUnit: { fontFamily: theme.typography.body, fontSize: theme.type.md, color: theme.colors.textSecondary },
  realPriceCaption: { fontFamily: theme.typography.body, fontSize: theme.type.sm, lineHeight: 20, color: theme.colors.textSecondary },
  statusRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12 },
  statusRowDivider: { borderTopWidth: 1, borderTopColor: theme.colors.borderMuted },
  statusText: { flex: 1, gap: 2 },
  statusLabel: { fontFamily: theme.typography.bodyMedium, fontSize: theme.type.md, color: theme.colors.textPrimary },
  statusCompany: { fontFamily: theme.typography.body, fontSize: theme.type.sm, color: theme.colors.textSecondary },
  feeList: { marginTop: 8, gap: 4 },
  feeLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  feeLabel: { flexShrink: 1, marginRight: 12, fontFamily: theme.typography.body, fontSize: theme.type.sm, color: theme.colors.textSecondary },
  feeValue: { fontFamily: theme.typography.bodyMedium, fontSize: theme.type.sm, color: theme.colors.textPrimary, fontVariant: ['tabular-nums'] },
  spotLine: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: theme.colors.border },
  spotLineLabel: { fontFamily: theme.typography.body, fontSize: theme.type.sm, color: theme.colors.textSecondary },
  spotLineValue: { fontFamily: theme.typography.bodyMedium, fontSize: theme.type.sm, color: theme.colors.textSecondary, fontVariant: ['tabular-nums'] },
  statusValue: { fontFamily: theme.typography.body, fontSize: theme.type.sm, lineHeight: 20, color: theme.colors.textSecondary, fontVariant: ['tabular-nums'] },
  taxNote: { fontFamily: theme.typography.body, fontSize: theme.type.sm, lineHeight: 20, color: theme.colors.textSecondary },
  realPriceActions: { gap: 4 },
  textLink: { alignSelf: 'center', minHeight: 44, justifyContent: 'center' },
  textLinkLabel: { fontFamily: theme.typography.bodyMedium, fontSize: theme.type.md, color: theme.colors.textSecondary, textDecorationLine: 'underline' },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, alignSelf: 'flex-start', marginBottom: 8 },
  backText: { fontFamily: theme.typography.bodyMedium, fontSize: theme.type.md, color: theme.colors.textSecondary },
  listCard: { paddingVertical: 0, paddingHorizontal: 16, marginBottom: 8 },
  navRow: { flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingVertical: 10 },
  rowDivider: { borderTopWidth: 1, borderTopColor: theme.colors.borderMuted },
  navLabel: { flex: 1, marginLeft: 12, fontFamily: theme.typography.bodyMedium, fontSize: theme.type.md, color: theme.colors.textPrimary },
  navValue: { maxWidth: '50%', marginRight: 6, fontFamily: theme.typography.body, fontSize: theme.type.sm, color: theme.colors.textSecondary },
  proStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 64,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 16,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: `${theme.colors.accentAmber}55`,
    backgroundColor: theme.colors.surface,
  },
  proStatusIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.accentAmberSoft,
  },
  proStatusTextWrap: { flex: 1 },
  proStatusTitle: { fontFamily: theme.typography.bodyMedium, fontSize: theme.type.md, color: theme.colors.textPrimary },
  proStatusText: { fontFamily: theme.typography.body, fontSize: theme.type.sm, color: theme.colors.textSecondary, marginTop: 2 },
  proStatusManage: { fontFamily: theme.typography.bodyMedium, fontSize: theme.type.sm, color: theme.colors.textSecondary },
  accountCardSpaced: { gap: 14, marginBottom: 12 },
  deleteCard: { gap: 14, marginTop: 32 },
  versionText: { fontFamily: theme.typography.body, fontSize: theme.type.sm, color: theme.colors.textSecondary, textAlign: 'center', marginTop: 8 },
  toast: {
    position: 'absolute',
    bottom: 24,
    alignSelf: 'center',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.positiveTeal,
  },
  toastError: { borderColor: theme.colors.dangerEmber },
  toastText: { fontFamily: theme.typography.bodyMedium, fontSize: theme.type.md, color: theme.colors.textPrimary },
  accountCard: { gap: 14 },
  sectionTitle: {
    fontFamily: theme.typography.bodyMedium,
    fontSize: theme.type.sm,
    color: theme.colors.textSecondary,
    marginBottom: 10,
  },
  sectionSubtitle: {
    fontFamily: theme.typography.body,
    fontSize: theme.type.sm,
    color: theme.colors.textSecondary,
    marginBottom: 12,
    lineHeight: 20,
  },
  optionList: { gap: 10 },
  yesNoRow: { flexDirection: 'row', gap: 8 },
  accountInput: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingVertical: 12,
    paddingHorizontal: 16,
    fontFamily: theme.typography.body,
    fontSize: theme.type.sm,
    color: theme.colors.textPrimary,
  },
  accountHint: { fontFamily: theme.typography.body, fontSize: theme.type.xs, color: theme.colors.textFaint },
  entryCard: { marginTop: 4 },
  householdCard: { paddingVertical: 4, marginBottom: 16 },
  householdRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52 },
  householdRowDivider: { borderTopWidth: 1, borderTopColor: theme.colors.borderMuted },
  householdText: { flex: 1 },
  householdLabel: { fontFamily: theme.typography.body, fontSize: theme.type.md, color: theme.colors.textPrimary },
  householdNote: { fontFamily: theme.typography.body, fontSize: theme.type.xs, color: theme.colors.textSecondary, marginTop: 2 },
  subSectionLabel: { fontFamily: theme.typography.bodyMedium, fontSize: theme.type.sm, color: theme.colors.textSecondary, marginBottom: 8 },
  applianceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  applianceRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
  applianceLabel: { fontFamily: theme.typography.bodyMedium, fontSize: theme.type.sm, color: theme.colors.textPrimary, flexShrink: 1 },
  applianceRowActions: { flexDirection: 'row', gap: 16 },
  subscriptionCard: { gap: 14 },
  devClearCard: { gap: 14, marginTop: 12 },
  error: {
    fontFamily: theme.typography.body,
    fontSize: theme.type.sm,
    color: theme.colors.dangerEmber,
  },
});
