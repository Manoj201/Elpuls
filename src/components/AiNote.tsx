import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { IconSparkles } from '@tabler/icons-react-native';
import { theme } from '../theme';

interface AiNoteProps {
  /** `explainer`: AI-written text. `scan`: values an AI read from a photo or PDF. */
  kind: 'explainer' | 'scan';
}

/**
 * Marks content produced by AI and says it can be wrong. Shown next to every
 * AI output in the app (price explainer, bill scan, appliance scan) so
 * nobody mistakes it for an exact, human-checked figure.
 */
export function AiNote({ kind }: AiNoteProps) {
  const { t } = useTranslation();
  const text = t(kind === 'explainer' ? 'ai.explainerNote' : 'ai.scanNote');

  return (
    <View style={styles.row} accessible accessibilityLabel={`${t('ai.badge')}. ${text}`}>
      <View style={styles.badge}>
        <IconSparkles size={12} color={theme.colors.accentPurpleDeep} />
        <Text style={styles.badgeText}>{t('ai.badge')}</Text>
      </View>
      <Text style={styles.text}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 10 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: theme.colors.accentPurpleSoft,
    borderColor: `${theme.colors.accentPurple}55`,
    borderWidth: 1,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: { fontFamily: theme.typography.bodyMedium, fontSize: theme.type.xs, color: theme.colors.accentPurpleDeep },
  text: { flex: 1, fontFamily: theme.typography.body, fontSize: theme.type.sm, lineHeight: 20, color: theme.colors.textSecondary },
});
