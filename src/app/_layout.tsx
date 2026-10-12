import { Stack, useRouter, useSegments } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, AppState, StyleSheet, View } from 'react-native';

import { VibeBrand } from '../components/vibe-ui';
import { VibeColors } from '../constants/theme';
import { auth, db } from '../firebase';

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();
  const [sessionReady, setSessionReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    return onAuthStateChanged(auth, (user) => {
      setIsAuthenticated(Boolean(user));
      setUserId(user?.uid ?? null);
      setSessionReady(true);
    });
  }, []);

  const updatePresence = useCallback(async (uid: string, isOnline: boolean) => {
    try {
      await updateDoc(doc(db, 'users', uid), {
        isOnline,
        lastSeen: serverTimestamp(),
      });
    } catch (error) {
      console.warn('Presence update failed:', error);
    }
  }, []);

  useEffect(() => {
    if (!userId) return;

    let foreground = AppState.currentState === 'active';
    void updatePresence(userId, foreground);
    const heartbeat = setInterval(() => {
      if (foreground) void updatePresence(userId, true);
    }, 60000);
    const subscription = AppState.addEventListener('change', (state) => {
      foreground = state === 'active';
      void updatePresence(userId, foreground);
    });

    return () => {
      clearInterval(heartbeat);
      subscription.remove();
      void updatePresence(userId, false);
    };
  }, [updatePresence, userId]);

  useEffect(() => {
    if (!sessionReady) return;

    const rootRoute = segments[0];
    const isPublicRoute = !rootRoute || ['signup', 'forgot-password'].includes(rootRoute);

    if (isAuthenticated && isPublicRoute) {
      router.replace('/chats');
    } else if (!isAuthenticated && !isPublicRoute) {
      router.replace('/');
    }
  }, [isAuthenticated, router, segments, sessionReady]);

  return (
    <View style={styles.root}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="profile" />
      </Stack>
      {!sessionReady && (
        <View style={styles.loading}>
          <View style={styles.glow} />
          <VibeBrand />
          <ActivityIndicator size="small" color={VibeColors.primary} style={styles.spinner} />
        </View>
      )}
    </View>
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
