import type { PropsWithChildren } from 'react';
import { Image, KeyboardAvoidingView, Platform, SafeAreaView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { isDevProject } from '../lib/firebase';
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
      {/* Status-bar scrim: scrolled content fades out under the clock and
          battery instead of running behind them. The built-in SafeAreaView,
          pinned to the top with almost no content, is exactly as tall as the
          status bar (+ a few pt for the fade), so no native module is needed. */}
      <SafeAreaView pointerEvents="none" style={styles.scrim} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <LinearGradient
          // Mostly opaque (text behind it can't be read), softly fading, so the
          // top glow art continues without a hard edge.
          colors={[`${theme.colors.background}F2`, `${theme.colors.background}D9`, `${theme.colors.background}00`]}
          locations={[0, 0.6, 1]}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.scrimFade} />
      </SafeAreaView>
      {/* Connected to the dev Firebase project (elpuls-dev): never shown in TestFlight / App Store builds. */}
      {isDevProject && (
        <View pointerEvents="none" style={styles.devBadge} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Text style={styles.devText}>DEV</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  art: { ...StyleSheet.absoluteFillObject, opacity: 0.5 },
  keyboardAvoiding: { flex: 1 },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0 },
  scrimFade: { height: 18 },
  // Bottom right, just above the tab bar: never over a title or the status bar.
  devBadge: {
    position: 'absolute',
    bottom: 100,
    right: 10,
    opacity: 0.9,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: theme.colors.dangerEmber,
  },
  devText: { fontFamily: theme.typography.bodySemibold, fontSize: theme.type.xs, color: '#FFFFFF', letterSpacing: 1 },
});
