import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Alert } from 'react-native';

import { agoraService } from '../services/agora';
import {
  fetchAgoraToken,
  recordCallInitiation,
  sendCallSignal,
  updateCallRecord,
  uuidToAgoraUid,
} from '../services/calling';
import { supabase } from '../supabase';
import { CallSession, CallSignal, CallType } from '../types/call';

interface CallContextType {
  callSession: CallSession | null;
  startCall: (
    targetUserId: string,
    targetName: string,
    targetAvatar?: string | null,
    callType?: CallType,
    chatId?: string
  ) => Promise<void>;
  acceptCall: () => Promise<void>;
  rejectCall: () => Promise<void>;
  endCall: () => Promise<void>;
  toggleMute: () => void;
  toggleSpeaker: () => void;
  toggleCamera: () => void;
  switchCamera: () => void;
}

const CallContext = createContext<CallContextType | undefined>(undefined);

export const CallProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [callSession, setCallSession] = useState<CallSession | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserProfile, setCurrentUserProfile] = useState<{
    name: string;
    avatarUrl?: string | null;
  }>({ name: 'User' });

  const sessionRef = useRef<CallSession | null>(null);
  sessionRef.current = callSession;

  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const ringTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear timers helper
  const clearTimers = useCallback(() => {
    if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }
    if (ringTimeoutRef.current) {
      clearTimeout(ringTimeoutRef.current);
      ringTimeoutRef.current = null;
    }
  }, []);

  // Fetch current user and profile
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const uid = session?.user?.id ?? null;
      setCurrentUserId(uid);
      if (uid) {
        supabase
          .from('profiles')
          .select('full_name, avatar_url')
          .eq('id', uid)
          .maybeSingle()
          .then(({ data }) => {
            if (data) {
              setCurrentUserProfile({
                name: data.full_name || 'User',
                avatarUrl: data.avatar_url,
              });
            }
          });
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const uid = session?.user?.id ?? null;
      setCurrentUserId(uid);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Teardown call session
  const teardownCall = useCallback(
    async (finalStatus: CallSession['status']) => {
      clearTimers();
      const current = sessionRef.current;
      if (current) {
        await updateCallRecord(current.callId, {
          status: finalStatus,
          duration: current.duration,
          ended_at: new Date().toISOString(),
        });
      }

      await agoraService.leave();
      agoraService.release();

      setCallSession((prev) => (prev ? { ...prev, status: finalStatus } : null));

      // Reset session after displaying final status briefly
      setTimeout(() => {
        setCallSession(null);
      }, 1800);
    },
    [clearTimers]
  );

  // Setup Agora RTC Engine and Join Channel
  const joinAgoraCall = useCallback(
    async (session: CallSession) => {
      if (!currentUserId) return;

      const tokenRes = await fetchAgoraToken(
        session.channelId,
        currentUserId,
        session.otherUserId
      );

      if (!tokenRes) {
        Alert.alert(
          'Agora Configuration Required',
          'Could not retrieve Agora credentials. Please verify your Supabase Edge Function agora-token or set EXPO_PUBLIC_AGORA_APP_ID in .env.'
        );
        void teardownCall('ended');
        return;
      }

      const uid = tokenRes.uid || uuidToAgoraUid(currentUserId);

      await agoraService.initializeEngine(tokenRes.appId, {
        onJoinSuccess: (_channel, localUid) => {
          setCallSession((prev) =>
            prev ? { ...prev, localUid, status: 'connected', connectedAt: Date.now() } : null
          );
        },
        onUserJoined: (remoteUid) => {
          setCallSession((prev) => (prev ? { ...prev, remoteUid } : null));
        },
        onUserOffline: (remoteUid) => {
          setCallSession((prev) =>
            prev?.remoteUid === remoteUid ? { ...prev, remoteUid: undefined } : prev
          );
          void teardownCall('ended');
        },
        onError: (err, msg) => {
          console.warn('Agora runtime error:', err, msg);
        },
      });

      const joined = await agoraService.join(
        tokenRes.token,
        tokenRes.channelName,
        uid,
        session.callType
      );

      if (joined) {
        // Start duration counter
        clearTimers();
        durationTimerRef.current = setInterval(() => {
          setCallSession((prev) => (prev ? { ...prev, duration: prev.duration + 1 } : null));
        }, 1000);
      }
    },
    [clearTimers, currentUserId, teardownCall]
  );

  // Listen to incoming call signals via Supabase Realtime
  useEffect(() => {
    if (!currentUserId) return;

    const channelName = `call_signaling_${currentUserId}`;
    const signalingChannel = supabase.channel(channelName);

    signalingChannel
      .on('broadcast', { event: 'call_signal' }, async ({ payload }) => {
        const signal = payload as CallSignal;
        if (!signal || signal.receiverId !== currentUserId) return;

        const current = sessionRef.current;

        switch (signal.type) {
          case 'call_invite': {
            // If already on a call, immediately reject with busy
            if (current && current.status !== 'idle' && current.status !== 'ended') {
              void sendCallSignal(signal.callerId, {
                type: 'call_busy',
                callId: signal.callId,
                channelId: signal.channelId,
                callerId: currentUserId,
                callerName: currentUserProfile.name,
                receiverId: signal.callerId,
                callType: signal.callType,
                timestamp: Date.now(),
              });
              return;
            }

            // Incoming call!
            const newSession: CallSession = {
              callId: signal.callId,
              channelId: signal.channelId,
              chatId: signal.chatId,
              callType: signal.callType,
              status: 'ringing',
              role: 'callee',
              otherUserId: signal.callerId,
              otherUserName: signal.callerName,
              otherUserAvatar: signal.callerAvatar,
              duration: 0,
              isMuted: false,
              isSpeaker: signal.callType === 'video',
              isVideoEnabled: signal.callType === 'video',
              isFrontCamera: true,
            };

            setCallSession(newSession);

            // Acknowledge ringing to caller
            void sendCallSignal(signal.callerId, {
              type: 'call_ringing',
              callId: signal.callId,
              channelId: signal.channelId,
              callerId: currentUserId,
              callerName: currentUserProfile.name,
              receiverId: signal.callerId,
              callType: signal.callType,
              timestamp: Date.now(),
            });

            // Set 35s timeout for auto-miss if not answered
            if (ringTimeoutRef.current) clearTimeout(ringTimeoutRef.current);
            ringTimeoutRef.current = setTimeout(() => {
              void teardownCall('missed');
            }, 35000);

            break;
          }

          case 'call_ringing': {
            if (current && current.callId === signal.callId && current.role === 'caller') {
              setCallSession((prev) => (prev ? { ...prev, status: 'ringing' } : null));
            }
            break;
          }

          case 'call_accepted': {
            if (current && current.callId === signal.callId && current.role === 'caller') {
              clearTimers();
              setCallSession((prev) => (prev ? { ...prev, status: 'connected' } : null));
              void joinAgoraCall(current);
            }
            break;
          }

          case 'call_rejected': {
            if (current && current.callId === signal.callId) {
              void teardownCall('rejected');
            }
            break;
          }

          case 'call_busy': {
            if (current && current.callId === signal.callId) {
              void teardownCall('busy');
            }
            break;
          }

          case 'call_cancelled': {
            if (current && current.callId === signal.callId) {
              void teardownCall('missed');
            }
            break;
          }

          case 'call_ended': {
            if (current && current.callId === signal.callId) {
              void teardownCall('ended');
            }
            break;
          }
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(signalingChannel);
    };
  }, [clearTimers, currentUserId, currentUserProfile.name, joinAgoraCall, teardownCall]);

  // Start outgoing call
  const startCall = useCallback(
    async (
      targetUserId: string,
      targetName: string,
      targetAvatar?: string | null,
      callType: CallType = 'voice',
      chatId?: string
    ) => {
      if (!currentUserId) {
        Alert.alert('Authentication required', 'Please sign in to place calls.');
        return;
      }

      if (targetUserId === currentUserId) {
        Alert.alert('Cannot call yourself', 'Please select another user to call.');
        return;
      }

      // Check permissions on-demand (never on startup)
      const permResult = await agoraService.requestPermissions(callType);
      if (!permResult.granted) {
        Alert.alert(
          'Permission Required',
          permResult.errorMessage || 'Microphone and camera permissions are required for calling.'
        );
        return;
      }

      const callId =
        Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
      const channelId = `vibe_${callId}`;

      const session: CallSession = {
        callId,
        channelId,
        chatId,
        callType,
        status: 'calling',
        role: 'caller',
        otherUserId: targetUserId,
        otherUserName: targetName,
        otherUserAvatar: targetAvatar,
        duration: 0,
        isMuted: false,
        isSpeaker: callType === 'video',
        isVideoEnabled: callType === 'video',
        isFrontCamera: true,
      };

      setCallSession(session);
      void recordCallInitiation(session, currentUserId);

      // Send call invite signal
      await sendCallSignal(targetUserId, {
        type: 'call_invite',
        callId,
        channelId,
        chatId,
        callerId: currentUserId,
        callerName: currentUserProfile.name,
        callerAvatar: currentUserProfile.avatarUrl,
        receiverId: targetUserId,
        callType,
        timestamp: Date.now(),
      });

      // 30s ringing timeout for caller
      if (ringTimeoutRef.current) clearTimeout(ringTimeoutRef.current);
      ringTimeoutRef.current = setTimeout(async () => {
        const cur = sessionRef.current;
        if (cur && cur.status !== 'connected') {
          await sendCallSignal(targetUserId, {
            type: 'call_cancelled',
            callId,
            channelId,
            callerId: currentUserId,
            callerName: currentUserProfile.name,
            receiverId: targetUserId,
            callType,
            timestamp: Date.now(),
          });
          void teardownCall('missed');
        }
      }, 30000);
    },
    [currentUserId, currentUserProfile.avatarUrl, currentUserProfile.name, teardownCall]
  );

  // Callee accepts incoming call
  const acceptCall = useCallback(async () => {
    const current = sessionRef.current;
    if (!current || !currentUserId) return;

    clearTimers();

    const permResult = await agoraService.requestPermissions(current.callType);
    if (!permResult.granted) {
      Alert.alert(
        'Permission Required',
        permResult.errorMessage || 'Microphone and camera permissions are required to answer the call.'
      );
      void teardownCall('rejected');
      return;
    }

    setCallSession((prev) => (prev ? { ...prev, status: 'connected' } : null));

    // Send call_accepted signal to caller
    await sendCallSignal(current.otherUserId, {
      type: 'call_accepted',
      callId: current.callId,
      channelId: current.channelId,
      chatId: current.chatId,
      callerId: currentUserId,
      callerName: currentUserProfile.name,
      receiverId: current.otherUserId,
      callType: current.callType,
      timestamp: Date.now(),
    });

    await updateCallRecord(current.callId, {
      status: 'accepted',
      accepted_at: new Date().toISOString(),
    });

    void joinAgoraCall(current);
  }, [clearTimers, currentUserId, currentUserProfile.name, joinAgoraCall, teardownCall]);

  // Callee rejects incoming call
  const rejectCall = useCallback(async () => {
    const current = sessionRef.current;
    if (!current || !currentUserId) return;

    clearTimers();

    await sendCallSignal(current.otherUserId, {
      type: 'call_rejected',
      callId: current.callId,
      channelId: current.channelId,
      chatId: current.chatId,
      callerId: currentUserId,
      callerName: currentUserProfile.name,
      receiverId: current.otherUserId,
      callType: current.callType,
      timestamp: Date.now(),
    });

    void teardownCall('rejected');
  }, [clearTimers, currentUserId, currentUserProfile.name, teardownCall]);

  // Caller or Callee ends call
  const endCall = useCallback(async () => {
    const current = sessionRef.current;
    if (!current || !currentUserId) return;

    clearTimers();

    const signalType = current.status === 'connected' ? 'call_ended' : 'call_cancelled';
    await sendCallSignal(current.otherUserId, {
      type: signalType,
      callId: current.callId,
      channelId: current.channelId,
      chatId: current.chatId,
      callerId: currentUserId,
      callerName: currentUserProfile.name,
      receiverId: current.otherUserId,
      callType: current.callType,
      timestamp: Date.now(),
    });

    void teardownCall('ended');
  }, [clearTimers, currentUserId, currentUserProfile.name, teardownCall]);

  // Media toggles
  const toggleMute = useCallback(() => {
    setCallSession((prev) => {
      if (!prev) return null;
      const nextMuted = !prev.isMuted;
      agoraService.setMute(nextMuted);
      return { ...prev, isMuted: nextMuted };
    });
  }, []);

  const toggleSpeaker = useCallback(() => {
    setCallSession((prev) => {
      if (!prev) return null;
      const nextSpeaker = !prev.isSpeaker;
      agoraService.setSpeaker(nextSpeaker);
      return { ...prev, isSpeaker: nextSpeaker };
    });
  }, []);

  const toggleCamera = useCallback(() => {
    setCallSession((prev) => {
      if (!prev) return null;
      const nextEnabled = !prev.isVideoEnabled;
      agoraService.setVideoEnabled(nextEnabled);
      return { ...prev, isVideoEnabled: nextEnabled };
    });
  }, []);

  const switchCamera = useCallback(() => {
    setCallSession((prev) => {
      if (!prev) return null;
      agoraService.switchCamera();
      return { ...prev, isFrontCamera: !prev.isFrontCamera };
    });
  }, []);

  return (
    <CallContext.Provider
      value={{
        callSession,
        startCall,
        acceptCall,
        rejectCall,
        endCall,
        toggleMute,
        toggleSpeaker,
        toggleCamera,
        switchCamera,
      }}
    >
      {children}
    </CallContext.Provider>
  );
};

export const useCall = (): CallContextType => {
  const context = useContext(CallContext);
  if (!context) {
    throw new Error('useCall must be used within a CallProvider');
  }
  return context;
};
