import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { LinearGradient } from 'expo-linear-gradient';
import { IconSun } from '@tabler/icons-react-native';
import Svg, { Circle, Defs, Line, LinearGradient as SvgGradient, Path, Rect, Stop } from 'react-native-svg';
import { theme } from '../theme';
import { formatOre } from '../lib/formatNumber';
import type { SupportedLanguage } from '../i18n';
import type { SolarBonusHour } from '../lib/solarBonusHours';
import { Card } from './Card';
import { InfoRow } from './InfoRow';

interface SolarBonusCardProps {
  bonusHours: SolarBonusHour[];
  language: SupportedLanguage;
}

const SCENE_SIZE = 110;
const SUN_RADIUS = 24;
const RAY_COUNT = 8;
const CENTER = SCENE_SIZE / 2;

/**
 * The scene's mood (sleeping vs. rising sun) is the whole point of this
 * card, so it's a dedicated component rather than inline JSX in
 * HomeScreen — keeps the animation wiring out of an already-long screen.
 */
export function SolarBonusCard({ bonusHours, language }: SolarBonusCardProps) {
  const { t } = useTranslation();
  const hasBonus = bonusHours.length > 0;

  const rotation = useRef(new Animated.Value(0)).current;
  const rayPulse = useRef(new Animated.Value(0)).current;
  const rise = useRef(new Animated.Value(hasBonus ? 1 : 0)).current;
  const bob = useRef(new Animated.Value(0)).current;
  const zzz = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(rise, {
      toValue: hasBonus ? 1 : 0,
      duration: 900,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [hasBonus, rise]);

  useEffect(() => {
    if (!hasBonus) {
      rotation.setValue(0);
      rayPulse.setValue(0);
      return;
    }
    const rotateLoop = Animated.loop(
      Animated.timing(rotation, { toValue: 1, duration: 9000, easing: Easing.linear, useNativeDriver: true }),
    );
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(rayPulse, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(rayPulse, { toValue: 0, duration: 1100, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    rotateLoop.start();
    pulseLoop.start();
    return () => {
      rotateLoop.stop();
      pulseLoop.stop();
    };
  }, [hasBonus, rotation, rayPulse]);

  useEffect(() => {
    if (hasBonus) {
      bob.setValue(0);
      zzz.setValue(0);
      return;
    }
    const bobLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(bob, { toValue: 0, duration: 1800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    const zzzLoop = Animated.loop(
      Animated.timing(zzz, { toValue: 1, duration: 2600, easing: Easing.linear, useNativeDriver: true }),
    );
    bobLoop.start();
    zzzLoop.start();
    return () => {
      bobLoop.stop();
      zzzLoop.stop();
    };
  }, [hasBonus, bob, zzz]);

  const rayRotation = rotation.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const rayPulseScale = rayPulse.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.15] });
  const riseTranslateY = rise.interpolate({ inputRange: [0, 1], outputRange: [34, 0] });
  const bobTranslateY = bob.interpolate({ inputRange: [0, 1], outputRange: [0, -5] });
  const zzzTranslateY = zzz.interpolate({ inputRange: [0, 1], outputRange: [6, -20] });
  const zzzOpacity = zzz.interpolate({ inputRange: [0, 0.15, 0.8, 1], outputRange: [0, 1, 1, 0] });

  return (
    <Card style={styles.card}>
      <View style={styles.scene}>
        <LinearGradient
          colors={hasBonus ? [theme.colors.accentAmberSoft, theme.colors.surface] : [theme.colors.background, theme.colors.surface]}
          style={StyleSheet.absoluteFillObject}
        />

        {!hasBonus && (
          <>
            <View style={[styles.star, { top: 14, left: 18, opacity: 0.8 }]} />
            <View style={[styles.star, { top: 30, left: 80, opacity: 0.5 }]} />
            <View style={[styles.star, { top: 10, left: 64, opacity: 0.65 }]} />
          </>
        )}

        <View style={styles.sunAnchor}>
          <Animated.View style={{ transform: [{ translateY: hasBonus ? riseTranslateY : bobTranslateY }] }}>
            <View style={{ width: SCENE_SIZE, height: SCENE_SIZE }}>
              {/* rays: their own layer so they can spin/pulse without the face moving */}
              <Animated.View
                style={[
                  StyleSheet.absoluteFillObject,
                  hasBonus ? { transform: [{ rotate: rayRotation }, { scale: rayPulseScale }] } : undefined,
                ]}
              >
                <Svg width={SCENE_SIZE} height={SCENE_SIZE} viewBox={`0 0 ${SCENE_SIZE} ${SCENE_SIZE}`}>
                  {Array.from({ length: RAY_COUNT }).map((_, i) => {
                    const angle = (360 / RAY_COUNT) * i;
                    const rayWidth = hasBonus ? 5 : 4;
                    const rayLength = hasBonus ? 12 : 6;
                    const gap = hasBonus ? 6 : 5;
                    return (
                      <Rect
                        key={i}
                        x={CENTER - rayWidth / 2}
                        y={CENTER - SUN_RADIUS - gap - rayLength}
                        width={rayWidth}
                        height={rayLength}
                        rx={2}
                        fill={hasBonus ? theme.colors.accentAmber : theme.colors.textFaint}
                        opacity={hasBonus ? 1 : 0.55}
                        rotation={angle}
                        origin={`${CENTER}, ${CENTER}`}
                      />
                    );
                  })}
                </Svg>
              </Animated.View>

              {/* sun body + face: stays put, never spins or scales */}
              <View style={StyleSheet.absoluteFillObject}>
                <Svg width={SCENE_SIZE} height={SCENE_SIZE} viewBox={`0 0 ${SCENE_SIZE} ${SCENE_SIZE}`}>
                  <Defs>
                    <SvgGradient id="sunFill" x1="0" y1="0" x2="0" y2="1">
                      <Stop offset="0" stopColor={hasBonus ? theme.colors.accentAmber : theme.colors.textFaint} />
                      <Stop offset="1" stopColor={hasBonus ? theme.colors.accentAmberDeep : theme.colors.textMuted} />
                    </SvgGradient>
                  </Defs>

                  <Circle cx={CENTER} cy={CENTER} r={SUN_RADIUS} fill="url(#sunFill)" />

                  {!hasBonus ? (
                    <>
                      {/* closed, sleepy eyes */}
                      <Line
                        x1={CENTER - 11}
                        y1={CENTER - 2}
                        x2={CENTER - 3}
                        y2={CENTER - 2}
                        stroke={theme.colors.background}
                        strokeWidth={2.5}
                        strokeLinecap="round"
                      />
                      <Line
                        x1={CENTER + 3}
                        y1={CENTER - 2}
                        x2={CENTER + 11}
                        y2={CENTER - 2}
                        stroke={theme.colors.background}
                        strokeWidth={2.5}
                        strokeLinecap="round"
                      />
                      {/* small "o" snore mouth */}
                      <Circle cx={CENTER} cy={CENTER + 8} r={2.4} fill={theme.colors.background} />
                    </>
                  ) : (
                    <>
                      {/* open, happy eyes */}
                      <Circle cx={CENTER - 7} cy={CENTER - 3} r={2.2} fill={theme.colors.background} />
                      <Circle cx={CENTER + 7} cy={CENTER - 3} r={2.2} fill={theme.colors.background} />
                      {/* smiling mouth */}
                      <Path
                        d={`M ${CENTER - 9} ${CENTER + 4} Q ${CENTER} ${CENTER + 13} ${CENTER + 9} ${CENTER + 4}`}
                        stroke={theme.colors.background}
                        strokeWidth={2.5}
                        strokeLinecap="round"
                        fill="none"
                      />
                    </>
                  )}
                </Svg>
              </View>
            </View>
          </Animated.View>

          {!hasBonus && (
            <Animated.Text
              style={[styles.zzz, { opacity: zzzOpacity, transform: [{ translateY: zzzTranslateY }] }]}
            >
              z z z
            </Animated.Text>
          )}
        </View>

        <View style={styles.horizon} />
      </View>

      <Text style={styles.caption}>
        {hasBonus
          ? t('home.solarBonusActiveCaption', { count: bonusHours.length })
          : t('home.solarBonusSleepingCaption')}
      </Text>

      {hasBonus && (
        <View style={styles.hoursList}>
          {bonusHours.map((b, i) => (
            <View key={b.hour.toISOString()} style={i > 0 && styles.bonusRowDivider}>
              <InfoRow
                icon={IconSun}
                variant="amber"
                title={`${b.hour.getHours()}:00`}
                subtitle={`${formatOre(b.price, language)} öre/kWh`}
              />
            </View>
          ))}
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { overflow: 'hidden' },
  scene: {
    height: 120,
    borderRadius: theme.radius.md,
    overflow: 'hidden',
    marginBottom: 12,
  },
  horizon: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 34,
    height: 1,
    backgroundColor: theme.colors.borderMuted,
  },
  sunAnchor: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zzz: {
    position: 'absolute',
    top: 4,
    right: '26%',
    fontFamily: theme.typography.bodyMedium,
    fontSize: 13,
    letterSpacing: 2,
    color: theme.colors.textMuted,
  },
  star: {
    position: 'absolute',
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: theme.colors.textSecondary,
  },
  caption: {
    fontFamily: theme.typography.body,
    fontSize: 13,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: 4,
  },
  hoursList: { marginTop: 8 },
  bonusRowDivider: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderMuted,
    marginTop: 10,
    paddingTop: 10,
  },
});
