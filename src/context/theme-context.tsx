import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { useColorScheme as useSystemColorScheme } from 'react-native';

export type ThemePreference = 'light' | 'dark' | 'system';

export type ThemeColors = {
  primary: string;
  primaryDark: string;
  primarySoft: string;
  accent: string;
  background: string;
  chatBackground: string;
  surface: string;
  surfaceSubtle: string;
  surfaceAlt: string;
  inputBackground: string;
  text: string;
  textSecondary: string;
  border: string;
  online: string;
  danger: string;
  dangerSoft: string;
  incomingBubble: string;
  outgoingBubble: string;
  incomingText: string;
  outgoingText: string;
  card: string;
  cardBorder: string;
  modalOverlay: string;
};

const LightColors: ThemeColors = {
  primary: '#6366F1',
  primaryDark: '#4F46E5',
  primarySoft: '#EEF2FF',
  accent: '#7C3AED',
  background: '#F8FAFC',
  chatBackground: '#F8F8FF',
  surface: '#FFFFFF',
  surfaceSubtle: '#F1F5F9',
  surfaceAlt: '#F9F5FF',
  inputBackground: '#F1F5F9',
  text: '#0F172A',
  textSecondary: '#64748B',
  border: '#E2E8F0',
  online: '#22C55E',
  danger: '#EF4444',
  dangerSoft: '#FEE2E2',
  incomingBubble: '#FFFFFF',
  outgoingBubble: '#6366F1',
  incomingText: '#0F172A',
  outgoingText: '#FFFFFF',
  card: '#FFFFFF',
  cardBorder: '#E9E2FF',
  modalOverlay: 'rgba(15, 23, 42, 0.45)',
};

const DarkColors: ThemeColors = {
  primary: '#6366F1',
  primaryDark: '#4F46E5',
  primarySoft: '#232042',
  accent: '#8B5CF6',
  background: '#0B0F19',
  chatBackground: '#080C14',
  surface: '#131B2E',
  surfaceSubtle: '#1E293B',
  surfaceAlt: '#162038',
  inputBackground: '#1E293B',
  text: '#F8FAFC',
  textSecondary: '#94A3B8',
  border: '#23304B',
  online: '#22C55E',
  danger: '#EF4444',
  dangerSoft: '#451A1A',
  incomingBubble: '#1E293B',
  outgoingBubble: '#6366F1',
  incomingText: '#F8FAFC',
  outgoingText: '#FFFFFF',
  card: '#131B2E',
  cardBorder: '#23304B',
  modalOverlay: 'rgba(0, 0, 0, 0.72)',
};

type ThemeContextType = {
  theme: ThemePreference;
  isDark: boolean;
  colors: ThemeColors;
  setTheme: (theme: ThemePreference) => Promise<void>;
};

const ThemeContext = createContext<ThemeContextType>({
  theme: 'system',
  isDark: false,
  colors: LightColors,
  setTheme: async () => {},
});

const THEME_STORAGE_KEY = '@vibe/theme-preference';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useSystemColorScheme();
  const [theme, setThemeState] = useState<ThemePreference>('system');

  useEffect(() => {
    AsyncStorage.getItem(THEME_STORAGE_KEY)
      .then((stored) => {
        if (stored === 'light' || stored === 'dark' || stored === 'system') {
          setThemeState(stored);
        }
      })
      .catch((err) => console.warn('Failed to load theme preference:', err));
  }, []);

  const setTheme = async (newTheme: ThemePreference) => {
    try {
      setThemeState(newTheme);
      await AsyncStorage.setItem(THEME_STORAGE_KEY, newTheme);
    } catch (err) {
      console.warn('Failed to save theme preference:', err);
    }
  };

  const isDark =
    theme === 'dark' || (theme === 'system' && systemScheme === 'dark');

  const colors = isDark ? DarkColors : LightColors;

  return (
    <ThemeContext.Provider value={{ theme, isDark, colors, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useAppTheme() {
  return useContext(ThemeContext);
}
