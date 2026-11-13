import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { theme } from '../theme';
import { formatOre } from '../lib/formatNumber';
import type { SupportedLanguage } from '../i18n';
import type { ZoneComparison } from '../lib/zoneComparison';

interface ComparisonCardProps {
  comparison: ZoneComparison;
}

const CARD_WIDTH = 320;
const CARD_HEIGHT = 480;

export function ComparisonCard({ comparison }: ComparisonCardProps) {
  const { t, i18n } = useTranslation();
  const language = i18n.language as SupportedLanguage;
  const isCheapest = comparison.multiple < 1;
  const multipleRounded = Math.round(Math.max(comparison.multiple, 1 / comparison.multiple) * 10) / 10;

  return (
    <View style={styles.card}>
      <Text style={styles.wordmark}>Elpuls</Text>

      <View style={styles.statBlock}>
        {isCheapest ? (
          <>
            <Text style={styles.headline}>{t('home.share.cheapestHeadline', { zone: comparison.yourZone })}</Text>
            <Text style={styles.subheadline}>
              {t('home.share.cheapestSubheadline', { otherZone: comparison.otherZone })}
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.headline}>{t('home.share.pricierHeadline', { multiple: multipleRounded })}</Text>
            <Text style={styles.subheadline}>
              {t('home.share.pricierSubheadline', { yourZone: comparison.yourZone, otherZone: comparison.otherZone })}
            </Text>
          </>
        )}
      </View>

      <View style={styles.pricesRow}>
        <View style={styles.priceBlock}>
          <Text style={styles.priceLabel}>{comparison.yourZone}</Text>
          <Text style={styles.priceValue}>{formatOre(comparison.yourAvgPrice, language)} öre</Text>
        </View>
        <View style={styles.priceBlock}>
          <Text style={styles.priceLabel}>{comparison.otherZone}</Text>
          <Text style={styles.priceValue}>{formatOre(comparison.otherAvgPrice, language)} öre</Text>
        </View>
      </View>

      <Text style={styles.footer}>{t('home.share.footer')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    backgroundColor: theme.colors.background,
    borderRadius: theme.radius.xl,
    padding: 28,
    justifyContent: 'space-between',
  },
  wordmark: { fontFamily: theme.typography.display, fontSize: theme.type.lg, color: theme.colors.textPrimary },
  statBlock: { alignItems: 'center' },
  headline: {
    fontFamily: theme.typography.display,
    fontSize: theme.type.xxl,
    color: theme.colors.accentPurpleDeep,
    textAlign: 'center',
  },
  subheadline: {
    fontFamily: theme.typography.body,
    fontSize: theme.type.sm,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
  },
  pricesRow: { flexDirection: 'row', justifyContent: 'space-around' },
  priceBlock: { alignItems: 'center' },
  priceLabel: {
    fontFamily: theme.typography.bodyMedium,
    fontSize: theme.type.xs,
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  priceValue: { fontFamily: theme.typography.display, fontSize: theme.type.lg, color: theme.colors.textPrimary, marginTop: 4 },
  footer: { fontFamily: theme.typography.body, fontSize: theme.type.xs, color: theme.colors.textFaint, textAlign: 'center' },
});
