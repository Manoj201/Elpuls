import type { PropsWithChildren } from 'react';
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { theme } from '../theme';

interface ScreenBackgroundProps {
  style?: StyleProp<ViewStyle>;
}

/**
 * The boot splash's own top/bottom wave-glow art (with the center logo
 * mark cropped out — see the generation note in assets/screen-glow-bg.png's
 * source, src/components/ScreenBackground.tsx history) stretched behind
 * every screen's content, at reduced opacity so it reads as a backdrop
 * rather than competing with foreground text/cards.
 */
export function ScreenBackground({ children, style }: PropsWithChildren<ScreenBackgroundProps>) {
  return (
    <View style={[styles.container, style]}>
      <Image source={require('../../assets/screen-glow-bg.png')} style={styles.art} resizeMode="cover" />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  art: { ...StyleSheet.absoluteFillObject, opacity: 0.5 },
});
