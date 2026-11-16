import { IconArrowDownRight, IconArrowUpRight, IconMinus } from '@tabler/icons-react-native';
import { theme } from '../theme';

export type Direction = 'cheaper' | 'same' | 'dearer';

/** Same ±10 % rule as the server (priceOutlook.ts), but against today's real average, so "jämfört med idag" is always true. */
export function directionOf(mid: number, todayAvg: number): Direction {
  if (todayAvg <= 0.05) return Math.abs(mid - todayAvg) < 0.05 ? 'same' : mid < todayAvg ? 'cheaper' : 'dearer';
  if (mid < todayAvg * 0.9) return 'cheaper';
  if (mid > todayAvg * 1.1) return 'dearer';
  return 'same';
}

/**
 * Diverging scale shared with the 48 h price chart (priceBands.ts):
 * teal = cheaper, grey = about the same, amber = dearer. Always shown with an
 * arrow icon and a word too, never colour alone.
 */
export const DIRECTION_STYLE: Record<Direction, { Icon: typeof IconMinus; color: string; soft: string }> = {
  cheaper: { Icon: IconArrowDownRight, color: theme.colors.positiveTeal, soft: theme.colors.positiveTealSoft },
  same: { Icon: IconMinus, color: theme.colors.textMuted, soft: theme.colors.surfaceElevated },
  dearer: { Icon: IconArrowUpRight, color: theme.colors.accentAmber, soft: theme.colors.accentAmberSoft },
};
