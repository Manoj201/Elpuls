import { useEffect, useState, type ComponentType } from 'react';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Keyboard, Platform, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { IconChartBar, IconChartLine, IconGauge, IconSettings } from '@tabler/icons-react-native';
import { useFonts as useSpaceGrotesk, SpaceGrotesk_500Medium, SpaceGrotesk_600SemiBold } from '@expo-google-fonts/space-grotesk';
import { useFonts as useInter, Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { HomeScreen } from './src/screens/HomeScreen';
import { ForecastScreen } from './src/screens/ForecastScreen';
import { StatsScreen } from './src/screens/StatsScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { TickerScreen } from './src/screens/TickerScreen';
import { ApplianceRecommendationsScreen } from './src/screens/ApplianceRecommendationsScreen';
import { ApplianceScanScreen } from './src/screens/ApplianceScanScreen';
import { BillScanScreen } from './src/screens/BillScanScreen';
import { PaywallScreen } from './src/screens/PaywallScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { OnboardingScreen } from './src/screens/OnboardingScreen';
import { IntroScreen } from './src/screens/IntroScreen';
import { ScreenBackground } from './src/components/ScreenBackground';
import { usePushRegistration } from './src/hooks/usePushRegistration';
import { ensureAnonymousSignIn, signOutUser } from './src/lib/auth';
import { clearLocalAppStorage } from './src/lib/devTools';
import { deleteMyAccount } from './src/lib/account';
import { db } from './src/lib/firebase';
import { configurePurchases } from './src/lib/purchases';
import { useCountryStore } from './src/stores/useCountryStore';
import { useUiStore } from './src/stores/useUiStore';
import { selectProfile, useUserStore } from './src/stores/useUserStore';
import type { RegisteredAppliance } from './src/stores/useApplianceStore';
import { initI18n, syncCurrentLanguageToFirestore } from './src/i18n';
import { theme } from './src/theme';

type TabScreen = 'overview' | 'forecast' | 'stats' | 'settings';
type StackScreen = 'kostnadskoll' | 'applianceRecommendations' | 'applianceScan' | 'billScan' | null;
type AppState = 'loading' | 'intro' | 'login' | 'onboarding' | 'main';

const TABS: { id: TabScreen; labelKey: string; icon: ComponentType<{ size?: number; color?: string }> }[] = [
  { id: 'overview', labelKey: 'app.tabOverview', icon: IconGauge },
  { id: 'forecast', labelKey: 'app.tabForecast', icon: IconChartLine },
  { id: 'stats', labelKey: 'app.tabStats', icon: IconChartBar },
  { id: 'settings', labelKey: 'app.tabSettings', icon: IconSettings },
];

/**
 * Loads the saved profile back into useUserStore/useCountryStore and
 * reports whether onboarding is complete. Needed on every app boot, not
 * just right after onboarding/Settings — without this, a returning user's
 * zone, heating type, grid fee, and retailer markup silently reset to
 * blank defaults in the UI on every restart, even though Firestore still
 * has the real values.
 */
async function hydrateUserProfile(uid: string): Promise<boolean> {
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists() || !snap.data().zone) {
    return false;
  }

  const data = snap.data();
  useUserStore.getState().setOnboardingInfo({
    zone: data.zone,
    heatingType: data.heatingType ?? null,
    hasEv: Boolean(data.hasEv),
    hasSolar: Boolean(data.hasSolar),
    gridFeeFixedSekPerMonth: data.gridFeeFixedSekPerMonth ?? null,
    gridFeeVariableSekPerKwh: data.gridFeeVariableSekPerKwh ?? null,
  });
  useUserStore.getState().setRetailerMarkup(data.retailerMarkupSekPerKwh ?? null);
  useUserStore.getState().setEstimatedMonthlyKwh(data.estimatedMonthlyKwh ?? null);
  useUserStore.getState().setPriceAlertPrefs(data.priceAlertHighThresholdOre ?? null, Boolean(data.priceAlertLowEnabled));
  useCountryStore.getState().setZone(data.zone);

  return true;
}

/** Whether this device has a completed onboarding profile cached locally (useUserStore persist). */
function hasCachedProfile(): boolean {
  const state = useUserStore.getState();
  return state.onboardedAt !== null && state.zone !== null;
}

/**
 * Writes this device's cached profile to users/{uid}. Used when the uid has
 * no Firestore profile but the device does — e.g. a guest signing in to an
 * account for the first time, or a session that had to be re-created —
 * so Cloud Functions (push alerts, daily briefing) see the same profile.
 */
async function uploadCachedProfile(uid: string): Promise<void> {
  const profile = selectProfile(useUserStore.getState());
  await setDoc(doc(db, 'users', uid), { ...profile, onboardedAt: serverTimestamp() }, { merge: true });
}

/**
 * Decides where a user lands for a given uid:
 * 1. Firestore profile exists → main (hydrated from Firestore).
 * 2. This device has a cached profile → main, and the cache is (re)uploaded.
 * 3. Otherwise → onboarding.
 * Offline/Firestore errors fall back to the cache, so a returning user
 * always gets straight into the app; only a user with no cache sees the error.
 */
async function resolveLanding(uid: string): Promise<'main' | 'onboarding'> {
  try {
    if (await hydrateUserProfile(uid)) return 'main';
  } catch (err) {
    if (!hasCachedProfile()) throw err;
    console.log('Profile read failed, using cached profile:', err);
    useCountryStore.getState().setZone(useUserStore.getState().zone!);
    return 'main';
  }

  if (hasCachedProfile()) {
    useCountryStore.getState().setZone(useUserStore.getState().zone!);
    uploadCachedProfile(uid).catch((err) => console.log('Profile self-heal upload failed:', err));
    return 'main';
  }
  return 'onboarding';
}

/** Waits until useUserStore has read its cached profile back from AsyncStorage. */
function waitForProfileCache(): Promise<void> {
  if (useUserStore.persist.hasHydrated()) return Promise.resolve();
  return new Promise((resolve) => {
    const unsubscribe = useUserStore.persist.onFinishHydration(() => {
      unsubscribe();
      resolve();
    });
  });
}

/**
 * True while the on-screen keyboard is up. The tab bar hides then — otherwise
 * ScreenBackground's KeyboardAvoidingView lifts it above the keyboard, where
 * it covers the form being typed into (e.g. Settings → Create account).
 */
function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, () => setVisible(true));
    const hide = Keyboard.addListener(hideEvent, () => setVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return visible;
}

export default function App() {
  usePushRegistration();
  const { t } = useTranslation();
  const setUid = useUserStore((s) => s.setUid);
  const isPaywallVisible = useUiStore((s) => s.isPaywallVisible);
  const showPaywall = useUiStore((s) => s.showPaywall);
  const keyboardVisible = useKeyboardVisible();

  const [appState, setAppState] = useState<AppState>('loading');
  const [activeUid, setActiveUid] = useState<string | null>(null);
  const [tab, setTab] = useState<TabScreen>('overview');
  const [stackScreen, setStackScreen] = useState<StackScreen>(null);
  const [editingAppliance, setEditingAppliance] = useState<RegisteredAppliance | null>(null);
  const [billScanManual, setBillScanManual] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [initAttempt, setInitAttempt] = useState(0);
  const [i18nReady, setI18nReady] = useState(false);

  const [spaceGroteskLoaded] = useSpaceGrotesk({ SpaceGrotesk_500Medium, SpaceGrotesk_600SemiBold });
  const [interLoaded] = useInter({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold });

  useEffect(() => {
    initI18n().then(() => setI18nReady(true));
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        await waitForProfileCache();
        const uid = await ensureAnonymousSignIn();
        if (cancelled) return;
        setUid(uid);
        setActiveUid(uid);
        configurePurchases(uid);
        syncCurrentLanguageToFirestore();
        const landing = await resolveLanding(uid);
        if (cancelled) return;
        // No profile yet: onboarding only if the user already chose Create
        // account / Sign in / Guest on the Login screen (and quit mid-way).
        // A background guest session alone — fresh install, or the one
        // started after sign-out/account deletion — always gets Login.
        // A brand-new install sees the short welcome intro before Login.
        const { entryChosenAt, introSeenAt } = useUserStore.getState();
        setAppState(
          landing === 'main' ? 'main' : entryChosenAt !== null ? 'onboarding' : introSeenAt === null ? 'intro' : 'login',
        );
      } catch (err) {
        console.error('App init failed:', err);
        if (!cancelled) setInitError(err instanceof Error ? err.message : String(err));
      }
    }

    init();

    return () => {
      cancelled = true;
    };
  }, [setUid, initAttempt]);

  // After Create account (same guest uid) or Sign in (the account's uid):
  // the account's own profile wins; otherwise a guest profile on this
  // device carries over; only with neither does onboarding run.
  async function handleSignedIn(uid: string) {
    useUserStore.getState().markEntryChosen();
    setUid(uid);
    setActiveUid(uid);
    configurePurchases(uid);
    syncCurrentLanguageToFirestore();
    setAppState(await resolveLanding(uid));
  }

  // After setup, offer Pro once (skippable) while the value is fresh.
  function handleOnboardingDone() {
    setAppState('main');
    const { proOfferSeenAt, isProSubscriber, markProOfferSeen } = useUserStore.getState();
    if (proOfferSeenAt === null && !isProSubscriber) {
      markProOfferSeen();
      showPaywall('onboarding');
    }
  }

  function openBillScan(manual = false) {
    setBillScanManual(manual);
    setStackScreen('billScan');
  }

  async function handleSignedOut() {
    const guestUid = await signOutUser();
    setUid(guestUid);
    setActiveUid(guestUid);
    configurePurchases(guestUid);
    setTab('overview');
    setStackScreen(null);
    setEditingAppliance(null);
    setAppState('login');
  }

  // Dev-only: wipes the local session/storage, then re-runs the same init
  // effect a cold app launch would run (fresh anonymous user, no saved
  // profile) — lets onboarding/login be re-tested without a real reinstall.
  async function handleDevReset() {
    await clearLocalAppStorage();
    setActiveUid(null);
    setTab('overview');
    setStackScreen(null);
    setEditingAppliance(null);
    setAppState('loading');
    setInitAttempt((n) => n + 1);
  }

  // Same reset shape as handleDevReset — once the account and its data are
  // gone server-side, there's equally nothing left to show.
  async function handleAccountDeleted() {
    await deleteMyAccount();
    setActiveUid(null);
    setTab('overview');
    setStackScreen(null);
    setEditingAppliance(null);
    setAppState('loading');
    setInitAttempt((n) => n + 1);
  }

  if (!spaceGroteskLoaded || !interLoaded || !i18nReady) {
    return <ScreenBackground />;
  }

  if (initError) {
    return (
      <ScreenBackground style={styles.loadingContainer}>
        <Text style={styles.errorTitle}>{t('app.initErrorTitle')}</Text>
        <Text style={styles.errorMessage}>{initError}</Text>
        <Pressable
          style={styles.retryButton}
          onPress={() => {
            setInitError(null);
            setAppState('loading');
            setInitAttempt((n) => n + 1);
          }}
        >
          <Text style={styles.retryText}>{t('app.retry')}</Text>
        </Pressable>
      </ScreenBackground>
    );
  }

  if (appState === 'loading') {
    return (
      <ScreenBackground style={styles.loadingContainer}>
        <ActivityIndicator color={theme.colors.accentPurple} />
      </ScreenBackground>
    );
  }

  if (appState === 'intro') {
    return (
      <ScreenBackground>
        <IntroScreen
          onDone={() => {
            useUserStore.getState().markIntroSeen();
            setAppState('login');
          }}
        />
        <StatusBar style="light" />
      </ScreenBackground>
    );
  }

  if (appState === 'login') {
    return (
      <ScreenBackground>
        <LoginScreen onSignedIn={handleSignedIn} onSkip={() => {
            useUserStore.getState().markEntryChosen();
            setAppState('onboarding');
          }} />
        <StatusBar style="light" />
      </ScreenBackground>
    );
  }

  if (appState === 'onboarding' && activeUid) {
    return (
      <ScreenBackground>
        <OnboardingScreen uid={activeUid} onDone={handleOnboardingDone} />
        <StatusBar style="light" />
      </ScreenBackground>
    );
  }

  return (
    <ScreenBackground>
      <View style={styles.screen}>
        {stackScreen && activeUid ? (
          <>
            {stackScreen === 'kostnadskoll' && <TickerScreen uid={activeUid} onBack={() => setStackScreen(null)} />}
            {stackScreen === 'applianceRecommendations' && (
              <ApplianceRecommendationsScreen uid={activeUid} onBack={() => setStackScreen(null)} />
            )}
            {stackScreen === 'applianceScan' && (
              <ApplianceScanScreen
                uid={activeUid}
                editAppliance={editingAppliance}
                onBack={() => {
                  setStackScreen(null);
                  setEditingAppliance(null);
                }}
              />
            )}
            {stackScreen === 'billScan' && (
              <BillScanScreen uid={activeUid} startManual={billScanManual} onBack={() => setStackScreen(null)} />
            )}
          </>
        ) : (
          <>
            {tab === 'overview' && activeUid && (
              <HomeScreen
                uid={activeUid}
                onOpenKostnadskoll={() => setStackScreen('kostnadskoll')}
                onOpenApplianceRecommendations={() => setStackScreen('applianceRecommendations')}
                onOpenBillScan={openBillScan}
                onOpenApplianceScan={() => {
                  setEditingAppliance(null);
                  setStackScreen('applianceScan');
                }}
                onOpenSettings={() => setTab('settings')}
              />
            )}
            {tab === 'forecast' && <ForecastScreen />}
            {tab === 'stats' && <StatsScreen />}
            {tab === 'settings' && activeUid && (
              <SettingsScreen
                uid={activeUid}
                onOpenApplianceScan={(editAppliance) => {
                  setEditingAppliance(editAppliance ?? null);
                  setStackScreen('applianceScan');
                }}
                onOpenBillScan={() => openBillScan(false)}
                onDevReset={handleDevReset}
                onAccountDeleted={handleAccountDeleted}
                onSignedIn={handleSignedIn}
                onSignedOut={handleSignedOut}
              />
            )}
          </>
        )}
      </View>

      {!stackScreen && !keyboardVisible && (
        <SafeAreaView style={styles.tabBar}>
          {TABS.map(({ id, labelKey, icon: Icon }) => (
            <Pressable key={id} style={styles.tab} onPress={() => setTab(id)}>
              <Icon size={20} color={tab === id ? theme.colors.inkButton : theme.colors.textMuted} />
              <Text style={[styles.tabLabel, tab === id && styles.tabLabelActive]}>{t(labelKey)}</Text>
            </Pressable>
          ))}
        </SafeAreaView>
      )}

      {isPaywallVisible && <PaywallScreen />}

      <StatusBar style="light" />
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  errorTitle: {
    fontFamily: theme.typography.displayMedium,
    fontSize: theme.type.lg,
    color: theme.colors.textPrimary,
    marginBottom: 8,
  },
  errorMessage: {
    fontFamily: theme.typography.body,
    fontSize: theme.type.sm,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: theme.colors.inkButton,
    borderRadius: theme.radius.md,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  retryText: {
    fontFamily: theme.typography.bodyMedium,
    fontSize: theme.type.sm,
    color: theme.colors.onInkButton,
  },
  screen: {
    flex: 1,
  },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    paddingVertical: 10,
  },
  tabLabel: {
    fontFamily: theme.typography.bodyMedium,
    fontSize: theme.type.xs,
    color: theme.colors.textMuted,
  },
  tabLabelActive: {
    color: theme.colors.inkButton,
  },
});
