import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  IconBellRinging,
  IconBolt,
  IconBulb,
  IconCalendarEvent,
  IconCalendarStats,
  IconClock,
  IconSparkles,
} from '@tabler/icons-react-native';
import { DEFAULT_TRIAL_DAYS } from '../lib/purchases';
import { calculateLandedPrice } from '../lib/landedCost';
import { RealPriceBars } from '../components/RealPriceBars';
import { theme } from '../theme';
import { PrimaryButton } from '../components/PrimaryButton';

interface IntroScreenProps {
  onDone: () => void;
}

const PAGE_COUNT = 3;

/**
 * Three short pages shown once after install, before Login: what you really
 * pay, when to use power, and what Pro adds. Every page can be skipped, and
 * swiping is optional — Next/Back buttons do the same thing.
 */
export function IntroScreen({ onDone }: IntroScreenProps) {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const [page, setPage] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
  }, []);

  function goTo(next: number) {
    if (next >= PAGE_COUNT) {
      onDone();
      return;
    }
    const target = Math.max(0, next);
    setPage(target);
    scrollRef.current?.scrollTo({ x: target * width, animated: !reduceMotion });
  }

  function handleScrollEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    setPage(Math.round(e.nativeEvent.contentOffset.x / width));
  }

  const isLast = page === PAGE_COUNT - 1;

  return (
    <View style={styles.root}>
      <View style={styles.topBar}>
        <Text style={styles.brand}>Elpuls</Text>
        {!isLast && (
          <Pressable onPress={onDone} hitSlop={12} style={styles.skip} accessibilityRole="button">
            <Text style={styles.skipText}>{t('intro.skip')}</Text>
          </Pressable>
        )}
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScrollEnd}
        style={styles.pager}
      >
        <Page width={width} title={t('intro.page1Title')} text={t('intro.page1Text')}>
          <BillBreakdown />
        </Page>
        <Page width={width} title={t('intro.page2Title')} text={t('intro.page2Text')}>
          <WaitExample />
        </Page>
        <Page width={width} title={t('intro.page3Title')} text={t('intro.page3Text', { days: DEFAULT_TRIAL_DAYS })}>
          <ProList />
        </Page>
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.dots} accessibilityLabel={t('intro.pageOf', { page: page + 1, total: PAGE_COUNT })}>
          {Array.from({ length: PAGE_COUNT }, (_, i) => (
            <View key={i} style={[styles.dot, i === page && styles.dotActive]} />
          ))}
        </View>
        <PrimaryButton label={isLast ? t('intro.start') : t('intro.next')} onPress={() => goTo(page + 1)} />
        <View style={styles.backSlot}>
          {page > 0 && (
            <Pressable onPress={() => goTo(page - 1)} hitSlop={12} accessibilityRole="button" style={styles.back}>
              <Text style={styles.backText}>{t('common.back')}</Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

function Page({ width, title, text, children }: { width: number; title: string; text: string; children: React.ReactNode }) {
  return (
    // Scrolls on small phones or large text sizes instead of clipping.
    <ScrollView style={{ width }} contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
      <View style={styles.visual}>{children}</View>
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      <Text style={styles.text}>{text}</Text>
    </ScrollView>
  );
}

// Page 1 example, computed with the app's own formula so it can't drift:
// spot 100 öre + grid fee 25 öre + energy tax + elcertifikat, plus VAT.
const EXAMPLE_SPOT_SEK = 1.0;
const EXAMPLE_GRID_FEE_SEK = 0.25;

/** Page 1: the spot price in the news vs. what you actually pay per kWh. */
function BillBreakdown() {
  const { t } = useTranslation();
  const paidOre = Math.round(calculateLandedPrice(EXAMPLE_SPOT_SEK, EXAMPLE_GRID_FEE_SEK) * 100);
  const spotOre = Math.round(EXAMPLE_SPOT_SEK * 100);
  return (
    <ExampleCard scenario={t('intro.breakdownScenario', { spot: spotOre, grid: Math.round(EXAMPLE_GRID_FEE_SEK * 100) })}>
      <RealPriceBars
        spotLabel={t('realPrice.spotLabel')}
        spotValue={t('realPrice.ore', { value: spotOre })}
        paidLabel={t('realPrice.paidLabel')}
        paidValue={t('realPrice.ore', { value: paidOre })}
        spotShare={spotOre / paidOre}
        accessibilityLabel={`${t('intro.exampleTag')}. ${t('realPrice.a11y', { spot: spotOre, paid: paidOre })}`}
      />
    </ExampleCard>
  );
}

/** Page 2: running the dishwasher now vs. in the cheapest hour. */
function WaitExample() {
  const { t } = useTranslation();
  return (
    <ExampleCard scenario={t('intro.exampleScenario')}>
      <View style={styles.compareRow}>
        <View style={styles.compareIcon}>
          <IconBolt size={22} color={theme.colors.dangerEmberDeep} />
        </View>
        <Text style={styles.compareLabel}>{t('intro.exampleNow')}</Text>
        <Text style={[styles.comparePrice, { color: theme.colors.dangerEmberDeep }]}>4,20 kr</Text>
      </View>
      <View style={styles.compareDivider} />
      <View style={styles.compareRow}>
        <View style={[styles.compareIcon, { backgroundColor: theme.colors.positiveTealSoft }]}>
          <IconClock size={22} color={theme.colors.positiveTealDeep} />
        </View>
        <Text style={styles.compareLabel}>{t('intro.exampleLater')}</Text>
        <Text style={[styles.comparePrice, { color: theme.colors.positiveTealDeep }]}>1,10 kr</Text>
      </View>
    </ExampleCard>
  );
}

/**
 * Frame for the made-up numbers on pages 1-2. Testers took them for live
 * prices, so the "Exempel" tag and the what-if scenario come *before* the
 * numbers, the dashed border reads as an illustration rather than an app
 * card, and the last line says where the user's own prices show up.
 */
function ExampleCard({ scenario, children }: { scenario: string; children: React.ReactNode }) {
  const { t } = useTranslation();
  return (
    <View style={[styles.visualCard, styles.exampleCard]}>
      <View style={styles.exampleHeader}>
        <View style={styles.exampleTag}>
          <IconBulb size={14} color={theme.colors.accentPurpleDeep} />
          <Text style={styles.exampleTagText}>{t('intro.exampleTag')}</Text>
        </View>
        <Text style={styles.exampleScenario}>{scenario}</Text>
      </View>
      {children}
      <Text style={styles.exampleNote}>{t('intro.ownPricesNote')}</Text>
    </View>
  );
}

/** Page 3: what Pro adds, with the AI feature clearly marked. */
function ProList() {
  const { t } = useTranslation();
  // Most valuable first; the same features the paywall and Home's Pro card lead with.
  const items = [
    { key: 'plan', icon: IconCalendarEvent, ai: false },
    { key: 'pushes', icon: IconBellRinging, ai: false },
    { key: 'outlook', icon: IconCalendarStats, ai: true },
    { key: 'explainer', icon: IconSparkles, ai: true },
  ];
  return (
    <View style={styles.visualCard}>
      {items.map(({ key, icon: Icon, ai }) => (
        <View key={key} style={styles.proRow}>
          <View style={styles.proIcon}>
            <Icon size={22} color={theme.colors.accentAmberDeep} />
          </View>
          <Text style={styles.proText}>{t(`intro.pro.${key}`)}</Text>
          {ai && (
            <View style={styles.aiBadge}>
              <Text style={styles.aiBadgeText}>{t('ai.badge')}</Text>
            </View>
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: 60 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, minHeight: 44 },
  brand: { fontFamily: theme.typography.display, fontSize: theme.type.lg, color: theme.colors.textPrimary },
  skip: { minHeight: 44, minWidth: 44, alignItems: 'flex-end', justifyContent: 'center' },
  skipText: { fontFamily: theme.typography.bodyMedium, fontSize: theme.type.md, color: theme.colors.textSecondary },
  pager: { flex: 1 },
  page: { flexGrow: 1, paddingHorizontal: 24, paddingVertical: 16, justifyContent: 'center' },
  visual: { marginBottom: 32 },
  title: { fontFamily: theme.typography.display, fontSize: theme.type.xl, lineHeight: 30, color: theme.colors.textPrimary },
  text: { fontFamily: theme.typography.body, fontSize: theme.type.lg, lineHeight: 24, color: theme.colors.textSecondary, marginTop: 12 },
  visualCard: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radius.xl,
    padding: 20,
    gap: 14,
  },
  compareRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  compareIcon: {
    width: 44,
    height: 44,
    borderRadius: theme.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.dangerEmberSoft,
  },
  compareLabel: { flex: 1, fontFamily: theme.typography.bodyMedium, fontSize: theme.type.md, color: theme.colors.textPrimary },
  comparePrice: { fontFamily: theme.typography.display, fontSize: theme.type.xl },
  compareDivider: { height: 1, backgroundColor: theme.colors.borderMuted },
  // Dashed = illustration, not a live card.
  exampleCard: { borderStyle: 'dashed', borderColor: theme.colors.textMuted, backgroundColor: 'transparent' },
  exampleHeader: { gap: 8 },
  exampleTag: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    backgroundColor: theme.colors.accentPurpleSoft,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  exampleTagText: {
    fontFamily: theme.typography.bodySemibold,
    fontSize: theme.type.xs,
    color: theme.colors.accentPurpleDeep,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  exampleScenario: { fontFamily: theme.typography.bodyMedium, fontSize: theme.type.md, lineHeight: 22, color: theme.colors.textPrimary },
  exampleNote: { fontFamily: theme.typography.body, fontSize: theme.type.sm, lineHeight: 20, color: theme.colors.textSecondary },
  proRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  proIcon: {
    width: 44,
    height: 44,
    borderRadius: theme.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.accentAmberSoft,
  },
  proText: { flex: 1, fontFamily: theme.typography.bodyMedium, fontSize: theme.type.md, lineHeight: 24, color: theme.colors.textPrimary },
  aiBadge: {
    backgroundColor: theme.colors.accentPurpleSoft,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: `${theme.colors.accentPurple}55`,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  aiBadgeText: { fontFamily: theme.typography.bodyMedium, fontSize: theme.type.xs, color: theme.colors.accentPurpleDeep },
  footer: { paddingHorizontal: 24, paddingBottom: 32, gap: 16 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.border },
  dotActive: { width: 24, backgroundColor: theme.colors.accentPurple },
  backSlot: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  back: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 16 },
  backText: { fontFamily: theme.typography.bodyMedium, fontSize: theme.type.md, color: theme.colors.textSecondary },
});
