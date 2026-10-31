import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { isRunningInExpoGo } from 'expo';
import { Platform } from 'react-native';

import { supabase } from '../supabase';

// Configure notification behavior when app is in foreground
try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
      priority: Notifications.AndroidNotificationPriority.HIGH,
    }),
  });
} catch (error) {
  console.warn('Notification handler initialization skipped:', error);
}

/**
 * Registers device for push notifications and returns Expo Push Token.
 * Also configures the Android notification channel.
 * Saves the token to Supabase `push_tokens` table.
 */
export async function registerForPushNotificationsAsync(userId?: string): Promise<string | null> {
  // SDK 53+ removed remote push notifications from Expo Go on Android.
  // In Expo Go, skip remote registration gracefully to avoid crashing, while allowing
  // standalone / expo-dev-client development builds to register normally.
  if (isRunningInExpoGo()) {
    console.log(
      '[notifications] Remote push notifications require an Expo development build (expo-dev-client). Skipping in Expo Go.'
    );
    return null;
  }

  let token: string | null = null;

  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default Messages',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#6366F1',
      });
    }

    if (Device.isDevice) {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        console.log('Failed to obtain push token: Permission not granted');
        return null;
      }

      const projectId =
        Constants.expoConfig?.extra?.eas?.projectId ??
        Constants.easConfig?.projectId;

      if (!projectId) {
        console.warn(
          '[notifications] EAS projectId not found in app config. Ensure extra.eas.projectId is defined in app.json.'
        );
        return null;
      }

      const pushTokenData = await Notifications.getExpoPushTokenAsync({ projectId });
      token = pushTokenData?.data ?? null;

      // Save token in Supabase push_tokens table linked to auth.uid()
      if (userId && token) {
        const { error: upsertError } = await supabase.from('push_tokens').upsert(
          {
            user_id: userId,
            token: token,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,token' }
        );

        if (upsertError) {
          console.warn('[notifications] Failed to save push token to Supabase:', upsertError.message, upsertError);
        } else {
          console.log('[notifications] Push token saved to Supabase successfully.');
        }
      }
    } else {
      console.log('Push notifications require a physical device.');
    }
  } catch (error) {
    console.warn('Could not register for push notifications:', error);
  }

  return token;
}

/**
 * Displays an immediate local notification banner and sound on the device.
 * 100% Firebase-free and compatible with Expo SDK 57 and Supabase.
 */
export async function displayLocalNotification({
  title,
  body,
  data,
}: {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}): Promise<void> {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: data || {},
        sound: 'default',
        priority: Notifications.AndroidNotificationPriority.HIGH,
      },
      trigger: null,
    });
  } catch (err) {
    console.warn('Could not display local notification:', err);
  }
}

/**
 * Sends an Expo Push Notification to a recipient's token via Expo's HTTP push API.
 * This triggers when a user sends a message so the receiver gets notified.
 */
export async function sendPushNotification({
  toToken,
  senderName,
  messagePreview,
  chatId,
  senderId,
  isGroup = false,
}: {
  toToken: string;
  senderName: string;
  messagePreview: string;
  chatId: string;
  senderId: string;
  isGroup?: boolean;
}) {
  if (!toToken || !toToken.startsWith('ExponentPushToken')) {
    return;
  }

  const payload = {
    to: toToken,
    sound: 'default',
    title: senderName,
    body: messagePreview || 'Sent a message',
    data: {
      chatId,
      senderId,
      isGroup,
    },
    priority: 'high',
    channelId: 'default',
  };

  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.warn('Failed to send push notification payload:', error);
  }
}

/**
 * Dispatches push notifications to all other members of a chat.
 */
export async function notifyChatMembers({
  chatId,
  senderId,
  senderName,
  messageText,
  isGroup = false,
}: {
  chatId: string;
  senderId: string;
  senderName: string;
  messageText: string;
  isGroup?: boolean;
}) {
  try {
    const { data: tokens } = await supabase.rpc('get_chat_push_tokens', {
      p_chat_id: chatId,
    });
    if (tokens && Array.isArray(tokens)) {
      for (const row of tokens) {
        if (row.token && row.user_id !== senderId) {
          void sendPushNotification({
            toToken: row.token,
            senderName,
            messagePreview: messageText,
            chatId,
            senderId,
            isGroup,
          });
        }
      }
    }
  } catch (err) {
    // If RPC is not created yet, push notification gracefully skips
    console.warn('Could not notify chat members:', err);
  }
}
