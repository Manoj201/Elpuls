import type { ComponentType } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from '../theme';
import type { ChipVariant } from './Chip';

interface IconProps {
  size?: number;
  color?: string;
}

interface InfoRowProps {
  icon: ComponentType<IconProps>;
  title: string;
  subtitle?: string;
  variant?: ChipVariant;
}

const VARIANT_STYLES: Record<ChipVariant, { bg: string; icon: string }> = {
  neutral: { bg: theme.colors.background, icon: theme.colors.textSecondary },
  amber: { bg: theme.colors.accentAmberSoft, icon: theme.colors.accentAmberDeep },
  teal: { bg: theme.colors.positiveTealSoft, icon: theme.colors.positiveTealDeep },
  danger: { bg: theme.colors.dangerEmberSoft, icon: theme.colors.dangerEmberDeep },
};

export function InfoRow({ icon: Icon, title, subtitle, variant = 'neutral' }: InfoRowProps) {
  const colors = VARIANT_STYLES[variant];

  return (
    <View style={styles.row}>
      <View style={[styles.iconContainer, { backgroundColor: colors.bg }]}>
        <Icon size={18} color={colors.icon} />
      </View>
      <View style={styles.textContainer}>
        <Text style={styles.title}>{title}</Text>
        {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: theme.radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontFamily: theme.typography.bodyMedium,
    fontSize: 14,
    color: theme.colors.textPrimary,
  },
  subtitle: {
    fontFamily: theme.typography.body,
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginTop: 2,
    lineHeight: 18,
  },
});
