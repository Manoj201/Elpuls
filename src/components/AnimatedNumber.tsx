import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Text, type StyleProp, type TextStyle } from 'react-native';

interface AnimatedNumberProps {
  value: number;
  format: (value: number) => string;
  style?: StyleProp<TextStyle>;
  accessibilityLabel?: string;
}

/**
 * Counts from the previous value to the new one (~650 ms, decelerating), so a
 * change such as switching spot ↔ what you pay is visible. Skipped with
 * Reduce Motion. Screen readers get the final value via accessibilityLabel.
 */
export function AnimatedNumber({ value, format, style, accessibilityLabel }: AnimatedNumberProps) {
  const anim = useRef(new Animated.Value(value)).current;
  const [shown, setShown] = useState(value);

  useEffect(() => {
    const id = anim.addListener(({ value: v }) => setShown(v));
    return () => anim.removeListener(id);
  }, [anim]);

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reduce) => {
        if (cancelled) return;
        if (reduce) {
          anim.setValue(value);
          setShown(value);
          return;
        }
        Animated.timing(anim, { toValue: value, duration: 650, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
      });
    return () => {
      cancelled = true;
    };
  }, [value, anim]);

  return (
    <Text style={[style, { fontVariant: ['tabular-nums'] }]} accessibilityLabel={accessibilityLabel}>
      {format(shown)}
    </Text>
  );
}
