/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#0F172A',
    background: '#F8FAFC',
    backgroundElement: '#E2E8F0',
    backgroundSelected: '#E0E7FF',
    textSecondary: '#64748B',
  },
  dark: {
    text: '#F8FAFC',
    background: '#0F172A',
    backgroundElement: '#334155',
    backgroundSelected: '#312E81',
    textSecondary: '#A5B4CF',
  },
} as const;

export const VibeColors = {
  primary: '#5B5CE6',
  primaryDark: '#4B4CCB',
  secondary: '#8B5CF6',
  accent: '#A78BFA',
  primarySoft: '#F3E8FF',
  background: '#F6F7FB',
  canvas: '#F8FAFC',
  chatBackground: '#F8F8FF',
  surface: '#FFFFFF',
  surfaceSubtle: '#F3F4F8',
  surfaceAlt: '#F9F5FF',
  inputBackground: '#F3F4F8',
  text: '#111827',
  textSecondary: '#667085',
  border: '#E6E8F0',
  online: '#22C55E',
  danger: '#EF4444',
  dangerSoft: '#FEE2E2',
  incomingBubble: '#FFFFFF',
  outgoingBubble: '#5B5CE6',
  white: '#FFFFFF',
} as const;

export const VibeSpacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  section: 32,
} as const;

export const VibeRadii = {
  input: 18,
  control: 18,
  bubble: 22,
  card: 20,
  pill: 999,
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
