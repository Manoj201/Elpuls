import { useEffect, useState, type ComponentType } from 'react';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { doc, getDoc } from 'firebase/firestore';
import { IconChartBar, IconChartLine, IconGauge, IconSettings } from '@tabler/icons-react-native';
import { useFonts as useSpaceGrotesk, SpaceGrotesk_500Medium, SpaceGrotesk_600SemiBold } from '@expo-google-fonts/space-grotesk';
import { useFonts as useInter, Inter_400Regular, Inter_500Medium } from '@expo-google-fonts/inter';
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
import { ScreenBackground } from './src/components/ScreenBackground';
import { usePushRegistration } from './src/hooks/usePushRegistration';
import { ensureAnonymousSignIn } from './src/lib/auth';
import { clearLocalAppStorage } from './src/lib/devTools';
import { db } from './src/lib/firebase';
import { configurePurchases } from './src/lib/purchases';
import { useCountryStore } from './src/stores/useCountryStore';
import { useUiStore } from './src/stores/useUiStore';
import { useUserStore } from './src/stores/useUserStore';
import type { RegisteredAppliance } from './src/stores/useApplianceStore';
import { initI18n, syncCurrentLanguageToFirestore } from './src/i18n';
import { theme } from './src/theme';

type TabScreen = 'overview' | 'forecast' | 'stats' | 'settings';
type StackScreen = 'kostnadskoll' | 'applianceRecommendations' | 'applianceScan' | 'billScan' | null;
type AppState = 'loading' | 'login' | 'onboarding' | 'main';

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
  useCountryStore.getState().setZone(data.zone);

  return true;
}

export default function App() {
  usePushRegistration();
  const { t } = useTranslation();
  const setUid = useUserStore((s) => s.setUid);
  const isPaywallVisible = useUiStore((s) => s.isPaywallVisible);

  const [appState, setAppState] = useState<AppState>('loading');
  const [activeUid, setActiveUid] = useState<string | null>(null);
  const [tab, setTab] = useState<TabScreen>('overview');
  const [stackScreen, setStackScreen] = useState<StackScreen>(null);
  const [editingAppliance, setEditingAppliance] = useState<RegisteredAppliance | null>(null);
  const [initError, setInitError] = useState<string | null>(null);
  const [initAttempt, setInitAttempt] = useState(0);
  const [i18nReady, setI18nReady] = useState(false);

  const [spaceGroteskLoaded] = useSpaceGrotesk({ SpaceGrotesk_500Medium, SpaceGrotesk_600SemiBold });
  const [interLoaded] = useInter({ Inter_400Regular, Inter_500Medium });

  useEffect(() => {
    initI18n().then(() => setI18nReady(true));
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const uid = await ensureAnonymousSignIn();
        if (cancelled) return;
        setUid(uid);
        setActiveUid(uid);
        configurePurchases(uid);
        syncCurrentLanguageToFirestore();
        setAppState((await hydrateUserProfile(uid)) ? 'main' : 'login');
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

  async function handleSignedIn(uid: string) {
    setUid(uid);
    setActiveUid(uid);
    configurePurchases(uid);
    syncCurrentLanguageToFirestore();
    setAppState((await hydrateUserProfile(uid)) ? 'main' : 'onboarding');
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

  if (appState === 'login') {
    return (
      <ScreenBackground>
        <LoginScreen onSignedIn={handleSignedIn} onSkip={() => setAppState('onboarding')} />
        <StatusBar style="light" />
      </ScreenBackground>
    );
  }

  if (appState === 'onboarding' && activeUid) {
    return (
      <ScreenBackground>
        <OnboardingScreen uid={activeUid} onDone={() => setAppState('main')} />
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
            {stackScreen === 'billScan' && <BillScanScreen uid={activeUid} onBack={() => setStackScreen(null)} />}
          </>
        ) : (
          <>
            {tab === 'overview' && (
              <HomeScreen
                onOpenKostnadskoll={() => setStackScreen('kostnadskoll')}
                onOpenApplianceRecommendations={() => setStackScreen('applianceRecommendations')}
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
                onOpenBillScan={() => setStackScreen('billScan')}
                onDevReset={handleDevReset}
              />
            )}
          </>
        )}
      </View>

      {!stackScreen && (
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
    fontSize: 18,
    color: theme.colors.textPrimary,
    marginBottom: 8,
  },
  errorMessage: {
    fontFamily: theme.typography.body,
    fontSize: 14,
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
    fontSize: 14,
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
    fontSize: 11,
    color: theme.colors.textMuted,
  },
  tabLabelActive: {
    color: theme.colors.inkButton,
  },
});
