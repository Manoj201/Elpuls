import { View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';
import { theme } from '../theme';

interface PriceDialProps {
  value: number;
  min: number;
  max: number;
  size?: number;
}

const STROKE_WIDTH = 10;

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const angleRad = (angleDeg * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(angleRad),
    y: cy - r * Math.sin(angleRad),
  };
}

function arcPath(cx: number, cy: number, r: number, fromAngle: number, toAngle: number): string {
  const start = polarToCartesian(cx, cy, r, fromAngle);
  const end = polarToCartesian(cx, cy, r, toAngle);
  return `M ${start.x} ${start.y} A ${r} ${r} 0 0 1 ${end.x} ${end.y}`;
}

/**
 * Semi-circular gauge: min sits at the left (180°), max at the right (0°),
 * sweeping clockwise through the top (90°) — the classic volt-meter shape.
 * The teal-to-amber-to-danger gradient fills up to the current value's
 * position; the remainder of the track stays neutral. The signature Elpuls
 * visual element; reused wherever "where does this number sit in range"
 * matters, not just the dashboard hero.
 */
export function PriceDial({ value, min, max, size = 220 }: PriceDialProps) {
  const radius = size / 2 - STROKE_WIDTH;
  const cx = size / 2;
  const cy = size / 2;
  const height = size / 2 + STROKE_WIDTH;

  const ratio = max > min ? Math.min(1, Math.max(0, (value - min) / (max - min))) : 0;
  const needleAngle = 180 - ratio * 180;
  const needleTip = polarToCartesian(cx, cy, radius - STROKE_WIDTH, needleAngle);

  return (
    <View style={{ width: size, height }}>
      <Svg width={size} height={height}>
        <Defs>
          <LinearGradient id="dialGradient" x1={0} y1={0} x2={size} y2={0} gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={theme.colors.positiveTeal} />
            <Stop offset="0.55" stopColor={theme.colors.accentAmber} />
            <Stop offset="1" stopColor={theme.colors.dangerEmber} />
          </LinearGradient>
        </Defs>

        <Path
          d={arcPath(cx, cy, radius, 180, 0)}
          stroke={theme.colors.neutralBar}
          strokeWidth={STROKE_WIDTH}
          strokeLinecap="round"
          fill="none"
        />
        {ratio > 0 && (
          <Path
            d={arcPath(cx, cy, radius, 180, needleAngle)}
            stroke="url(#dialGradient)"
            strokeWidth={STROKE_WIDTH}
            strokeLinecap="round"
            fill="none"
          />
        )}

        <Line
          x1={cx}
          y1={cy}
          x2={needleTip.x}
          y2={needleTip.y}
          stroke={theme.colors.inkButton}
          strokeWidth={4}
          strokeLinecap="round"
        />
        <Circle cx={cx} cy={cy} r={7} fill={theme.colors.inkButton} />
      </Svg>
    </View>
  );
}
