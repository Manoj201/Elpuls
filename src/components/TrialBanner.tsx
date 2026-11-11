import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useUserStore } from '../stores/useUserStore';
import { useUiStore } from '../stores/useUiStore';
import { theme } from '../theme';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function TrialBanner() {
  const { t } = useTranslation();
  const proPeriodType = useUserStore((s) => s.proPeriodType);
  const proExpirationMillis = useUserStore((s) => s.proExpirationMillis);
  const showPaywall = useUiStore((s) => s.showPaywall);

  if (proPeriodType !== 'TRIAL' || proExpirationMillis === null) return null;

  const daysLeft = Math.max(0, Math.ceil((proExpirationMillis - Date.now()) / MS_PER_DAY));

  return (
    <Pressable onPress={showPaywall}>
      <View style={styles.banner}>
        <View style={styles.textBlock}>
          <Text style={styles.title}>{t('trialBanner.title')}</Text>
          <Text style={styles.subtitle}>{t('trialBanner.daysLeft', { count: daysLeft })}</Text>
        </View>
        <Text style={styles.cta}>{t('trialBanner.cta')}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.inkButton,
    borderRadius: theme.radius.md,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  textBlock: { flex: 1 },
  title: { fontFamily: theme.typography.bodyMedium, fontSize: 14, color: theme.colors.onInkButton },
  subtitle: { fontFamily: theme.typography.body, fontSize: 12, color: theme.colors.onInkButton, opacity: 0.7, marginTop: 2 },
  cta: { fontFamily: theme.typography.bodyMedium, fontSize: 13, color: theme.colors.onInkButton, textDecorationLine: 'underline' },
});
