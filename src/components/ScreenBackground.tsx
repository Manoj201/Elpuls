import type { PropsWithChildren } from 'react';
import { Image, KeyboardAvoidingView, Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
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
 *
 * Also the single top-level wrapper App.tsx renders around every app state
 * (login, onboarding, main tabs) — so the KeyboardAvoidingView here fixes
 * the keyboard covering text inputs (TestFlight bug) across every screen
 * at once, rather than needing it duplicated per-screen. Wraps only
 * {children}, not the background Image, which stays absolutely positioned
 * regardless of keyboard state.
 */
export function ScreenBackground({ children, style }: PropsWithChildren<ScreenBackgroundProps>) {
  return (
    <View style={[styles.container, style]}>
      <Image source={require('../../assets/screen-glow-bg.png')} style={styles.art} resizeMode="cover" />
      <KeyboardAvoidingView style={styles.keyboardAvoiding} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        {children}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  art: { ...StyleSheet.absoluteFillObject, opacity: 0.5 },
  keyboardAvoiding: { flex: 1 },
});
