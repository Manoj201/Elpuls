import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Svg, { Circle, Defs, Line, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { IconSun, IconSunrise, IconSunset } from '@tabler/icons-react-native';
import { theme } from '../theme';
import { formatClock, formatOre } from '../lib/formatNumber';
import type { SupportedLanguage } from '../i18n';
import type { SolarBonusHour } from '../lib/solarBonusHours';
import type { HourlySolarPotential } from '../lib/solarPotential';
import { Card } from './Card';

interface SolarBonusCardProps {
  bonusHours: SolarBonusHour[];
  /** Solar potential per forecast hour (any days; today's are picked out). */
  solarPotential: HourlySolarPotential[];
  sunrise: Date | null;
  sunset: Date | null;
  now: Date;
  language: SupportedLanguage;
}

interface SolarWindow {
  start: Date;
  end: Date;
  averagePrice: number;
  strongSun: boolean;
}

// Same threshold as findSolarBonusHours: below this the day's best hours
// aren't meaningfully sunny.
const MIN_MEANINGFUL_DAY_MAX_POTENTIAL = 15;

// Sun-path drawing, in viewBox units (scaled to the card width).
const VB_W = 320;
const VB_H = 118;
const PAD_X = 22;
const BASE_Y = 104;
const ARC_H = 84;
const SAMPLES = 24;

function arcPoint(t: number) {
  return { x: PAD_X + t * (VB_W - 2 * PAD_X), y: BASE_Y - ARC_H * Math.sin(Math.PI * t) };
}

function arcSegment(t0: number, t1: number): string {
  const steps = Math.max(2, Math.ceil((t1 - t0) * SAMPLES * 2));
  let d = '';
  for (let i = 0; i <= steps; i++) {
    const { x, y } = arcPoint(t0 + ((t1 - t0) * i) / steps);
    d += `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)} `;
  }
  return d;
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPath = Animated.createAnimatedComponent(Path);

/** Closed shape under an arc section, down to the horizon: the "light on the ground" fill. */
function areaUnder(t0: number, t1: number): string {
  const a = arcPoint(t0);
  const b = arcPoint(t1);
  return `${arcSegment(t0, t1)} L ${b.x.toFixed(1)} ${BASE_Y} L ${a.x.toFixed(1)} ${BASE_Y} Z`;
}

/** Approximate length of the whole arc, for the draw-in animation. */
const ARC_LENGTH = (() => {
  let len = 0;
  let prev = arcPoint(0);
  for (let i = 1; i <= 200; i++) {
    const p = arcPoint(i / 200);
    len += Math.hypot(p.x - prev.x, p.y - prev.y);
    prev = p;
  }
  return len;
})();

function AnimatedRow({ index, play, children }: { index: number; play: boolean; children: React.ReactNode }) {
  const v = useRef(new Animated.Value(play ? 0 : 1)).current;
  useEffect(() => {
    if (!play) {
      v.setValue(1);
      return;
    }
    Animated.timing(v, {
      toValue: 1,
      duration: 320,
      delay: 1500 + index * 90,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [play, index, v]);
  const translateY = v.interpolate({ inputRange: [0, 1], outputRange: [10, 0] });
  return <Animated.View style={{ opacity: v, transform: [{ translateY }] }}>{children}</Animated.View>;
}

/** Consecutive bonus hours merged into windows ("11:00–15:00"). */
function toWindows(hours: SolarBonusHour[], dayMaxPotential: number): SolarWindow[] {
  const windows: (SolarWindow & { prices: number[]; maxPct: number })[] = [];
  for (const h of hours) {
    const last = windows[windows.length - 1];
    const end = new Date(h.hour.getTime() + 3600000);
    if (last && last.end.getTime() === h.hour.getTime()) {
      last.end = end;
      last.prices.push(h.price);
      last.maxPct = Math.max(last.maxPct, h.solarPotentialPct);
    } else {
      windows.push({ start: h.hour, end, averagePrice: 0, strongSun: false, prices: [h.price], maxPct: h.solarPotentialPct });
    }
  }
  return windows.map(({ prices, maxPct, ...w }) => ({
    ...w,
    averagePrice: prices.reduce((s, p) => s + p, 0) / prices.length,
    strongSun: maxPct >= 0.8 * dayMaxPotential,
  }));
}

/**
 * Today's sun path, sunrise to sunset, with the "solar bonus" windows
 * (sunny and cheap) highlighted on the arc and listed below with what to do.
 *
 * Motion (UI/UX Pro Max: one meaningful animation, no endless decorative
 * loops, honour Reduce Motion): the sun travels once along the arc to where
 * it is right now, so the card answers "is it now, earlier or later?" at a
 * glance.
 */
export function SolarBonusCard({ bonusHours, solarPotential, sunrise, sunset, now, language }: SolarBonusCardProps) {
  const { t } = useTranslation();

  const todayPotential = useMemo(
    () => solarPotential.filter((s) => s.hour.toDateString() === now.toDateString()),
    [solarPotential, now],
  );
  const dayMaxPotential = todayPotential.reduce((m, s) => Math.max(m, s.potentialPct), 0);
  const windows = useMemo(() => toWindows(bonusHours, dayMaxPotential), [bonusHours, dayMaxPotential]);

  // Position along the day (0 = sunrise, 1 = sunset).
  const span = sunrise && sunset ? sunset.getTime() - sunrise.getTime() : 0;
  const tOf = (d: Date) => (span > 0 && sunrise ? Math.min(1, Math.max(0, (d.getTime() - sunrise.getTime()) / span)) : 0);
  const sunUp = sunrise !== null && sunset !== null && now >= sunrise && now <= sunset;
  const sunT = tOf(now);

  // Entrance, in order (UI/UX Pro Max `stagger-sequence`, `motion-meaning`):
  // the path draws in, the sun travels to "now", the good window lights up,
  // then the rows slide in. Runs once; Reduce Motion shows the end state.
  const draw = useRef(new Animated.Value(0)).current;
  const progress = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then(setReduceMotion);
  }, []);

  useEffect(() => {
    if (reduceMotion === null) return;
    if (reduceMotion) {
      draw.setValue(1);
      progress.setValue(sunT);
      glow.setValue(1);
      return;
    }
    draw.setValue(0);
    progress.setValue(0);
    glow.setValue(0);
    const seq = Animated.sequence([
      Animated.timing(draw, { toValue: 1, duration: 650, easing: Easing.inOut(Easing.cubic), useNativeDriver: false }),
      Animated.timing(progress, { toValue: sunT, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
      Animated.timing(glow, { toValue: 1, duration: 450, easing: Easing.out(Easing.quad), useNativeDriver: false }),
    ]);
    seq.start();
    return () => seq.stop();
    // Re-run only when the sun's position meaningfully changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduceMotion, Math.round(sunT * 200)]);

  const inputRange = Array.from({ length: SAMPLES + 1 }, (_, i) => i / SAMPLES);
  const cx = progress.interpolate({ inputRange, outputRange: inputRange.map((v) => arcPoint(v).x) });
  const cy = progress.interpolate({ inputRange, outputRange: inputRange.map((v) => arcPoint(v).y) });

  const current = windows.find((w) => now >= w.start && now < w.end) ?? null;
  const next = windows.find((w) => w.start > now) ?? null;

  // Live status only: while a good window is running now, the sun's halo
  // and the "Pågår nu" dot breathe slowly. Nothing loops otherwise.
  const isLive = current !== null && sunUp;
  useEffect(() => {
    if (!isLive || reduceMotion !== false) {
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
        Animated.timing(pulse, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [isLive, reduceMotion, pulse]);
  const haloR = pulse.interpolate({ inputRange: [0, 1], outputRange: [20, 27] });
  const haloOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0.25] });
  const dotScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.6] });
  const dotOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.9, 0.35] });
  const tooLittleSun = dayMaxPotential < MIN_MEANINGFUL_DAY_MAX_POTENTIAL;

  const headline = current
    ? t('solar.nowUntil', { end: formatClock(current.end) })
    : next
      ? t('solar.next', { start: formatClock(next.start), end: formatClock(next.end) })
      : windows.length > 0
        ? t('solar.allPast')
        : tooLittleSun
          ? t('solar.tooLittleSun')
          : t('solar.noBonus');
  const detail =
    current || next ? t('solar.advice') : windows.length === 0 && !tooLittleSun ? t('solar.noBonusDetail') : null;

  const sunColor = sunUp ? theme.colors.accentAmber : theme.colors.textMuted;
  const sceneLabel = [
    sunrise && sunset ? t('solar.sceneA11y', { rise: formatClock(sunrise), set: formatClock(sunset) }) : '',
    windows.map((w) => `${formatClock(w.start)}–${formatClock(w.end)}`).join(', '),
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <Card>
      <Text style={styles.headline} accessibilityRole="header">
        {headline}
      </Text>
      {detail && <Text style={styles.detail}>{detail}</Text>}

      {sunrise && sunset && (
        <View style={styles.scene} accessible accessibilityLabel={sceneLabel}>
          <Svg width="100%" height={VB_H} viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="xMidYMid meet">
            <Defs>
              {/* Sky: purple dusk tones at the top, warm light near the horizon in daytime */}
              <LinearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={theme.colors.accentPurple} stopOpacity={sunUp ? 0.16 : 0.22} />
                <Stop offset="1" stopColor={sunUp ? theme.colors.accentAmber : theme.colors.accentPurple} stopOpacity={sunUp ? 0.12 : 0.04} />
              </LinearGradient>
              {/* Sun path: dawn purple → midday amber → dusk purple */}
              <LinearGradient id="path" x1="0" y1="0" x2={VB_W} y2="0" gradientUnits="userSpaceOnUse">
                <Stop offset="0" stopColor={theme.colors.accentPurple} />
                <Stop offset="0.5" stopColor={theme.colors.accentAmber} />
                <Stop offset="1" stopColor={theme.colors.accentPurple} />
              </LinearGradient>
              {/* Light falling on the ground under a good window */}
              <LinearGradient id="light" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={theme.colors.accentAmber} stopOpacity={0.45} />
                <Stop offset="1" stopColor={theme.colors.accentAmber} stopOpacity={0} />
              </LinearGradient>
              <RadialGradient id="sunDisc" cx="50%" cy="50%" r="50%">
                <Stop offset="0" stopColor={theme.colors.textPrimary} />
                <Stop offset="0.45" stopColor={sunUp ? theme.colors.accentAmberDeep : theme.colors.textSecondary} />
                <Stop offset="1" stopColor={sunUp ? theme.colors.accentAmber : theme.colors.textMuted} />
              </RadialGradient>
              <RadialGradient id="halo" cx="50%" cy="50%" r="50%">
                <Stop offset="0" stopColor={sunUp ? theme.colors.accentAmber : theme.colors.textMuted} stopOpacity={0.9} />
                <Stop offset="1" stopColor={sunUp ? theme.colors.accentAmber : theme.colors.textMuted} stopOpacity={0} />
              </RadialGradient>
            </Defs>

            <Rect x={0} y={0} width={VB_W} height={BASE_Y} rx={12} fill="url(#sky)" />

            {/* Good windows: light on the ground + a thick glowing section of the path */}
            {windows.map((w) => {
              const past = w.end <= now;
              const opacity = glow.interpolate({ inputRange: [0, 1], outputRange: [0, past ? 0.35 : 1] });
              return (
                <AnimatedPath key={`a${w.start.toISOString()}`} d={areaUnder(tOf(w.start), tOf(w.end))} fill="url(#light)" opacity={opacity} />
              );
            })}

            <Line x1={0} x2={VB_W} y1={BASE_Y} y2={BASE_Y} stroke={theme.colors.border} strokeWidth={1} />

            {/* The whole day's path, drawn in */}
            <AnimatedPath
              d={arcSegment(0, 1)}
              stroke="url(#path)"
              strokeWidth={2.5}
              strokeLinecap="round"
              fill="none"
              strokeDasharray={`${ARC_LENGTH} ${ARC_LENGTH}`}
              strokeDashoffset={draw.interpolate({ inputRange: [0, 1], outputRange: [ARC_LENGTH, 0] })}
            />

            {windows.map((w) => {
              const past = w.end <= now;
              const opacity = glow.interpolate({ inputRange: [0, 1], outputRange: [0, past ? 0.4 : 1] });
              const d = arcSegment(tOf(w.start), tOf(w.end));
              return (
                <AnimatedPath key={w.start.toISOString()} d={d} stroke={theme.colors.accentAmber} strokeWidth={8} strokeLinecap="round" fill="none" opacity={opacity} />
              );
            })}

            {/* The sun: halo (breathes only while a window is live) + glowing disc */}
            <AnimatedCircle cx={cx} cy={cy} r={isLive ? haloR : 20} fill="url(#halo)" opacity={isLive ? haloOpacity : sunUp ? 0.45 : 0.2} />
            <AnimatedCircle cx={cx} cy={cy} r={10} fill="url(#sunDisc)" stroke={theme.colors.surface} strokeWidth={1.5} />
          </Svg>
          <View style={styles.sunTimes}>
            <View style={styles.sunTime}>
              <IconSunrise size={16} color={theme.colors.textSecondary} />
              <Text style={styles.sunTimeText}>{formatClock(sunrise)}</Text>
            </View>
            <View style={styles.sunTime}>
              <Text style={styles.sunTimeText}>{formatClock(sunset)}</Text>
              <IconSunset size={16} color={theme.colors.textSecondary} />
            </View>
          </View>
        </View>
      )}

      {windows.length > 0 && (
        <View style={styles.list}>
          {windows.map((w, i) => {
            const isNow = w === current;
            const isPast = w.end <= now;
            const hoursAway = Math.round((w.start.getTime() - now.getTime()) / 3600000);
            const status = isNow
              ? t('solar.statusNow')
              : isPast
                ? t('solar.statusPast')
                : hoursAway <= 0
                  ? t('solar.statusSoon')
                  : t('solar.statusIn', { count: hoursAway });
            return (
              <AnimatedRow key={w.start.toISOString()} index={i} play={reduceMotion === false}>
              <View style={[styles.row, i > 0 && styles.rowDivider, isPast && styles.rowPast]}>
                <View style={[styles.rowIcon, isNow && styles.rowIconLive]}>
                  <IconSun size={20} color={theme.colors.accentAmberDeep} />
                </View>
                <View style={styles.rowText}>
                  <Text style={styles.rowTime}>
                    {formatClock(w.start)}–{formatClock(w.end)}
                  </Text>
                  <Text style={styles.rowMeta}>
                    {t(w.strongSun ? 'solar.strongSun' : 'solar.goodSun')} · {t('solar.avgPrice', { price: formatOre(w.averagePrice, language) })}
                  </Text>
                </View>
                <View style={[styles.status, isNow && styles.statusActive]}>
                  {isNow && (
                    <View style={styles.liveDotWrap}>
                      <Animated.View style={[styles.liveDotRing, { opacity: dotOpacity, transform: [{ scale: dotScale }] }]} />
                      <View style={styles.liveDot} />
                    </View>
                  )}
                  <Text style={[styles.statusText, isNow && styles.statusTextActive]}>{status}</Text>
                </View>
              </View>
              </AnimatedRow>
            );
          })}
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  headline: { fontFamily: theme.typography.displayMedium, fontSize: theme.type.lg, color: theme.colors.textPrimary },
  detail: { fontFamily: theme.typography.body, fontSize: theme.type.sm, lineHeight: 20, color: theme.colors.textSecondary, marginTop: 4 },
  scene: { marginTop: 12 },
  sunTimes: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  sunTime: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sunTimeText: { fontFamily: theme.typography.body, fontSize: theme.type.xs, color: theme.colors.textSecondary, fontVariant: ['tabular-nums'] },
  list: { marginTop: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  rowDivider: { borderTopWidth: 1, borderTopColor: theme.colors.borderMuted },
  rowPast: { opacity: 0.55 },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.accentAmberSoft,
  },
  rowText: { flex: 1, gap: 2 },
  rowTime: { fontFamily: theme.typography.bodyMedium, fontSize: theme.type.md, color: theme.colors.textPrimary, fontVariant: ['tabular-nums'] },
  rowMeta: { fontFamily: theme.typography.body, fontSize: theme.type.sm, color: theme.colors.textSecondary },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  statusActive: { borderColor: theme.colors.accentAmber, backgroundColor: theme.colors.accentAmberSoft },
  rowIconLive: { borderWidth: 1.5, borderColor: theme.colors.accentAmber },
  liveDotWrap: { width: 8, height: 8, alignItems: 'center', justifyContent: 'center' },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.accentAmber },
  liveDotRing: { position: 'absolute', width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.accentAmber },
  statusText: { fontFamily: theme.typography.bodyMedium, fontSize: theme.type.xs, color: theme.colors.textSecondary },
  statusTextActive: { color: theme.colors.textPrimary },
});
