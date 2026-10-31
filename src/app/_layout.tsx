import * as Notifications from 'expo-notifications';
import { isRunningInExpoGo } from 'expo';
import { Stack, useRouter, useSegments } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, AppState, StyleSheet, View } from 'react-native';

import { CallModal } from '../components/call-modal';
import { VibeBrand } from '../components/vibe-ui';
import { VibeColors } from '../constants/theme';
import { CallProvider } from '../context/call-context';
import { ThemeProvider, useAppTheme } from '../context/theme-context';
import { supabase } from '../supabase';
import { registerForPushNotificationsAsync } from '../utils/notifications';

function RootLayoutContent() {
  const router = useRouter();
  const segments = useSegments();
  const { colors, isDark } = useAppTheme();
  const [sessionReady, setSessionReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!isMounted) return;
      const user = session?.user ?? null;
      setIsAuthenticated(Boolean(user));
      setUserId(user?.id ?? null);
      setSessionReady(true);
      if (user?.id) {
        void registerForPushNotificationsAsync(user.id);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMounted) return;
      const user = session?.user ?? null;
      setIsAuthenticated(Boolean(user));
      setUserId(user?.id ?? null);
      setSessionReady(true);
      if (user?.id) {
        void registerForPushNotificationsAsync(user.id);
      }
      if (event === 'PASSWORD_RECOVERY') {
        router.push('/reset-password' as any);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [router]);

  // Handle notification response (tapping notification navigates to conversation)
  useEffect(() => {
    if (isRunningInExpoGo()) return;

    try {
      const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
        const data = response.notification.request.content.data;
        if (data?.senderId || data?.chatId) {
          router.push({
            pathname: '/chat',
            params: {
              uid: data.senderId as string,
              isGroup: data.isGroup ? 'true' : 'false',
              chatId: data.chatId as string,
            },
          });
        }
      });

      return () => {
        subscription.remove();
      };
    } catch (error) {
      console.warn('Could not attach notification response listener:', error);
    }
  }, [router]);

  // Ephemeral Realtime Presence + Persisted last_seen on app state transition
  const updatePresence = useCallback(async (uid: string, isOnline: boolean) => {
    try {
      await supabase
        .from('profiles')
        .update({
          is_online: isOnline,
          last_seen: new Date().toISOString(),
        })
        .eq('id', uid);
    } catch (error) {
      console.warn('Supabase presence update failed:', error);
    }
  }, []);

  useEffect(() => {
    if (!userId) return;

    let isOnline = AppState.currentState === 'active';
    void updatePresence(userId, isOnline);

    const presenceChannel = supabase.channel(`presence_${userId}`, {
      config: { presence: { key: userId } },
    });

    presenceChannel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED' && isOnline) {
        await presenceChannel.track({ online_at: new Date().toISOString() });
      }
    });

    const subscription = AppState.addEventListener('change', (state) => {
      const active = state === 'active';
      isOnline = active;
      void updatePresence(userId, active);

      if (active) {
        void presenceChannel.track({ online_at: new Date().toISOString() });
      } else {
        void presenceChannel.untrack();
      }
    });

    return () => {
      subscription.remove();
      void updatePresence(userId, false);
      void presenceChannel.untrack();
      supabase.removeChannel(presenceChannel);
    };
  }, [updatePresence, userId]);

  useEffect(() => {
    if (!sessionReady) return;

    const rootRoute = segments[0];
    const isPublicRoute = !rootRoute || ['signup', 'forgot-password', 'reset-password'].includes(rootRoute);

    if (isAuthenticated && isPublicRoute) {
      router.replace('/chats');
    } else if (!isAuthenticated && !isPublicRoute) {
      router.replace('/');
    }
  }, [isAuthenticated, router, segments, sessionReady]);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="profile" />
        <Stack.Screen name="calls" />
        <Stack.Screen name="reset-password" />
      </Stack>
      <CallModal />
      {!sessionReady && (
        <View style={[styles.loading, { backgroundColor: colors.background }]}>
          <View style={[styles.glow, { backgroundColor: isDark ? '#2E1065' : '#EDE9FE' }]} />
          <VibeBrand />
          <ActivityIndicator size="small" color={colors.primary} style={styles.spinner} />
        </View>
      )}
    </View>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <CallProvider>
        <RootLayoutContent />
      </CallProvider>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  loading: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: VibeColors.background,
  },
  glow: {
    position: 'absolute',
    width: 210,
    height: 210,
    borderRadius: 105,
    backgroundColor: '#EDE9FE',
    opacity: 0.9,
  },
  spinner: { marginTop: 20 },
});
