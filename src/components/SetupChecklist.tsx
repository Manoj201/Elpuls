import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { IconChevronRight, IconCircle, IconCircleCheck, IconX } from '@tabler/icons-react-native';
import { theme } from '../theme';
import { Card } from './Card';

export interface SetupStep {
  id: string;
  title: string;
  subtitle: string;
  done: boolean;
  onPress: () => void;
}

interface SetupChecklistProps {
  steps: SetupStep[];
  onDismiss: () => void;
}

/**
 * "Get your real price" card on Översikt. Lists the setup steps that unlock
 * the app's most useful numbers (grid fee, bill scan, appliances, alerts),
 * each one tap away, with a progress bar. The caller hides it once every
 * step is done or the user dismisses it.
 */
export function SetupChecklist({ steps, onDismiss }: SetupChecklistProps) {
  const { t } = useTranslation();
  const doneCount = steps.filter((s) => s.done).length;
  const progress = steps.length === 0 ? 0 : doneCount / steps.length;

  return (
    <Card style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.flex}>
          <Text style={styles.title} accessibilityRole="header">
            {t('setup.title')}
          </Text>
          <Text style={styles.subtitle}>{t('setup.subtitle')}</Text>
        </View>
        <Pressable
          onPress={onDismiss}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t('setup.dismiss')}
          style={styles.dismiss}
        >
          <IconX size={20} color={theme.colors.textMuted} />
        </Pressable>
      </View>

      <View style={styles.progressRow}>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>
        <Text style={styles.progressText}>{t('setup.progress', { done: doneCount, total: steps.length })}</Text>
      </View>

      {steps.map((step) => (
        <Pressable
          key={step.id}
          onPress={step.onPress}
          style={({ pressed }) => [styles.stepRow, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={`${step.title}. ${step.subtitle}`}
          accessibilityState={{ checked: step.done }}
        >
          {step.done ? (
            <IconCircleCheck size={24} color={theme.colors.positiveTeal} />
          ) : (
            <IconCircle size={24} color={theme.colors.textMuted} />
          )}
          <View style={styles.flex}>
            <Text style={[styles.stepTitle, step.done && styles.stepTitleDone]}>{step.title}</Text>
            <Text style={styles.stepSubtitle}>{step.subtitle}</Text>
          </View>
          <IconChevronRight size={20} color={theme.colors.textMuted} />
        </Pressable>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 4 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  flex: { flex: 1 },
  title: { fontFamily: theme.typography.display, fontSize: theme.type.lg, color: theme.colors.textPrimary },
  subtitle: { fontFamily: theme.typography.body, fontSize: theme.type.sm, lineHeight: 20, color: theme.colors.textSecondary, marginTop: 4 },
  dismiss: { padding: 4 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12, marginBottom: 6 },
  progressTrack: { flex: 1, height: 6, borderRadius: theme.radius.pill, backgroundColor: theme.colors.borderMuted },
  progressFill: { height: 6, borderRadius: theme.radius.pill, backgroundColor: theme.colors.positiveTeal },
  progressText: { fontFamily: theme.typography.bodyMedium, fontSize: theme.type.sm, color: theme.colors.textSecondary },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingVertical: 8 },
  pressed: { opacity: 0.6 },
  stepTitle: { fontFamily: theme.typography.bodyMedium, fontSize: theme.type.md, color: theme.colors.textPrimary },
  stepTitleDone: { color: theme.colors.textSecondary },
  stepSubtitle: { fontFamily: theme.typography.body, fontSize: theme.type.sm, lineHeight: 20, color: theme.colors.textSecondary, marginTop: 2 },
});
