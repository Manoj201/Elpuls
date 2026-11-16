import type { ComponentType, ReactNode } from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useUiStore, type PaywallSource } from '../stores/useUiStore';
import { useUserStore } from '../stores/useUserStore';
import { theme } from '../theme';
import { Card } from './Card';
import { Chip } from './Chip';
import { PrimaryButton } from './PrimaryButton';

export interface ProBenefit {
  icon: ComponentType<{ size?: number; color?: string }>;
  title: string;
  text: string;
}

interface ProUpsellCardProps {
  title: string;
  /** What Pro adds on this screen, most valuable first. Keep it to 3-5. */
  benefits: ProBenefit[];
  /** Tells the paywall which screen it came from, for a matching headline. */
  source?: PaywallSource;
  /** Optional dimmed sample, for screens with no free content of their own (Statistik). */
  preview?: ReactNode;
  style?: ViewStyle;
}

/**
 * The one Pro offer on a screen for free users (UI/UX Pro Max: primary-action,
 * content-priority, progressive-disclosure). Replaces a locked card per
 * feature: a short list of what Pro adds here and a single button. Place it
 * after the screen's free content.
 */
export function ProUpsellCard({ title, benefits, source = 'generic', preview, style }: ProUpsellCardProps) {
  const { t } = useTranslation();
  const showPaywall = useUiStore((s) => s.showPaywall);
  const trialDays = useUserStore((s) => s.trialDays);
  // Only promise a trial the store says this Apple ID can still get.
  const cta = trialDays ? t('pro.tryFree', { days: trialDays }) : t('pro.getPro');

  return (
    <Card style={{ ...styles.card, ...style }}>
      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
        <Chip label={t('pro.tag')} variant="amber" />
      </View>

      {preview ? (
        <View style={styles.preview} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden pointerEvents="none">
          <Text style={styles.exampleLabel}>{t('pro.example')}</Text>
          <View style={styles.previewContent}>{preview}</View>
        </View>
      ) : null}

      <View style={styles.list}>
        {benefits.map((b) => (
          <View key={b.title} style={styles.row} accessible accessibilityLabel={`${b.title}. ${b.text}`}>
            <View style={styles.iconWrap}>
              <b.icon size={18} color={theme.colors.accentPurpleDeep} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.rowTitle}>{b.title}</Text>
              <Text style={styles.rowText}>{b.text}</Text>
            </View>
          </View>
        ))}
      </View>

      <PrimaryButton size="compact" label={cta} onPress={() => showPaywall(source)} />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { flex: 1, fontFamily: theme.typography.displayMedium, fontSize: theme.type.lg, color: theme.colors.textPrimary },
  list: { gap: 14 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.accentPurpleSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: { flex: 1 },
  rowTitle: { fontFamily: theme.typography.bodySemibold, fontSize: theme.type.md, color: theme.colors.textPrimary },
  rowText: { fontFamily: theme.typography.body, fontSize: theme.type.sm, color: theme.colors.textSecondary, marginTop: 2 },
  preview: {
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderMuted,
    backgroundColor: theme.colors.background,
    padding: 12,
  },
  exampleLabel: {
    fontFamily: theme.typography.bodyMedium,
    fontSize: theme.type.xs,
    color: theme.colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  previewContent: { opacity: 0.55 },
});
