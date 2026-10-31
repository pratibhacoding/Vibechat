import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { VibeColors } from '../constants/theme';
import { VibeIcon } from './vibe-ui';

function formatDuration(seconds: number): string {
  if (!seconds || isNaN(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export function VoicePlayer({
  url,
  duration = 0,
  isMine = false,
  unavailable = false,
}: {
  url?: string;
  duration?: number;
  isMine?: boolean;
  unavailable?: boolean;
}) {
  const player = useAudioPlayer(url || null);
  const status = useAudioPlayerStatus(player);

  const isPlaying = status.playing;
  const currentTime = status.currentTime || 0;
  const totalDuration = (status.duration && status.duration > 0) ? status.duration : duration;

  const togglePlay = () => {
    if (!url || unavailable) return;
    if (isPlaying) {
      player.pause();
    } else {
      if (status.didJustFinish || (totalDuration > 0 && currentTime >= totalDuration - 0.2)) {
        player.seekTo(0);
      }
      player.play();
    }
  };

  const progressPercent = totalDuration > 0 ? Math.min(100, Math.max(0, (currentTime / totalDuration) * 100)) : 0;

  const primaryColor = isMine ? '#FFFFFF' : VibeColors.primary;
  const trackBg = isMine ? 'rgba(255,255,255,0.28)' : 'rgba(99,102,241,0.18)';
  const textColor = isMine ? 'rgba(255,255,255,0.9)' : VibeColors.textSecondary;

  if (unavailable) {
    return (
      <View style={styles.container}>
        <View style={[styles.playButton, { backgroundColor: trackBg }]}>
          <VibeIcon name="close" color={VibeColors.danger} size={16} />
        </View>
        <Text style={[styles.timeText, { color: VibeColors.danger }]}>Audio unavailable</Text>
      </View>
    );
  }

  if (!url) {
    return (
      <View style={styles.container}>
        <View style={[styles.playButton, { backgroundColor: trackBg }]}>
          <ActivityIndicator size="small" color={primaryColor} />
        </View>
        <Text style={[styles.timeText, { color: textColor }]}>Loading voice note...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.playButton, { backgroundColor: trackBg }]}
        onPress={togglePlay}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel={isPlaying ? 'Pause voice message' : 'Play voice message'}
      >
        <VibeIcon
          name={isPlaying ? 'close' : 'call'}
          color={primaryColor}
          size={16}
        />
      </TouchableOpacity>

      <View style={styles.waveformContainer}>
        <View style={[styles.track, { backgroundColor: trackBg }]}>
          <View style={[styles.progress, { width: `${progressPercent}%`, backgroundColor: primaryColor }]} />
        </View>
        <View style={styles.metaRow}>
          <Text style={[styles.timeText, { color: textColor }]}>
            {isPlaying ? formatDuration(currentTime) : formatDuration(totalDuration)}
          </Text>
          <Text style={[styles.badgeText, { color: textColor }]}>Voice note</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 190,
    maxWidth: 240,
    paddingVertical: 4,
  },
  playButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  waveformContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  track: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 4,
  },
  progress: {
    height: '100%',
    borderRadius: 2,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  timeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '500',
    opacity: 0.8,
  },
});
