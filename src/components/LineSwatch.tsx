import Svg, { Line } from 'react-native-svg';

/**
 * Legend swatch for a line style. Drawn in SVG because React Native can't
 * draw a dashed or dotted border on only one side (iOS shows it solid), so
 * "dashed" and "dotted" legend keys looked like the solid line.
 */
export function LineSwatch({ color, dash, width = 2, length = 18 }: { color: string; dash?: string; width?: number; length?: number }) {
  return (
    <Svg width={length} height={8} style={{ marginRight: 6 }}>
      <Line x1={1} x2={length - 1} y1={4} y2={4} stroke={color} strokeWidth={width} strokeDasharray={dash} strokeLinecap="round" />
    </Svg>
  );
}
