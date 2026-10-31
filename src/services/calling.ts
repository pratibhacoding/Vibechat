import { supabase } from '../supabase';
import { AgoraTokenResponse, CallSession, CallSignal, CallType } from '../types/call';

/**
 * Deterministically maps a UUID to a positive 32-bit integer for Agora RTC numeric UIDs.
 */
export function uuidToAgoraUid(uuid: string): number {
  let hash = 0;
  for (let i = 0; i < uuid.length; i++) {
    const char = uuid.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  const positive = Math.abs(hash) % 2147483647;
  return positive === 0 ? 1 : positive;
}

/**
 * Fetch dynamic Agora RTC token from Supabase Edge Function.
 * Validates authenticated session before requesting token.
 */
export async function fetchAgoraToken(
  channelName: string,
  userId: string,
  recipientId: string
): Promise<AgoraTokenResponse | null> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      console.warn('Cannot fetch Agora token: not authenticated');
      return null;
    }

    // Try calling Supabase Edge Function 'agora-token'
    const { data, error } = await supabase.functions.invoke('agora-token', {
      body: {
        channelName,
        userId,
        recipientId,
        role: 'publisher',
      },
    });

    if (!error && data?.token && data?.appId) {
      return {
        token: data.token,
        channelName: data.channelName || channelName,
        uid: data.uid || uuidToAgoraUid(userId),
        appId: data.appId,
      };
    }

    if (error) {
      console.warn('Edge function agora-token invocation failed or not deployed yet:', error);
    }
  } catch (err) {
    console.warn('Edge function invoke exception:', err);
  }

  // Fallback: If EXPO_PUBLIC_AGORA_APP_ID is provided in .env
  const fallbackAppId = process.env.EXPO_PUBLIC_AGORA_APP_ID;
  if (fallbackAppId) {
    return {
      token: '', // Testing mode without certificate requirement if enabled in Agora console
      channelName,
      uid: uuidToAgoraUid(userId),
      appId: fallbackAppId.trim(),
    };
  }

  return null;
}

/**
 * Sends a signaling payload to a specific user's signaling channel.
 */
export async function sendCallSignal(
  recipientId: string,
  signal: CallSignal
): Promise<boolean> {
  try {
    const channelName = `call_signaling_${recipientId}`;
    const channel = supabase.channel(channelName);

    await channel.subscribe();
    const res = await channel.send({
      type: 'broadcast',
      event: 'call_signal',
      payload: signal,
    });

    // Cleanup ephemeral sender channel after sending
    setTimeout(() => {
      supabase.removeChannel(channel);
    }, 1500);

    return res === 'ok';
  } catch (error) {
    console.warn('Failed to send call signal:', error);
    return false;
  }
}

/**
 * Records a call in the call_records table (if table exists).
 */
export async function recordCallInitiation(
  session: CallSession,
  callerId: string
): Promise<void> {
  try {
    await supabase.from('call_records').insert({
      id: session.callId,
      channel_id: session.channelId,
      caller_id: callerId,
      receiver_id: session.otherUserId,
      chat_id: session.chatId || null,
      call_type: session.callType,
      status: session.status,
      started_at: new Date().toISOString(),
    });
  } catch (error) {
    // Non-blocking: table might still need migration execution
    console.warn('Could not record call initiation:', error);
  }
}

/**
 * Updates call status and duration in call_records table.
 */
export async function updateCallRecord(
  callId: string,
  updates: {
    status: CallSession['status'];
    duration?: number;
    accepted_at?: string;
    ended_at?: string;
  }
): Promise<void> {
  try {
    const payload: any = {
      status: updates.status,
    };
    if (updates.duration !== undefined) {
      payload.duration_seconds = updates.duration;
    }
    if (updates.accepted_at) {
      payload.accepted_at = updates.accepted_at;
    }
    if (updates.ended_at) {
      payload.ended_at = updates.ended_at;
    }

    await supabase.from('call_records').update(payload).eq('id', callId);
  } catch (error) {
    console.warn('Could not update call record:', error);
  }
}
