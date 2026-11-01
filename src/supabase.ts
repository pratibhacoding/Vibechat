import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import 'react-native-url-polyfill/auto';

function sanitizeSupabaseUrl(url: string): string {
  if (!url) return '';

  const trimmed = url.trim().replace(/^['"]|['"]$/g, '');
  const cleaned = trimmed.replace(/\/+$/, '');

  try {
    const parsed = new URL(cleaned);
    if (parsed.origin && parsed.hostname) {
      if (parsed.hostname.endsWith('.supabase.co')) {
        return parsed.origin;
      }
      return cleaned.replace(/\/(rest|auth|storage|graphql)\/v\d+\/?$/i, '');
    }
  } catch {
    // Fall back to a conservative string cleanup when the value is not a valid absolute URL.
  }

  return cleaned.replace(/\/(rest|auth|storage|graphql)\/v\d+\/?$/i, '');
}

const rawSupabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseUrl = sanitizeSupabaseUrl(rawSupabaseUrl);

const rawPublishableKey =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.EXPO_PUBLIC_SUPABASE_KEY ||
  '';
const supabasePublishableKey = rawPublishableKey.trim().replace(/^['"]|['"]$/g, '');

export function logSupabaseAuthFailure(action: string, error: any) {
  let requestUrl: URL | null = null;

  try {
    if (error?.request?.url) {
      requestUrl = new URL(error.request.url);
    }
  } catch {
    requestUrl = null;
  }

  const payload = {
    method: error?.request?.method || 'UNKNOWN',
    pathname: requestUrl?.pathname || null,
    status: error?.status ?? null,
    errorName: error?.name ?? null,
    errorMessage: error?.message ?? null,
  };

  console.warn(`[supabase:${action}]`, payload);
}

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
      } catch { }
    }
    memoryStorage.set(key, value);
  },
  removeItem: async (key: string): Promise<void> => {
    if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
      try {
        window.localStorage.removeItem(key);
        return;
      } catch { }
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