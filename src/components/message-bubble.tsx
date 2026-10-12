import { Image } from 'expo-image';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { VibeIcon } from './vibe-ui';

import { VibeColors } from '../constants/theme';

export function MessageBubble({
  text,
  isMine,
  time,
  seen = false,
  attachment,
}: {
  text: string;
  isMine: boolean;
  time: string;
  seen?: boolean;
  attachment?: {
    type: 'image' | 'document';
    name: string;
    url?: string;
    unavailable: boolean;
    isCaption: boolean;
    onPress?: () => void;
  };
}) {
  return (
    <View style={[styles.wrapper, isMine ? styles.wrapperMine : styles.wrapperOther]}>
      <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleOther]}>
        {attachment?.type === 'image' && (
          attachment.url ? (
            <Image source={{ uri: attachment.url }} style={styles.attachmentImage} contentFit="cover" />
          ) : (
            <View style={styles.attachmentPlaceholder}>
              {attachment.unavailable ? <VibeIcon name="close" color={VibeColors.danger} size={20} /> : <ActivityIndicator size="small" color={VibeColors.primary} />}
              <Text style={styles.attachmentStatus}>{attachment.unavailable ? 'Photo unavailable' : 'Loading photo'}</Text>
            </View>
          )
        )}
        {attachment?.type === 'document' && (
          <TouchableOpacity
            style={styles.documentCard}
            disabled={!attachment.onPress}
            onPress={attachment.onPress}
            activeOpacity={0.78}
          >
            <View style={styles.documentIcon}><VibeIcon name="document" color="#167A67" size={20} /></View>
            <View style={styles.documentCopy}>
              <Text style={styles.documentName} numberOfLines={2}>{attachment.name}</Text>
              <Text style={styles.attachmentStatus}>
                {attachment.unavailable ? 'Document unavailable' : attachment.url ? 'Tap to open' : 'Loading document'}
              </Text>
            </View>
            {!attachment.url && !attachment.unavailable && <ActivityIndicator size="small" color={VibeColors.primary} />}
          </TouchableOpacity>
        )}
        {(!attachment || attachment.isCaption) && <Text style={[styles.text, isMine && styles.textMine]}>{text}</Text>}
        <View style={styles.metaRow}>
          <Text style={[styles.time, isMine && styles.timeMine]}>{time}</Text>
          {isMine && <Text style={[styles.tick, seen && styles.tickSeen]}>{seen ? '✓✓' : '✓'}</Text>}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    maxWidth: '78%',
    marginVertical: 4,
  },
  wrapperMine: {
    alignSelf: 'flex-end',
  },
  wrapperOther: {
    alignSelf: 'flex-start',
  },
  bubble: {
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingTop: 11,
    paddingBottom: 8,
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  attachmentImage: {
    width: 230,
    height: 190,
    maxWidth: '100%',
    borderRadius: 15,
    marginBottom: 2,
  },
  attachmentPlaceholder: {
    width: 210,
    minHeight: 118,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 15,
    backgroundColor: '#F1F3F7',
  },
  documentCard: {
    minWidth: 190,
    maxWidth: 240,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: 14,
    backgroundColor: '#F3F5F7',
  },
  documentIcon: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#E8F7F3',
  },
  documentCopy: { flex: 1, minWidth: 0 },
  documentName: { color: VibeColors.text, fontSize: 12, fontWeight: '700' },
  attachmentStatus: { color: VibeColors.textSecondary, fontSize: 10 },
  bubbleMine: {
    backgroundColor: VibeColors.primary,
    borderBottomRightRadius: 9,
  },
  bubbleOther: {
    backgroundColor: '#FFFFFF',
    borderBottomLeftRadius: 9,
  },
  text: {
    color: VibeColors.text,
    fontSize: 15,
    lineHeight: 21,
  },
  textMine: {
    color: '#FFFFFF',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 4,
    gap: 4,
  },
  time: {
    fontSize: 10,
    color: VibeColors.textSecondary,
  },
  timeMine: {
    color: 'rgba(255,255,255,0.82)',
  },
  tick: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.82)',
    fontWeight: '700',
  },
  tickSeen: {
    color: '#E0E7FF',
  },
});
