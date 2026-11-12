// Duplicated from ../../src/theme/index.ts — the website is a separate
// Vite/React project, not part of the Expo app's module graph, so it can't
// import that file directly. Same dual-copy precedent already used for
// business logic and the widget's Swift colors (see CLAUDE.md). Keep these
// in sync by hand if the app's palette changes.
export const theme = {
  colors: {
    background: '#0A0A1C',
    surface: '#15132A',
    surfaceElevated: '#1E1A38',
    border: '#2C2748',
    borderMuted: '#201C38',
    textPrimary: '#F4F2FB',
    textSecondary: '#A79FC4',
    textMuted: '#79708F',
    textFaint: '#4C4566',
    accentAmber: '#FFB300',
    positiveTeal: '#2DD4BF',
    accentPurple: '#7C5CFF',
    accentPurpleSoft: '#211A3D',
    inkButton: '#7C5CFF',
    onInkButton: '#F7F5FF',
  },
  typography: {
    display: "'Space Grotesk', sans-serif",
    body: "'Inter', sans-serif",
  },
} as const;
