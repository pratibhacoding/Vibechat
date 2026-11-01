import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  Modal,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { useCall } from '../context/call-context';
import { VibeAvatar } from './vibe-ui';

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export function CallModal() {
  const {
    callSession,
    acceptCall,
    rejectCall,
    endCall,
    toggleMute,
    toggleSpeaker,
  } = useCall();

  if (!callSession) return null;

  const isIncoming = callSession.status === 'ringing' && callSession.role === 'callee';
  const isVideo = callSession.callType === 'video';

  let statusText = 'Calling...';
  if (callSession.status === 'ringing') {
    statusText = isIncoming
      ? isVideo
        ? 'Incoming Video Call...'
        : 'Incoming Voice Call...'
      : 'Ringing...';
  } else if (callSession.status === 'connected') {
    statusText = formatDuration(callSession.duration);
  } else if (callSession.status === 'rejected') {
    statusText = 'Call Declined';
  } else if (callSession.status === 'busy') {
    statusText = 'User Busy';
  } else if (callSession.status === 'missed') {
    statusText = 'Call Missed';
  } else if (callSession.status === 'ended') {
    statusText = 'Call Ended';
  }

  return (
    <Modal
      visible={Boolean(callSession)}
      animationType="fade"
      transparent={false}
      statusBarTranslucent
      onRequestClose={endCall}
    >
      <StatusBar barStyle="light-content" backgroundColor="#0F172A" />
      <View style={styles.container}>
        <View style={styles.nonConnectedWrap}>
          <View style={styles.avatarGlow}>
            <VibeAvatar
              name={callSession.otherUserName}
              photoURL={callSession.otherUserAvatar}
              size={120}
            />
          </View>

          <Text style={styles.userName} numberOfLines={1}>
            {callSession.otherUserName}
          </Text>

          <View style={styles.statusBadge}>
            <Text style={styles.statusText}>{statusText}</Text>
          </View>

          <Text style={styles.webNotice}>
            {isVideo
              ? 'Video calls are not supported in the web build.'
              : 'Voice calls are unavailable in the web build.'}
          </Text>
        </View>

        <SafeAreaView style={styles.controlsSafeArea}>
          {isIncoming ? (
            <View style={styles.incomingControls}>
              <TouchableOpacity
                style={[styles.actionBtn, styles.declineBtn]}
                onPress={rejectCall}
                accessibilityRole="button"
                accessibilityLabel="Decline call"
                activeOpacity={0.8}
              >
                <Ionicons name="call" size={32} color="#FFFFFF" style={{ transform: [{ rotate: '135deg' }] }} />
                <Text style={styles.btnLabel}>Decline</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionBtn, styles.acceptBtn]}
                onPress={acceptCall}
                accessibilityRole="button"
                accessibilityLabel="Accept call"
                activeOpacity={0.8}
              >
                <Ionicons name={isVideo ? 'videocam' : 'call'} size={32} color="#FFFFFF" />
                <Text style={styles.btnLabel}>Accept</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.activeControlsPill}>
              <TouchableOpacity
                style={[styles.controlIconBtn, callSession.isMuted && styles.controlIconBtnActive]}
                onPress={toggleMute}
                accessibilityRole="button"
                accessibilityLabel={callSession.isMuted ? 'Unmute microphone' : 'Mute microphone'}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={callSession.isMuted ? 'mic-off' : 'mic'}
                  size={24}
                  color={callSession.isMuted ? '#EF4444' : '#FFFFFF'}
                />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.controlIconBtn, callSession.isSpeaker && styles.controlIconBtnActive]}
                onPress={toggleSpeaker}
                accessibilityRole="button"
                accessibilityLabel={callSession.isSpeaker ? 'Speakerphone on' : 'Speakerphone off'}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={callSession.isSpeaker ? 'volume-high' : 'volume-medium'}
                  size={24}
                  color={callSession.isSpeaker ? '#38BDF8' : '#FFFFFF'}
                />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.controlIconBtn}
                onPress={endCall}
                accessibilityRole="button"
                accessibilityLabel="End call"
                activeOpacity={0.8}
              >
                <Ionicons name="call" size={24} color="#FFFFFF" style={{ transform: [{ rotate: '135deg' }] }} />
              </TouchableOpacity>
            </View>
          )}
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
    justifyContent: 'center',
  },
  nonConnectedWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  avatarGlow: {
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: 'rgba(148,163,184,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userName: {
    marginTop: 24,
    fontSize: 28,
    fontWeight: '700',
    color: '#F8FAFC',
    textAlign: 'center',
  },
  statusBadge: {
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
  },
  statusText: {
    color: '#E2E8F0',
    fontSize: 16,
    fontWeight: '600',
  },
  webNotice: {
    marginTop: 14,
    color: '#94A3B8',
    fontSize: 14,
    textAlign: 'center',
  },
  controlsSafeArea: {
    paddingBottom: 28,
    alignItems: 'center',
  },
  incomingControls: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
  },
  actionBtn: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  declineBtn: {
    backgroundColor: '#EF4444',
  },
  acceptBtn: {
    backgroundColor: '#22C55E',
  },
  btnLabel: {
    marginTop: 8,
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  activeControlsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 999,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
  },
  controlIconBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(148, 163, 184, 0.25)',
  },
  controlIconBtnActive: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
  },
});
