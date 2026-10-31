import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import 'react-native-url-polyfill/auto';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';

const isNative = Platform.OS === 'android' || Platform.OS === 'ios';
const isServer = typeof window === 'undefined';

// In-memory fallback storage for SSR / server rendering environments where window is unavailable
const memoryStorage = new Map<string, string>();

const webSafeStorage = {
  getItem: async (key: string): Promise<string | null> => {
    if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
      try {
        return window.localStorage.getItem(key);
      } catch {
        return memoryStorage.get(key) ?? null;
      }
    }
    return memoryStorage.get(key) ?? null;
  },
  setItem: async (key: string, value: string): Promise<void> => {
    if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
      try {
        window.localStorage.setItem(key, value);
        return;
      } catch {}
    }
    memoryStorage.set(key, value);
  },
  removeItem: async (key: string): Promise<void> => {
    if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
      try {
        window.localStorage.removeItem(key);
        return;
      } catch {}
    }
    memoryStorage.delete(key);
  },
};

export const supabase = createClient(
  supabaseUrl,
  supabasePublishableKey,
  {
    auth: {
      // Use native AsyncStorage on Android/iOS; use webSafeStorage on web/SSR
      storage: isNative ? AsyncStorage : webSafeStorage,
      autoRefreshToken: isNative ? true : !isServer,
      persistSession: isNative ? true : !isServer,
      detectSessionInUrl: false,
    },
  }
);