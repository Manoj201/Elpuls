import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { IconBolt, IconCheck } from '@tabler/icons-react-native';
import type { PurchasesPackage } from 'react-native-purchases';
import { getCurrentOfferingPackage, purchasePackage, restorePurchases } from '../lib/purchases';
import { useUiStore } from '../stores/useUiStore';
import { theme } from '../theme';
import { Chip } from '../components/Chip';
import { PrimaryButton } from '../components/PrimaryButton';
import { ScreenBackground } from '../components/ScreenBackground';

const FEATURE_KEYS = ['explainer', 'solarBonus', 'stats', 'recommendations'];

export function PaywallScreen() {
  const { t } = useTranslation();
  const hidePaywall = useUiStore((s) => s.hidePaywall);
  const [pkg, setPkg] = useState<PurchasesPackage | null>(null);
  const [loadingOffering, setLoadingOffering] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getCurrentOfferingPackage()
      .then(setPkg)
      .finally(() => setLoadingOffering(false));
  }, []);

  async function handlePurchase() {
    if (!pkg) return;
    setPurchasing(true);
    setError(null);
    try {
      await purchasePackage(pkg);
      hidePaywall();
    } catch (err) {
      console.log('Purchase failed:', err);
      setError(t('paywall.purchaseFailed'));
    } finally {
      setPurchasing(false);
    }
  }

  async function handleRestore() {
    setRestoring(true);
    setError(null);
    try {
      await restorePurchases();
      hidePaywall();
    } catch (err) {
      console.log('Restore failed:', err);
      setError(t('paywall.restoreFailed'));
    } finally {
      setRestoring(false);
    }
  }

  return (
    <ScreenBackground style={styles.overlay}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.iconCircle}>
          <IconBolt size={28} color={theme.colors.accentAmberDeep} />
        </View>
        <Text style={styles.headline}>{t('paywall.headline')}</Text>
        <Text style={styles.subheadline}>{t('paywall.subheadline')}</Text>

        <View style={styles.featureList}>
          {FEATURE_KEYS.map((key) => (
            <View key={key} style={styles.featureRow}>
              <IconCheck size={16} color={theme.colors.positiveTeal} />
              <Text style={styles.featureText}>{t(`paywall.features.${key}`)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.priceCard}>
          <Chip label={t('paywall.mostPopular')} variant="amber" />
          {loadingOffering ? (
            <ActivityIndicator color={theme.colors.accentAmber} style={styles.priceLoading} />
          ) : (
            <Text style={styles.price}>
              {pkg ? pkg.product.priceString : t('paywall.fallbackPrice')}
              <Text style={styles.priceUnit}> {t('paywall.perMonth')}</Text>
            </Text>
          )}
          <Text style={styles.trialHint}>{t('paywall.trialHint')}</Text>
          {!loadingOffering && !pkg && <Text style={styles.unavailableHint}>{t('paywall.notAvailable')}</Text>}
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        <PrimaryButton label={purchasing ? t('paywall.purchasing') : t('paywall.subscribe')} onPress={handlePurchase} disabled={purchasing || !pkg} />

        <Pressable onPress={handleRestore} disabled={restoring} style={styles.restoreLink}>
          <Text style={styles.restoreLinkText}>{restoring ? t('paywall.restoring') : t('paywall.restore')}</Text>
        </Pressable>

        <Pressable onPress={hidePaywall} style={styles.continueFreeLink}>
          <Text style={styles.continueFreeLinkText}>{t('paywall.continueFree')}</Text>
        </Pressable>
      </ScrollView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, zIndex: 10 },
  container: { padding: 24, paddingTop: 72, paddingBottom: 48, alignItems: 'center' },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.accentAmberSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  headline: { fontFamily: theme.typography.display, fontSize: 24, color: theme.colors.textPrimary, textAlign: 'center' },
  subheadline: {
    fontFamily: theme.typography.body,
    fontSize: 14,
    color: theme.colors.textMuted,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 24,
  },
  featureList: { alignSelf: 'stretch', gap: 12, marginBottom: 24 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  featureText: { fontFamily: theme.typography.body, fontSize: 14, color: theme.colors.textPrimary, flex: 1 },
  priceCard: {
    alignSelf: 'stretch',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.accentAmber,
    backgroundColor: theme.colors.accentAmberSoft,
    borderRadius: theme.radius.lg,
    padding: 20,
    marginBottom: 20,
    gap: 8,
  },
  priceLoading: { marginVertical: 6 },
  price: { fontFamily: theme.typography.display, fontSize: 28, color: theme.colors.textPrimary },
  priceUnit: { fontFamily: theme.typography.body, fontSize: 14, color: theme.colors.textMuted },
  trialHint: { fontFamily: theme.typography.body, fontSize: 12, color: theme.colors.textMuted },
  unavailableHint: { fontFamily: theme.typography.body, fontSize: 12, color: theme.colors.textFaint, textAlign: 'center' },
  error: { fontFamily: theme.typography.body, fontSize: 13, color: theme.colors.dangerEmber, marginBottom: 12, textAlign: 'center' },
  restoreLink: { marginTop: 16 },
  restoreLinkText: { fontFamily: theme.typography.body, fontSize: 13, color: theme.colors.textSecondary },
  continueFreeLink: { marginTop: 12 },
  continueFreeLinkText: { fontFamily: theme.typography.bodyMedium, fontSize: 14, color: theme.colors.textPrimary },
});
