import type { TextStyle } from 'react-native';

export const FontSize = {
  xs: 11,
  sm: 12,
  md: 14,
  lg: 16,
  xl: 18,
  xxl: 22,
  displaySm: 28,
  displayMd: 32,
  displayLg: 38,
} as const;

export const LineHeight = {
  xs: 16,
  sm: 18,
  md: 21,
  lg: 24,
  xl: 27,
  xxl: 31,
  displaySm: 36,
  displayMd: 40,
  displayLg: 46,
} as const;

export const FontWeight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
  extraBold: '800',
} as const satisfies Record<string, TextStyle['fontWeight']>;

export const LetterSpacing = {
  tight: -0.3,
  normal: 0,
  wide: 0.5,
  extraWide: 1,
  eyebrow: 1.1,
} as const;

export const Typography = {
  eyebrow: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.extraBold,
    letterSpacing: LetterSpacing.eyebrow,
    lineHeight: LineHeight.xs,
    textTransform: 'uppercase',
  } satisfies TextStyle,

  pageTitle: {
    fontSize: FontSize.displaySm,
    fontWeight: FontWeight.extraBold,
    letterSpacing: LetterSpacing.tight,
    lineHeight: LineHeight.displaySm,
  } satisfies TextStyle,

  sectionTitle: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.extraBold,
    lineHeight: LineHeight.xl,
  } satisfies TextStyle,

  cardTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    lineHeight: LineHeight.lg,
  } satisfies TextStyle,

  body: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.regular,
    lineHeight: LineHeight.md,
  } satisfies TextStyle,

  bodyStrong: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    lineHeight: LineHeight.md,
  } satisfies TextStyle,

  label: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    lineHeight: LineHeight.sm,
  } satisfies TextStyle,

  button: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.extraBold,
    lineHeight: LineHeight.md,
  } satisfies TextStyle,

  caption: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.regular,
    lineHeight: LineHeight.sm,
  } satisfies TextStyle,

  metric: {
    fontSize: FontSize.displaySm,
    fontWeight: FontWeight.extraBold,
    lineHeight: LineHeight.displaySm,
  } satisfies TextStyle,
} as const;