import { useEffect, useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useCountryStore } from '../stores/useCountryStore';
import { usePriceStore } from '../stores/usePriceStore';
import { groupPricesByHour } from '../lib/priceUtils';
import { summarizeTimeBlocks, type TimeBlockSummary } from '../lib/timeBlocks';
import { formatOre } from '../lib/formatNumber';
import type { SupportedLanguage } from '../i18n';
import { theme } from '../theme';
import { Card } from '../components/Card';
import { Chip, type ChipVariant } from '../components/Chip';

const BLOCK_VARIANT: Record<TimeBlockSummary['label'], ChipVariant> = {
  cheap: 'teal',
  normal: 'neutral',
  expensive: 'amber',
  avoid: 'danger',
};

const BLOCK_INDICATOR_COLOR: Record<TimeBlockSummary['label'], string> = {
  cheap: theme.colors.positiveTeal,
  normal: theme.colors.textFaint,
  expensive: theme.colors.accentAmber,
  avoid: theme.colors.dangerEmber,
};

// Wide enough to fit the longest tag label ("Expensive") without wrapping.
const BLOCK_TAG_WIDTH = 92;

// "Normal" doesn't get its own strong semantic color (unlike cheap/expensive/
// avoid) — reusing the shared Chip's generic "neutral" variant here read as
// washed-out/almost invisible against the card, so it gets its own
// slightly-raised pill instead, just for this screen.
//
// Fixed width on all four variants (incl. the non-Chip "normal" pill) so the
// tags line up instead of each sizing to its own label's text length —
// "Expensive"/"Avoid" otherwise come out visibly wider/narrower than
// "Cheap"/"Normal" stacked one per block row.
function BlockTag({ label }: { label: TimeBlockSummary['label'] }) {
  const { t } = useTranslation();
  if (label === 'normal') {
    return (
      <View style={styles.normalTag}>
        <Text style={styles.normalTagText}>{t('forecast.tag.normal')}</Text>
      </View>
    );
  }
  return <Chip label={t(`forecast.tag.${label}`)} variant={BLOCK_VARIANT[label]} style={styles.blockTagChip} />;
}

function DaySummary({
  title,
  hourlyPrices,
  language,
}: {
  title: string;
  hourlyPrices: ReturnType<typeof groupPricesByHour>;
  language: SupportedLanguage;
}) {
  const { t } = useTranslation();
  const avgPrice = hourlyPrices.length > 0 ? hourlyPrices.reduce((s, p) => s + p.price, 0) / hourlyPrices.length : null;
  const blocks = useMemo(() => summarizeTimeBlocks(hourlyPrices), [hourlyPrices]);

  return (
    <Card style={styles.dayCard}>
      <Text style={styles.dayTitle}>{title}</Text>

      {avgPrice === null ? (
        <Text style={styles.empty}>{t('forecast.noPrices')}</Text>
      ) : (
        <>
          <Text style={styles.dayAverage}>{formatOre(avgPrice, language)}</Text>
          <Text style={styles.dayAverageUnit}>
            öre/kWh · {t('forecast.average')}
          </Text>
        </>
      )}

      <View style={[styles.blockList, avgPrice === null && styles.blockListPending]}>
        {blocks.map((block) => (
          <View key={block.id} style={styles.blockRow}>
            <View style={[styles.blockIndicator, { backgroundColor: BLOCK_INDICATOR_COLOR[block.label] }]} />
            <View style={styles.blockTimeLabel}>
              <Text style={styles.blockTime}>
                {String(block.startHour).padStart(2, '0')}:00–{String(block.endHour).padStart(2, '0')}:00
              </Text>
              <Text style={styles.blockLabel}>{t(`forecast.blocks.${block.id}`)}</Text>
            </View>
            {block.averagePrice !== null ? (
              <View style={styles.blockValue}>
                <Text style={styles.blockPrice}>
                  {formatOre(block.averagePrice, language)} <Text style={styles.blockPriceUnit}>öre</Text>
                </Text>
                <BlockTag label={block.label} />
              </View>
            ) : (
              <Text style={styles.blockPriceEmpty}>—</Text>
            )}
          </View>
        ))}
      </View>
    </Card>
  );
}

export function ForecastScreen() {
  const { t, i18n } = useTranslation();
  const language = i18n.language as SupportedLanguage;
  const zone = useCountryStore((s) => s.zone);
  const { todayPrices, tomorrowPrices, fetchPrices } = usePriceStore();

  useEffect(() => {
    fetchPrices(zone);
  }, [fetchPrices, zone]);

  const todayHourly = useMemo(() => groupPricesByHour(todayPrices), [todayPrices]);
  const tomorrowHourly = useMemo(() => groupPricesByHour(tomorrowPrices), [tomorrowPrices]);

  const todayAvg = todayHourly.length > 0 ? todayHourly.reduce((s, p) => s + p.price, 0) / todayHourly.length : null;
  const tomorrowAvg =
    tomorrowHourly.length > 0 ? tomorrowHourly.reduce((s, p) => s + p.price, 0) / tomorrowHourly.length : null;
  const diffPct = todayAvg !== null && tomorrowAvg !== null && todayAvg > 0 ? ((tomorrowAvg - todayAvg) / todayAvg) * 100 : null;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>{t('forecast.title')}</Text>
      <Text style={styles.subtitle}>{t('forecast.subtitle', { zone })}</Text>

      {diffPct !== null && (
        <Card style={styles.diffCard}>
          <Text style={styles.diffLabel}>
            {diffPct <= 0 ? t('forecast.tomorrowCheaper') : t('forecast.tomorrowPricier')}
          </Text>
          <Text style={[styles.diffValue, { color: diffPct <= 0 ? theme.colors.positiveTeal : theme.colors.dangerEmber }]}>
            {diffPct <= 0 ? '' : '+'}
            {Math.round(diffPct)}%
          </Text>
        </Card>
      )}

      <DaySummary title={t('forecast.today')} hourlyPrices={todayHourly} language={language} />
      <DaySummary title={t('forecast.tomorrow')} hourlyPrices={tomorrowHourly} language={language} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingTop: 60, paddingBottom: 40 },
  title: { fontFamily: theme.typography.display, fontSize: 26, color: theme.colors.textPrimary },
  subtitle: { fontFamily: theme.typography.body, fontSize: 14, color: theme.colors.textMuted, marginTop: 4, marginBottom: 20 },
  diffCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  diffLabel: { fontFamily: theme.typography.bodyMedium, fontSize: 14, color: theme.colors.textPrimary, flex: 1 },
  diffValue: { fontFamily: theme.typography.display, fontSize: 20 },
  dayCard: { marginBottom: 16 },
  dayTitle: { fontFamily: theme.typography.displayMedium, fontSize: 16, color: theme.colors.textPrimary, marginBottom: 6 },
  dayAverage: { fontFamily: theme.typography.display, fontSize: 30, color: theme.colors.textPrimary },
  dayAverageUnit: {
    fontFamily: theme.typography.bodyMedium,
    fontSize: 11,
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 2,
    marginBottom: 18,
  },
  empty: { fontFamily: theme.typography.body, fontSize: 14, color: theme.colors.textMuted, marginBottom: 14 },
  blockList: { gap: 14 },
  blockListPending: { opacity: 0.45 },
  blockRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  blockIndicator: { width: 4, alignSelf: 'stretch', borderRadius: 2, minHeight: 32 },
  blockTimeLabel: { flex: 1, gap: 2 },
  blockTime: { fontFamily: theme.typography.bodyMedium, fontSize: 13, color: theme.colors.textSecondary },
  blockLabel: { fontFamily: theme.typography.body, fontSize: 12, color: theme.colors.textMuted },
  blockValue: { alignItems: 'flex-end', gap: 4 },
  blockPrice: { fontFamily: theme.typography.displayMedium, fontSize: 15, color: theme.colors.textPrimary },
  blockPriceUnit: { fontFamily: theme.typography.body, fontSize: 11, color: theme.colors.textMuted },
  blockPriceEmpty: { fontFamily: theme.typography.body, fontSize: 14, color: theme.colors.textFaint },
  normalTag: {
    width: BLOCK_TAG_WIDTH,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: theme.radius.pill,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  normalTagText: { fontFamily: theme.typography.bodyMedium, fontSize: 13, color: theme.colors.textSecondary },
  blockTagChip: { width: BLOCK_TAG_WIDTH, justifyContent: 'center' },
});
