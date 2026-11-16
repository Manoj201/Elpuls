import { useEffect, useState, type ComponentType } from 'react';
import { LayoutAnimation, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  IconArrowLeft,
  IconChartBar,
  IconChartLine,
  IconChevronDown,
  IconChevronRight,
  IconCircle,
  IconCircleCheck,
  IconGauge,
  IconPlayerPlay,
  IconSettings,
} from '@tabler/icons-react-native';
import { useUserStore } from '../stores/useUserStore';
import { useApplianceStore } from '../stores/useApplianceStore';
import { theme } from '../theme';
import { Card } from '../components/Card';
import { SecondaryButton } from '../components/SecondaryButton';

interface GuideScreenProps {
  uid: string;
  onBack: () => void;
  onOpenBillScan: (manual?: boolean) => void;
  onOpenApplianceScan: () => void;
  onOpenNotifications: () => void;
  onReplayIntro: () => void;
}

type IconType = ComponentType<{ size?: number; color?: string }>;

// Same labels and icons as the tab bar in App.tsx.
const TABS: { id: string; labelKey: string; icon: IconType }[] = [
  { id: 'overview', labelKey: 'app.tabOverview', icon: IconGauge },
  { id: 'forecast', labelKey: 'app.tabForecast', icon: IconChartLine },
  { id: 'stats', labelKey: 'app.tabStats', icon: IconChartBar },
  { id: 'settings', labelKey: 'app.tabSettings', icon: IconSettings },
];

const FAQ_IDS = ['bill', 'zones', 'colours', 'quarter', 'pro', 'control', 'source', 'privacy'] as const;

/**
 * "Så fungerar Elpuls": help that's always one tap away (Settings → Om
 * Elpuls), not only in the one-time intro. Setup steps with their status,
 * what each tab is for, short answers to common questions, and a way to
 * replay the intro. All copy follows the app language (sv/en).
 */
export function GuideScreen({ uid, onBack, onOpenBillScan, onOpenApplianceScan, onOpenNotifications, onReplayIntro }: GuideScreenProps) {
  const { t } = useTranslation();
  const hasGridFee = useUserStore((s) => s.gridFeeVariableSekPerKwh !== null);
  const hasMarkup = useUserStore((s) => s.retailerMarkupSekPerKwh !== null);
  const alertsOn = useUserStore((s) => s.priceAlertHighThresholdOre !== null || s.priceAlertLowEnabled);
  const setupDismissedAt = useUserStore((s) => s.setupDismissedAt);
  const restoreSetup = useUserStore((s) => s.restoreSetup);
  const trialDays = useUserStore((s) => s.trialDays);
  const appliances = useApplianceStore((s) => s.appliances);
  const fetchAppliances = useApplianceStore((s) => s.fetchAppliances);
  const [openFaq, setOpenFaq] = useState<string | null>(null);

  useEffect(() => {
    fetchAppliances(uid);
  }, [fetchAppliances, uid]);

  // Once the guide has been opened, the Home card has done its job.
  const hideGuideCard = useUserStore((s) => s.hideGuideCard);
  useEffect(() => {
    hideGuideCard();
  }, [hideGuideCard]);

  // Same steps, order and wording as the setup card on Översikt.
  const steps = [
    { id: 'gridFee', done: hasGridFee, onPress: () => onOpenBillScan() },
    { id: 'markup', done: hasMarkup, onPress: () => onOpenBillScan() },
    { id: 'appliance', done: appliances.length > 0, onPress: onOpenApplianceScan },
    { id: 'alerts', done: alertsOn, onPress: onOpenNotifications },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const canRestoreSetup = setupDismissedAt !== null && doneCount < steps.length;

  function toggleFaq(id: string) {
    LayoutAnimation.configureNext(LayoutAnimation.create(180, 'easeInEaseOut', 'opacity'));
    setOpenFaq((current) => (current === id ? null : id));
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Pressable onPress={onBack} hitSlop={12} style={styles.backRow} accessibilityRole="button" accessibilityLabel={t('common.back')}>
        <IconArrowLeft size={22} color={theme.colors.textSecondary} />
        <Text style={styles.backText}>{t('common.back')}</Text>
      </Pressable>
      <Text style={styles.title} accessibilityRole="header">
        {t('guide.title')}
      </Text>
      <Text style={styles.subtitle}>{t('guide.subtitle')}</Text>

      {/* 1. Get started: the steps that make the numbers personal. */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          {t('guide.setupTitle')}
        </Text>
        <Text style={styles.sectionMeta}>{t('setup.progress', { done: doneCount, total: steps.length })}</Text>
      </View>
      <Card style={styles.listCard}>
        {steps.map((step, index) => (
          <Pressable
            key={step.id}
            onPress={step.onPress}
            accessibilityRole="button"
            accessibilityLabel={`${t(`setup.${step.id}Title`)}. ${step.done ? t('guide.done') : t(`setup.${step.id}Subtitle`)}`}
            style={({ pressed }) => [styles.stepRow, index > 0 && styles.divider, pressed && styles.pressed]}
          >
            {step.done ? (
              <IconCircleCheck size={22} color={theme.colors.positiveTeal} />
            ) : (
              <IconCircle size={22} color={theme.colors.textMuted} />
            )}
            <View style={styles.stepText}>
              <Text style={[styles.stepTitle, step.done && styles.stepTitleDone]}>{t(`setup.${step.id}Title`)}</Text>
              {!step.done && <Text style={styles.stepSubtitle}>{t(`setup.${step.id}Subtitle`)}</Text>}
            </View>
            <IconChevronRight size={18} color={theme.colors.textSecondary} />
          </Pressable>
        ))}
      </Card>
      {canRestoreSetup && (
        <Pressable onPress={restoreSetup} hitSlop={8} style={styles.textLink} accessibilityRole="button">
          <Text style={styles.textLinkLabel}>{t('guide.showOnHome')}</Text>
        </Pressable>
      )}

      {/* 2. What each tab is for. */}
      <Text style={[styles.sectionTitle, styles.sectionSpacing]} accessibilityRole="header">
        {t('guide.tabsTitle')}
      </Text>
      <Card style={styles.listCard}>
        {TABS.map(({ id, labelKey, icon: Icon }, index) => (
          <View key={id} style={[styles.tabRow, index > 0 && styles.divider]} accessible>
            <View style={styles.tabIcon}>
              <Icon size={20} color={theme.colors.accentPurpleDeep} />
            </View>
            <View style={styles.stepText}>
              <Text style={styles.stepTitle}>{t(labelKey)}</Text>
              <Text style={styles.stepSubtitle}>{t(`guide.tab.${id}Text`)}</Text>
            </View>
          </View>
        ))}
      </Card>

      {/* 3. Common questions, short answers that expand in place. */}
      <Text style={[styles.sectionTitle, styles.sectionSpacing]} accessibilityRole="header">
        {t('guide.faqTitle')}
      </Text>
      <Card style={styles.listCard}>
        {FAQ_IDS.map((id, index) => {
          const open = openFaq === id;
          return (
            <View key={id} style={index > 0 && styles.divider}>
              <Pressable
                onPress={() => toggleFaq(id)}
                accessibilityRole="button"
                accessibilityState={{ expanded: open }}
                style={({ pressed }) => [styles.faqQuestionRow, pressed && styles.pressed]}
              >
                <Text style={styles.faqQuestion}>{t(`guide.faq.${id}Q`)}</Text>
                <View style={open && styles.chevronOpen}>
                  <IconChevronDown size={20} color={theme.colors.textSecondary} />
                </View>
              </Pressable>
              {open && <Text style={styles.faqAnswer}>{t(`guide.faq.${id}A`, { days: trialDays ?? 14 })}</Text>}
            </View>
          );
        })}
      </Card>

      {/* 4. The intro, again. */}
      <View style={styles.replay}>
        <SecondaryButton size="compact" label={t('guide.replayIntro')} onPress={onReplayIntro} />
        <View style={styles.replayHint}>
          <IconPlayerPlay size={14} color={theme.colors.textSecondary} />
          <Text style={styles.replayHintText}>{t('guide.replayHint')}</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingTop: 60, paddingBottom: 48 },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, alignSelf: 'flex-start', marginBottom: 8 },
  backText: { fontFamily: theme.typography.bodyMedium, fontSize: theme.type.md, color: theme.colors.textSecondary },
  title: { fontFamily: theme.typography.display, fontSize: theme.type.xl, color: theme.colors.textPrimary },
  subtitle: { fontFamily: theme.typography.body, fontSize: theme.type.md, lineHeight: 22, color: theme.colors.textSecondary, marginTop: 4, marginBottom: 24 },
  sectionHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 },
  sectionTitle: { fontFamily: theme.typography.displayMedium, fontSize: theme.type.lg, color: theme.colors.textPrimary, marginBottom: 10 },
  sectionMeta: { fontFamily: theme.typography.bodyMedium, fontSize: theme.type.sm, color: theme.colors.textSecondary },
  sectionSpacing: { marginTop: 28 },
  listCard: { paddingVertical: 0, paddingHorizontal: 16 },
  divider: { borderTopWidth: 1, borderTopColor: theme.colors.borderMuted },
  pressed: { opacity: 0.85 },
  stepRow: { flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingVertical: 12 },
  stepText: { flex: 1, marginHorizontal: 12 },
  stepTitle: { fontFamily: theme.typography.bodyMedium, fontSize: theme.type.md, color: theme.colors.textPrimary },
  stepTitleDone: { color: theme.colors.textSecondary },
  stepSubtitle: { fontFamily: theme.typography.body, fontSize: theme.type.sm, lineHeight: 20, color: theme.colors.textSecondary, marginTop: 2 },
  textLink: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', marginTop: 4 },
  textLinkLabel: { fontFamily: theme.typography.bodyMedium, fontSize: theme.type.md, color: theme.colors.textSecondary, textDecorationLine: 'underline' },
  tabRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  tabIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.accentPurpleSoft,
  },
  faqQuestionRow: { flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingVertical: 12 },
  faqQuestion: { flex: 1, marginRight: 12, fontFamily: theme.typography.bodyMedium, fontSize: theme.type.md, lineHeight: 22, color: theme.colors.textPrimary },
  chevronOpen: { transform: [{ rotate: '180deg' }] },
  faqAnswer: { fontFamily: theme.typography.body, fontSize: theme.type.md, lineHeight: 24, color: theme.colors.textSecondary, paddingBottom: 16 },
  replay: { marginTop: 28, gap: 8 },
  replayHint: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  replayHintText: { fontFamily: theme.typography.body, fontSize: theme.type.sm, color: theme.colors.textSecondary },
});
