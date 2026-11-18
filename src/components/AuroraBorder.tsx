import { useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View, type LayoutChangeEvent, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '../theme';

/**
 * A thin ring in a slowly turning aurora (purple → blue → teal → pink): the
 * app's "made with AI" signature, used on the AI badge (AiNote). Small on
 * purpose: tried on whole cards (2026-11-18) and it made them look odd.
 *
 * A large gradient square rotates behind the child, clipped by the rounded
 * outer view; the child's own background covers all but a `ring`-wide edge.
 * Native-driver rotation, so no JS work per frame. With Reduce Motion on, the
 * same colours stand still (UI/UX Pro Max: reduced-motion; slow, subtle).
 */

// Brand purple, a blue, brand teal and a soft pink.
const AURORA = [theme.colors.accentPurple, '#4F7BFF', theme.colors.positiveTeal, '#C084FC', theme.colors.accentPurple] as const;

let reduceMotionCached: boolean | null = null;

interface AuroraBorderProps {
  radius: number;
  /** Ring width in pt. */
  ring?: number;
  /** One full turn, ms. */
  turnMs?: number;
  /** Background behind the child, inside the ring. */
  fill?: string;
  style?: ViewStyle;
}

export function AuroraBorder({
  children,
  radius,
  ring = 1.5,
  turnMs = 6000,
  fill = theme.colors.accentPurpleSoft,
  style,
}: PropsWithChildren<AuroraBorderProps>) {
  const spin = useRef(new Animated.Value(0)).current;
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(reduceMotionCached);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => {
        reduceMotionCached = v;
        setReduceMotion(v);
      })
      .catch(() => setReduceMotion(false));
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => {
      reduceMotionCached = v;
      setReduceMotion(v);
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (reduceMotion !== false) return;
    spin.setValue(0);
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: turnMs, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [reduceMotion, spin, turnMs]);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width !== size.w || height !== size.h) setSize({ w: width, h: height });
  };

  // A square big enough to cover the corners at every angle.
  const diag = Math.ceil(Math.sqrt(size.w * size.w + size.h * size.h));
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <View style={[{ borderRadius: radius, overflow: 'hidden', padding: ring, backgroundColor: theme.colors.accentPurple }, style]} onLayout={onLayout}>
      {diag > 0 && (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            width: diag,
            height: diag,
            left: (size.w - diag) / 2,
            top: (size.h - diag) / 2,
            transform: [{ rotate }],
          }}
        >
          <LinearGradient colors={AURORA} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        </Animated.View>
      )}
      <View style={{ borderRadius: Math.max(0, radius - ring), backgroundColor: fill }}>{children}</View>
    </View>
  );
}
