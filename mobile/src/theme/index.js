// REBU design tokens: neutral, flat UI with a single raspberry accent.

export const colors = {
  // One flat accent (raspberry, from the REBU logo) on a light lavender UI
  // (client request); cards and sheets stay white on top of it.
  // Gradient keys are kept for compatibility but are solid on purpose.
  primary: '#D81B60',
  primaryDark: '#AD1457',
  secondary: '#5B2A86',
  secondaryDark: '#451F66',
  gradient: ['#D81B60', '#D81B60'],
  gradientSoft: ['#FCE8EF', '#FCE8EF'],
  gradientWarm: ['#D81B60', '#D81B60'],
  gradientGold: ['#F5B301', '#F5B301'],

  background: '#F3EEFB',
  surface: '#FFFFFF',
  surfaceAlt: '#F4F4F6',
  surfaceMuted: '#F2F2F4',
  ink: '#111111',
  text: '#1C1C1E',
  textMuted: '#6E6E73',
  textFaint: '#A1A1A6',
  border: 'rgba(0,0,0,0.08)',
  borderStrong: 'rgba(0,0,0,0.16)',

  success: '#1E9E5A',
  online: '#34C759',
  warning: '#E89A00',
  danger: '#E5383B',
  coin: '#F5B301',
  diamond: '#8E8E93',
  white: '#FFFFFF',
  black: '#000000',
  overlay: 'rgba(0,0,0,0.5)',
  glass: 'rgba(0,0,0,0.35)',
  glassBorder: 'rgba(255,255,255,0.2)',
};

export const fonts = {
  regular: 'PlusJakartaSans-Regular',
  medium: 'PlusJakartaSans-Medium',
  semibold: 'PlusJakartaSans-SemiBold',
  bold: 'PlusJakartaSans-Bold',
  extrabold: 'PlusJakartaSans-ExtraBold',
};

export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 40,
};

export const radius = { xs: 8, sm: 12, md: 16, lg: 20, xl: 28, pill: 999 };

export const type = {
  display: {
    fontFamily: fonts.extrabold,
    fontSize: 32,
    lineHeight: 38,
    color: colors.ink,
    letterSpacing: -0.6,
  },
  h1: {
    fontFamily: fonts.extrabold,
    fontSize: 26,
    lineHeight: 32,
    color: colors.ink,
    letterSpacing: -0.4,
  },
  h2: {
    fontFamily: fonts.bold,
    fontSize: 21,
    lineHeight: 27,
    color: colors.ink,
    letterSpacing: -0.2,
  },
  h3: {
    fontFamily: fonts.bold,
    fontSize: 17,
    lineHeight: 23,
    color: colors.ink,
  },
  body: {
    fontFamily: fonts.regular,
    fontSize: 15,
    lineHeight: 22,
    color: colors.text,
  },
  bodyMedium: {
    fontFamily: fonts.medium,
    fontSize: 15,
    lineHeight: 22,
    color: colors.text,
  },
  small: {
    fontFamily: fonts.medium,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textMuted,
  },
  tiny: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    lineHeight: 14,
    color: colors.textMuted,
  },
  label: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    lineHeight: 18,
    color: colors.ink,
  },
  button: {
    fontFamily: fonts.bold,
    fontSize: 16,
    lineHeight: 20,
    color: colors.white,
  },
};

export const shadow = {
  card: {
    shadowColor: '#1A1325',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 24,
    elevation: 4,
  },
  soft: {
    shadowColor: '#1A1325',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  glow: {},
};

export default { colors, fonts, spacing, radius, type, shadow };
