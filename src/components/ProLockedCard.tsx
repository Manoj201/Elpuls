import type { ComponentType, ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { IconChevronRight, IconLock } from '@tabler/icons-react-native';
import { useUiStore, type PaywallSource } from '../stores/useUiStore';
import { useUserStore } from '../stores/useUserStore';
import { theme } from '../theme';
import { Card } from './Card';
import { Chip } from './Chip';
import { InfoRow } from './InfoRow';

interface ProLockedCardProps {
  title: string;
  subtitle: string;
  icon?: ComponentType<{ size?: number; color?: string }>;
  /** A sample of the real content, shown dimmed under an "Example" label so people see what they'd get. */
  preview?: ReactNode;
  /** Button text. Defaults to the free-trial offer. */
  ctaLabel?: string;
  /** Tells the paywall which feature was tapped, for a matching headline. */
  source?: PaywallSource;
  /**
   * 'link' (default): a text link, the same on every screen so all Pro
   * teasers look alike and never compete with a screen's real actions.
   * 'button': a filled button, kept for a possible full-screen upsell.
   */
  ctaStyle?: 'button' | 'link';
  /** Bordered box instead of a full Card, for use inside another card (e.g. the price chart). */
  inline?: boolean;
}

// Icon (32) + gap (12) from InfoRow: lines the link up with the title text.
const TEXT_INDENT = 44;

/** Teaser shown in place of a Pro feature when the user isn't subscribed. Tapping anywhere opens the paywall. */
export function ProLockedCard({
  title,
  subtitle,
  icon = IconLock,
  preview,
  ctaLabel,
  source = 'generic',
  ctaStyle = 'link',
  inline = false,
}: ProLockedCardProps) {
  const { t } = useTranslation();
  const showPaywall = useUiStore((s) => s.showPaywall);
  const trialDays = useUserStore((s) => s.trialDays);
  // Only promise a trial the store says this Apple ID can still get.
  const cta = ctaLabel ?? (trialDays ? t('pro.tryFree', { days: trialDays }) : t('pro.getPro'));

  const content = (
    <>
      <View style={styles.headerRow}>
        <View style={styles.flex}>
          <InfoRow icon={icon} variant="amber" title={title} subtitle={subtitle} />
        </View>
        <Chip label={t('pro.tag')} variant="amber" />
      </View>

      {preview ? (
        <View style={styles.preview} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          <Text style={styles.exampleLabel}>{t('pro.example')}</Text>
          <View style={styles.previewContent}>{preview}</View>
        </View>
      ) : null}

      {ctaStyle === 'button' ? (
        <View style={styles.cta}>
          <IconLock size={14} color={theme.colors.onInkButton} />
          <Text style={styles.ctaText}>{cta}</Text>
        </View>
      ) : (
        <View style={[styles.link, !preview && styles.linkIndented]}>
          <Text style={styles.linkText}>{cta}</Text>
          <IconChevronRight size={16} color={theme.colors.accentPurpleDeep} />
        </View>
      )}
    </>
  );

  return (
    <Pressable
      onPress={() => showPaywall(source)}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${subtitle}. ${cta}`}
      style={({ pressed }) => pressed && styles.pressed}
    >
      {inline ? <View style={[styles.card, styles.inline]}>{content}</View> : <Card style={styles.card}>{content}</Card>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { gap: 14 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  flex: { flex: 1 },
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
  // Looks like a compact primary button (full content width, same edges as the
  // example box); the whole card is the tap target.
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.inkButton,
  },
  ctaText: { fontFamily: theme.typography.bodySemibold, fontSize: theme.type.sm, color: theme.colors.onInkButton },
  link: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 24 },
  linkIndented: { marginLeft: TEXT_INDENT, marginTop: -4 },
  linkText: { fontFamily: theme.typography.bodySemibold, fontSize: theme.type.sm, color: theme.colors.accentPurpleDeep },
  inline: {
    padding: 14,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  pressed: { opacity: 0.85 },
});

/** One label/value line for a teaser's "Example" preview (e.g. a sample cost breakdown). */
export function PreviewRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={previewStyles.row}>
      <Text style={[previewStyles.label, strong && previewStyles.strong]}>{label}</Text>
      <Text style={[previewStyles.value, strong && previewStyles.strong]}>{value}</Text>
    </View>
  );
}

const previewStyles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, paddingVertical: 3 },
  label: { flex: 1, fontFamily: theme.typography.body, fontSize: theme.type.sm, color: theme.colors.textPrimary },
  value: { fontFamily: theme.typography.bodyMedium, fontSize: theme.type.sm, color: theme.colors.textPrimary },
  strong: { fontFamily: theme.typography.bodySemibold },
});
