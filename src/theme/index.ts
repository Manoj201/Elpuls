export const theme = {
  colors: {
    // Dark + purple theme (2026-11-10): rebuilt to match the real app icon
    // and boot splash art. Sampled the actual icon pixels rather than
    // eyeballing it — the dominant vivid hue by far (~340k px vs ~70k for
    // the next biggest) is a blue-violet glow (#013BF0/#602FF4 family), not
    // the cyan-green bolt, so purple leads here, not teal. Every screen/
    // component reads colors from this one object, so this is still a
    // token swap, not a per-file rewrite.
    background: '#0A0A1C',
    surface: '#15132A',
    // Slightly lighter than `surface` — a second elevation tier for the
    // single most important card on a screen (e.g. the dashboard hero),
    // so it visually leads instead of blending into the rest of the stack.
    surfaceElevated: '#1E1A38',
    border: '#2C2748',
    borderMuted: '#201C38',
    textPrimary: '#F4F2FB',
    textSecondary: '#A79FC4',
    textMuted: '#79708F',
    textFaint: '#4C4566',
    // Price semantics (tercile colors on the dial/histogram, "Pro" tagging)
    // are unchanged on purpose — they carry meaning (cheap/expensive/Pro),
    // not just brand identity, so they're left alone in this pass.
    accentAmber: '#FFB300',
    accentAmberSoft: '#2B2008',
    accentAmberDeep: '#FFC978',
    positiveTeal: '#2DD4BF',
    positiveTealSoft: '#0D2420',
    positiveTealDeep: '#6EE7D8',
    dangerEmber: '#FF6B5B',
    dangerEmberSoft: '#2B1411',
    dangerEmberDeep: '#FFA296',
    neutralBar: '#423B5E',
    // Brand purple — sampled from the icon's dominant glow color, tuned for
    // UI legibility. Drives the primary button fill and "selected" states
    // (chips, onboarding option cards) that previously (and confusingly)
    // reused the amber price-semantic color for a generic UI state.
    accentPurple: '#7C5CFF',
    accentPurpleSoft: '#211A3D',
    accentPurpleDeep: '#C9BBFF',
    // Primary button fill — bright brand purple so it pops against the
    // dark background (a literal dark "ink" button would nearly vanish).
    // Deeper than accentPurple on purpose (2026-11-14): white 16px labels on
    // #7C5CFF were only 4.0:1; #6C48FF gives 4.9:1 (WCAG AA). Same hue.
    inkButton: '#6C48FF',
    // Content color for anything sitting on an inkButton fill (button
    // labels, icons) — kept separate from `surface` on purpose: surface
    // must stay dark for cards, inkButton content must stay light-on-purple.
    onInkButton: '#F7F5FF',
  },
  radius: { sm: 10, md: 14, lg: 18, xl: 20, pill: 999 },
  spacing: (n: number) => n * 4,
  // One type scale for the whole app (UI/UX Pro Max: consistent modular
  // scale 12/14/16/18/24/32, body text 16 on mobile, nothing important below
  // 12). Text still scales with the phone's text-size setting (Dynamic Type),
  // which is how people who need bigger text get it.
  type: {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 18,
    xl: 24,
    xxl: 32,
    display: 44,
  },
  typography: {
    // Font family names as exported by @expo-google-fonts/* + loaded via
    // expo-font's useFonts in App.tsx. Not the same naming convention as
    // the design spec's illustrative 'SpaceGrotesk-SemiBold' (that's a
    // raw-TTF-file convention, doesn't apply to the Google Fonts packages).
    display: 'SpaceGrotesk_600SemiBold',
    displayMedium: 'SpaceGrotesk_500Medium',
    body: 'Inter_400Regular',
    bodyMedium: 'Inter_500Medium',
    bodySemibold: 'Inter_600SemiBold',
  },
} as const;

export type Theme = typeof theme;
