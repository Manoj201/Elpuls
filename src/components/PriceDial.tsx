import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';
import { theme } from '../theme';

interface PriceDialProps {
  value: number;
  min: number;
  max: number;
  size?: number;
  /** Scale ends, e.g. "Lägst idag 101" / "Högst idag 312", shown under the arc's ends. */
  minLabel?: string;
  maxLabel?: string;
}

const STROKE_WIDTH = 12;

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const angleRad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(angleRad), y: cy - r * Math.sin(angleRad) };
}

function arcPath(cx: number, cy: number, r: number, fromAngle: number, toAngle: number): string {
  const start = polarToCartesian(cx, cy, r, fromAngle);
  const end = polarToCartesian(cx, cy, r, toAngle);
  return `M ${start.x} ${start.y} A ${r} ${r} 0 0 1 ${end.x} ${end.y}`;
}

/**
 * Semi-circular gauge: today's cheapest at the left, dearest at the right.
 * The whole scale is shown faintly (teal → amber → red) so the range is
 * always visible; the part up to the current price is solid. A white
 * needle points at the price. Static on purpose: the sweep animation
 * felt laggy on real phones.
 */
export function PriceDial({ value, min, max, size = 220, minLabel, maxLabel }: PriceDialProps) {
  const radius = size / 2 - STROKE_WIDTH;
  const cx = size / 2;
  const cy = size / 2;
  const height = size / 2 + STROKE_WIDTH;
  const arcLength = Math.PI * radius;

  const ratio = max > min ? Math.min(1, Math.max(0, (value - min) / (max - min))) : 0;
  const needleAngle = 180 - ratio * 180;
  const needleTip = polarToCartesian(cx, cy, radius - STROKE_WIDTH - 2, needleAngle);

  return (
    <View style={{ width: size }} accessible={false} importantForAccessibility="no-hide-descendants">
      <Svg width={size} height={height}>
        <Defs>
          <LinearGradient id="dialGradient" x1={0} y1={0} x2={size} y2={0} gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={theme.colors.positiveTeal} />
            <Stop offset="0.55" stopColor={theme.colors.accentAmber} />
            <Stop offset="1" stopColor={theme.colors.dangerEmber} />
          </LinearGradient>
        </Defs>

        {/* Full scale, faint: shows the whole range at a glance */}
        <Path
          d={arcPath(cx, cy, radius, 180, 0)}
          stroke="url(#dialGradient)"
          strokeOpacity={0.22}
          strokeWidth={STROKE_WIDTH}
          strokeLinecap="round"
          fill="none"
        />
        {/* Solid up to the current price */}
        <Path
          d={arcPath(cx, cy, radius, 180, 0)}
          stroke="url(#dialGradient)"
          strokeWidth={STROKE_WIDTH}
          strokeLinecap="round"
          strokeDasharray={`${arcLength} ${arcLength}`}
          strokeDashoffset={arcLength * (1 - ratio)}
          fill="none"
        />

        <Line
          x1={cx}
          y1={cy}
          x2={needleTip.x}
          y2={needleTip.y}
          stroke={theme.colors.textPrimary}
          strokeWidth={4}
          strokeLinecap="round"
        />
        <Circle cx={cx} cy={cy} r={9} fill={theme.colors.surfaceElevated} stroke={theme.colors.textPrimary} strokeWidth={3} />
      </Svg>
      {/* Scale ends in words, so the gauge reads as "where today's range is" (UI/UX Pro Max: label the axis). */}
      {minLabel && maxLabel ? (
        <View style={styles.ends}>
          <Text style={styles.endText}>{minLabel}</Text>
          <Text style={[styles.endText, styles.endRight]}>{maxLabel}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  ends: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  endText: {
    fontFamily: theme.typography.body,
    fontSize: theme.type.xs,
    lineHeight: 16,
    color: theme.colors.textSecondary,
    fontVariant: ['tabular-nums'],
    maxWidth: '40%',
  },
  endRight: { textAlign: 'right' },
});
