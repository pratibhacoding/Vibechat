import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  Dimensions,
  Modal,
  Platform,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { RtcSurfaceView } from 'react-native-agora';

import { useCall } from '../context/call-context';
import { VibeAvatar } from './vibe-ui';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

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
    toggleCamera,
    switchCamera,
  } = useCall();

  if (!callSession) return null;

  const isVideo = callSession.callType === 'video';
  const isIncoming = callSession.status === 'ringing' && callSession.role === 'callee';
  const isConnected = callSession.status === 'connected';

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
        {/* VIDEO CALL CONNECTED VIEW */}
        {isVideo && isConnected && Platform.OS !== 'web' ? (
          <View style={StyleSheet.absoluteFill}>
            {/* Remote Video Stream (Fullscreen background) */}
            {callSession.remoteUid ? (
              <RtcSurfaceView
                canvas={{ uid: callSession.remoteUid }}
                style={StyleSheet.absoluteFill}
              />
            ) : (
              <View style={[StyleSheet.absoluteFill, styles.videoWaitingOverlay]}>
                <VibeAvatar
                  name={callSession.otherUserName}
                  photoURL={callSession.otherUserAvatar}
                  size={100}
                />
                <Text style={styles.videoWaitingText}>Waiting for video...</Text>
              </View>
            )}

            {/* Local Video Stream (Picture-in-Picture) */}
            {callSession.isVideoEnabled && (
              <View style={styles.pipContainer}>
                <RtcSurfaceView
                  canvas={{ uid: 0 }}
                  style={styles.pipVideo}
                  zOrderMediaOverlay={true}
                />
              </View>
            )}
          </View>
        ) : (
          /* VOICE OR CALLING / RINGING BACKGROUND */
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
          </View>
        )}

        {/* OVERLAY HEADER (Name + Timer for connected video) */}
        {isVideo && isConnected && (
          <SafeAreaView style={styles.videoHeaderOverlay}>
            <View style={styles.videoHeaderContent}>
              <Text style={styles.videoHeaderName} numberOfLines={1}>
                {callSession.otherUserName}
              </Text>
              <Text style={styles.videoHeaderTimer}>{statusText}</Text>
            </View>
          </SafeAreaView>
        )}

        {/* CONTROLS AT BOTTOM */}
        <SafeAreaView style={styles.controlsSafeArea}>
          {isIncoming ? (
            /* INCOMING CALL CONTROLS: DECLINE & ACCEPT */
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
                <Ionicons
                  name={isVideo ? 'videocam' : 'call'}
                  size={32}
                  color="#FFFFFF"
                />
                <Text style={styles.btnLabel}>Accept</Text>
              </TouchableOpacity>
            </View>
          ) : (
            /* ACTIVE / OUTGOING CALL CONTROLS */
            <View style={styles.activeControlsPill}>
              {/* Mute Button */}
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

              {/* Speaker Button */}
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

              {/* Video Specific: Toggle Camera Video */}
              {isVideo && (
                <TouchableOpacity
                  style={[
                    styles.controlIconBtn,
                    !callSession.isVideoEnabled && styles.controlIconBtnActive,
                  ]}
                  onPress={toggleCamera}
                  accessibilityRole="button"
                  accessibilityLabel={callSession.isVideoEnabled ? 'Turn off camera' : 'Turn on camera'}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name={callSession.isVideoEnabled ? 'videocam' : 'videocam-off'}
                    size={24}
                    color={!callSession.isVideoEnabled ? '#EF4444' : '#FFFFFF'}
                  />
                </TouchableOpacity>
              )}

              {/* Video Specific: Switch Front/Back Camera */}
              {isVideo && (
                <TouchableOpacity
                  style={styles.controlIconBtn}
                  onPress={switchCamera}
                  accessibilityRole="button"
                  accessibilityLabel="Switch camera"
                  activeOpacity={0.8}
                >
                  <Ionicons name="camera-reverse" size={24} color="#FFFFFF" />
                </TouchableOpacity>
              )}

              {/* End Call Button */}
              <TouchableOpacity
                style={[styles.actionBtn, styles.endCallBtn]}
                onPress={endCall}
                accessibilityRole="button"
                accessibilityLabel="End call"
                activeOpacity={0.8}
              >
                <Ionicons name="call" size={30} color="#FFFFFF" style={{ transform: [{ rotate: '135deg' }] }} />
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
    backgroundColor: '#090D16',
    justifyContent: 'space-between',
  },
  nonConnectedWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  avatarGlow: {
    padding: 12,
    borderRadius: 80,
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    marginBottom: 24,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 8,
  },
  userName: {
    fontSize: 26,
    fontWeight: '700',
    color: '#F8FAFC',
    textAlign: 'center',
    marginBottom: 8,
  },
  statusBadge: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  statusText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#CBD5E1',
  },
  videoWaitingOverlay: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0F172A',
  },
  videoWaitingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#94A3B8',
    fontWeight: '500',
  },
  pipContainer: {
    position: 'absolute',
    top: 60,
    right: 20,
    width: 110,
    height: 160,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    backgroundColor: '#1E293B',
  },
  pipVideo: {
    width: '100%',
    height: '100%',
  },
  videoHeaderOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  videoHeaderContent: {
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  videoHeaderName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  videoHeaderTimer: {
    fontSize: 14,
    color: '#E2E8F0',
    marginTop: 2,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  controlsSafeArea: {
    width: '100%',
    paddingBottom: Platform.OS === 'android' ? 32 : 16,
  },
  incomingControls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: 36,
  },
  activeControlsPill: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
    backgroundColor: 'rgba(30, 41, 59, 0.85)',
    marginHorizontal: 20,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 40,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  actionBtn: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptBtn: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#10B981',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  declineBtn: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#EF4444',
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  endCallBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#EF4444',
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  btnLabel: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: '600',
    color: '#E2E8F0',
  },
  controlIconBtn: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlIconBtnActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.28)',
  },
});
