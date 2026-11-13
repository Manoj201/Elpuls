import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  IconChartBar,
  IconFlame,
  IconListCheck,
  IconSnowflake,
  IconSparkles,
  IconSun,
  IconX,
} from '@tabler/icons-react-native';
import type { PurchasesPackage } from 'react-native-purchases';
import {
  DEFAULT_TRIAL_DAYS,
  getCurrentOfferingPackage,
  getEligibleTrialDays,
  getLastOfferingIssue,
  purchaseErrorKind,
  purchasePackage,
  restorePurchases,
} from '../lib/purchases';
import { useUiStore, type PaywallSource } from '../stores/useUiStore';
import { useUserStore } from '../stores/useUserStore';
import { theme } from '../theme';
import { PrimaryButton } from '../components/PrimaryButton';
import { ScreenBackground } from '../components/ScreenBackground';

const TERMS_URL = 'https://elpuls.ravenbees.com/terms';
const PRIVACY_URL = 'https://elpuls.ravenbees.com/privacy';

const FEATURES = [
  { key: 'explainer', icon: IconSparkles, ai: true },
  { key: 'heatingPlan', icon: IconFlame, ai: false },
  { key: 'recommendations', icon: IconListCheck, ai: false },
  { key: 'weatherPrep', icon: IconSnowflake, ai: false },
  { key: 'solarBonus', icon: IconSun, ai: false },
  { key: 'stats', icon: IconChartBar, ai: false },
] as const;

/** Headline key per entry point, so the paywall talks about what the user just tapped. */
const HEADLINE_KEY: Record<PaywallSource, string> = {
  onboarding: 'paywall.headlineOnboarding',
  explainer: 'paywall.headlineExplainer',
  proTips: 'paywall.headlineProTips',
  stats: 'paywall.headlineStats',
  recommendations: 'paywall.headlineRecommendations',
  settings: 'paywall.headline',
  trial: 'paywall.headlineTrial',
  generic: 'paywall.headline',
};

export function PaywallScreen() {
  const { t } = useTranslation();
  const hidePaywall = useUiStore((s) => s.hidePaywall);
  const source = useUiStore((s) => s.paywallSource);
  const [pkg, setPkg] = useState<PurchasesPackage | null>(null);
  const [loadingOffering, setLoadingOffering] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offeringIssue, setOfferingIssue] = useState<string | null>(null);

  const storeTrialDays = useUserStore((s) => s.trialDays);
  const setTrialDays = useUserStore((s) => s.setTrialDays);

  function loadOffering() {
    setLoadingOffering(true);
    getCurrentOfferingPackage()
      .then(async (p) => {
        setPkg(p);
        setOfferingIssue(p ? null : getLastOfferingIssue());
        // Re-check here too, so someone who already used the trial never
        // sees "14 days free" (App Store guideline 3.1.2).
        if (p) setTrialDays(await getEligibleTrialDays(p));
      })
      .finally(() => setLoadingOffering(false));
  }

  useEffect(loadOffering, []);

  // Trial days this Apple ID can actually get (null = no trial offer).
  const trialDays = storeTrialDays;
  const price = pkg?.product.priceString ?? t('paywall.fallbackPrice');

  async function handlePurchase() {
    if (!pkg) return;
    setPurchasing(true);
    setError(null);
    try {
      await purchasePackage(pkg);
      hidePaywall();
    } catch (err) {
      console.log('Purchase failed:', err);
      const kind = purchaseErrorKind(err);
      if (kind === 'otherAccount') setError(t('paywall.ownedByOtherAccount'));
      else if (kind !== 'cancelled') setError(t('paywall.purchaseFailed'));
    } finally {
      setPurchasing(false);
    }
  }

  async function handleRestore() {
    setRestoring(true);
    setError(null);
    try {
      if (await restorePurchases()) {
        hidePaywall();
      } else {
        setError(t('paywall.nothingToRestore'));
      }
    } catch (err) {
      console.log('Restore failed:', err);
      setError(t(purchaseErrorKind(err) === 'otherAccount' ? 'paywall.ownedByOtherAccount' : 'paywall.restoreFailed'));
    } finally {
      setRestoring(false);
    }
  }

  const ctaLabel = trialDays ? t('paywall.startTrial', { days: trialDays }) : t('paywall.subscribe', { price });

  return (
    <ScreenBackground style={styles.overlay}>
      <SafeAreaView style={styles.safe}>
      {/* Fixed header: the close button never overlaps scrolling content,
          and nothing scrolls up under the status bar. */}
      <View style={styles.header}>
        <Pressable
          onPress={hidePaywall}
          style={styles.close}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t('paywall.close')}
        >
          <IconX size={24} color={theme.colors.textSecondary} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.proTag}>
          <Text style={styles.proTagText}>{t('pro.tag')}</Text>
        </View>
        <Text style={styles.headline} accessibilityRole="header">
          {source === 'onboarding' && !trialDays ? t('paywall.headline') : t(HEADLINE_KEY[source], { days: trialDays ?? DEFAULT_TRIAL_DAYS })}
        </Text>
        <Text style={styles.subheadline}>{t('paywall.subheadline')}</Text>

        <View style={styles.featureList}>
          {FEATURES.map(({ key, icon: Icon, ai }) => (
            <View key={key} style={styles.featureRow}>
              <View style={styles.featureIcon}>
                <Icon size={20} color={theme.colors.accentAmberDeep} />
              </View>
              <View style={styles.featureTextBlock}>
                <View style={styles.featureTitleRow}>
                  <Text style={styles.featureTitle}>{t(`paywall.features.${key}`)}</Text>
                  {ai && (
                    <View style={styles.aiBadge}>
                      <Text style={styles.aiBadgeText}>{t('ai.badge')}</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.featureText}>{t(`paywall.featureText.${key}`)}</Text>
              </View>
            </View>
          ))}
        </View>
        <Text style={styles.aiFootnote}>{t('paywall.aiFootnote')}</Text>

        <View style={styles.priceCard}>
          {loadingOffering ? (
            <ActivityIndicator color={theme.colors.accentAmber} style={styles.priceLoading} />
          ) : (
            <>
              {trialDays ? (
                <>
                  <Text style={styles.priceBig}>{t('paywall.trialBig', { days: trialDays })}</Text>
                  <Text style={styles.priceSmall}>{t('paywall.trialThen', { price })}</Text>
                </>
              ) : (
                <Text style={styles.priceBig}>{t('paywall.pricePerMonth', { price })}</Text>
              )}
              <Text style={styles.priceSmall}>{t('paywall.cancelAnytime')}</Text>
            </>
          )}
          {!loadingOffering && !pkg && (
            <Pressable onPress={loadOffering} accessibilityRole="button" style={styles.unavailable}>
              <Text style={styles.unavailableHint}>{t('paywall.notAvailable')}</Text>
              {__DEV__ && offeringIssue && <Text style={styles.offeringIssue}>{offeringIssue}</Text>}
              <Text style={styles.unavailableHint}>{t('paywall.retry')}</Text>
            </Pressable>
          )}
        </View>

        {error && (
          <Text style={styles.error} accessibilityLiveRegion="polite">
            {error}
          </Text>
        )}

        <PrimaryButton label={ctaLabel} onPress={handlePurchase} disabled={!pkg} loading={purchasing} />

        <Pressable onPress={hidePaywall} style={styles.textButton} hitSlop={8} accessibilityRole="button">
          <Text style={styles.notNow}>{t('paywall.notNow')}</Text>
        </Pressable>

        <Pressable onPress={handleRestore} disabled={restoring} style={styles.textButton} hitSlop={8} accessibilityRole="button">
          <Text style={styles.smallLink}>{restoring ? t('paywall.restoring') : t('paywall.restore')}</Text>
        </Pressable>

        <View style={styles.legalLinks}>
          <Pressable onPress={() => Linking.openURL(TERMS_URL)} hitSlop={8} accessibilityRole="link">
            <Text style={styles.legalLink}>{t('login.termsLink')}</Text>
          </Pressable>
          <Text style={styles.legalDot}>·</Text>
          <Pressable onPress={() => Linking.openURL(PRIVACY_URL)} hitSlop={8} accessibilityRole="link">
            <Text style={styles.legalLink}>{t('login.privacyLink')}</Text>
          </Pressable>
        </View>
      </ScrollView>
      </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, zIndex: 10 },
  safe: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 12, paddingTop: 8 },
  close: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  container: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 48 },
  proTag: {
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.accentAmberSoft,
    borderColor: `${theme.colors.accentAmber}33`,
    borderWidth: 1,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginBottom: 14,
  },
  proTagText: { fontFamily: theme.typography.bodyMedium, fontSize: theme.type.sm, color: theme.colors.accentAmberDeep },
  headline: { fontFamily: theme.typography.display, fontSize: theme.type.xl, lineHeight: 30, color: theme.colors.textPrimary },
  subheadline: { fontFamily: theme.typography.body, fontSize: theme.type.md, lineHeight: 24, color: theme.colors.textSecondary, marginTop: 10, marginBottom: 24 },
  featureList: { gap: 16 },
  featureRow: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  featureIcon: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.accentAmberSoft,
  },
  featureTextBlock: { flex: 1 },
  featureTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  featureTitle: { fontFamily: theme.typography.bodyMedium, fontSize: theme.type.md, color: theme.colors.textPrimary },
  featureText: { fontFamily: theme.typography.body, fontSize: theme.type.sm, lineHeight: 20, color: theme.colors.textSecondary, marginTop: 2 },
  aiBadge: {
    backgroundColor: theme.colors.accentPurpleSoft,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: `${theme.colors.accentPurple}55`,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  aiBadgeText: { fontFamily: theme.typography.bodyMedium, fontSize: theme.type.xs, color: theme.colors.accentPurpleDeep },
  aiFootnote: { fontFamily: theme.typography.body, fontSize: theme.type.sm, lineHeight: 20, color: theme.colors.textSecondary, marginTop: 16 },
  priceCard: {
    alignItems: 'center',
    gap: 4,
    backgroundColor: theme.colors.accentAmberSoft,
    borderColor: theme.colors.accentAmber,
    borderWidth: 1.5,
    borderRadius: theme.radius.xl,
    padding: 20,
    marginTop: 24,
    marginBottom: 20,
  },
  priceLoading: { marginVertical: 12 },
  priceBig: { fontFamily: theme.typography.display, fontSize: theme.type.xl, color: theme.colors.textPrimary, textAlign: 'center' },
  priceSmall: { fontFamily: theme.typography.body, fontSize: theme.type.md, lineHeight: 24, color: theme.colors.textSecondary, textAlign: 'center' },
  unavailable: { alignItems: 'center', marginTop: 8, gap: 2 },
  unavailableHint: { fontFamily: theme.typography.body, fontSize: theme.type.sm, color: theme.colors.textSecondary, textAlign: 'center' },
  offeringIssue: { fontFamily: theme.typography.body, fontSize: theme.type.xs, color: theme.colors.textFaint, textAlign: 'center' },
  error: { fontFamily: theme.typography.body, fontSize: theme.type.md, lineHeight: 24, color: theme.colors.dangerEmber, marginBottom: 12, textAlign: 'center' },
  textButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  notNow: { fontFamily: theme.typography.bodyMedium, fontSize: theme.type.md, color: theme.colors.textPrimary },
  smallLink: { fontFamily: theme.typography.body, fontSize: theme.type.sm, color: theme.colors.textSecondary },
  legalLinks: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 4 },
  legalLink: { fontFamily: theme.typography.body, fontSize: theme.type.sm, color: theme.colors.textSecondary, textDecorationLine: 'underline' },
  legalDot: { fontFamily: theme.typography.body, fontSize: theme.type.sm, color: theme.colors.textMuted },
});
