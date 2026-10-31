import { Image } from 'expo-image';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { VibeColors } from '../constants/theme';
import { VibeIcon } from './vibe-ui';
import { VoicePlayer } from './voice-player';

export type MessageReply = {
  id: string;
  text: string;
  senderId: string;
  senderName?: string;
};

export function MessageBubble({
  text,
  isMine,
  time,
  seen = false,
  senderName,
  senderAvatar,
  replyTo,
  reactions,
  currentUserId,
  attachment,
  onLongPress,
  onReactionPress,
}: {
  text: string;
  isMine: boolean;
  time: string;
  seen?: boolean;
  senderName?: string;
  senderAvatar?: string | null;
  replyTo?: MessageReply;
  reactions?: Record<string, string>;
  currentUserId?: string;
  attachment?: {
    type: 'image' | 'document' | 'audio';
    name: string;
    url?: string;
    unavailable: boolean;
    isCaption: boolean;
    duration?: number;
    onPress?: () => void;
  };
  onLongPress?: () => void;
  onReactionPress?: (emoji: string) => void;
}) {
  // Aggregate reactions by emoji
  const reactionCounts: Record<string, { count: number; users: string[] }> = {};
  if (reactions) {
    Object.entries(reactions).forEach(([uid, emoji]) => {
      if (!emoji) return;
      if (!reactionCounts[emoji]) {
        reactionCounts[emoji] = { count: 0, users: [] };
      }
      reactionCounts[emoji].count += 1;
      reactionCounts[emoji].users.push(uid);
    });
  }
  const hasReactions = Object.keys(reactionCounts).length > 0;

  return (
    <View style={[styles.wrapper, isMine ? styles.wrapperMine : styles.wrapperOther]}>
      <TouchableOpacity
        activeOpacity={0.9}
        onLongPress={onLongPress}
        delayLongPress={260}
        style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleOther]}
      >
        {senderName && !isMine && (
          <View style={styles.senderHeaderRow}>
            {senderAvatar !== undefined && (
              senderAvatar ? (
                <Image source={{ uri: senderAvatar }} style={styles.senderAvatar} contentFit="cover" />
              ) : (
                <View style={styles.senderAvatarFallback}>
                  <Text style={styles.senderAvatarText}>{(senderName || '?').charAt(0).toUpperCase()}</Text>
                </View>
              )
            )}
            <Text style={styles.senderHeader} numberOfLines={1}>{senderName}</Text>
          </View>
        )}

        {replyTo && (
          <View style={[styles.replyBox, isMine ? styles.replyBoxMine : styles.replyBoxOther]}>
            <View style={[styles.replyLine, { backgroundColor: isMine ? '#FFFFFF' : VibeColors.primary }]} />
            <View style={styles.replyDetails}>
              <Text style={[styles.replyAuthor, isMine ? styles.replyAuthorMine : styles.replyAuthorOther]} numberOfLines={1}>
                {replyTo.senderName || 'Replied message'}
              </Text>
              <Text style={[styles.replySnippet, isMine ? styles.replySnippetMine : styles.replySnippetOther]} numberOfLines={2}>
                {replyTo.text}
              </Text>
            </View>
          </View>
        )}

        {attachment?.type === 'image' && (
          attachment.url ? (
            <Image source={{ uri: attachment.url }} style={styles.attachmentImage} contentFit="cover" />
          ) : (
            <View style={styles.attachmentPlaceholder}>
              {attachment.unavailable ? (
                <VibeIcon name="close" color={VibeColors.danger} size={20} />
              ) : (
                <ActivityIndicator size="small" color={isMine ? '#FFFFFF' : VibeColors.primary} />
              )}
              <Text style={[styles.attachmentStatus, isMine && { color: 'rgba(255,255,255,0.8)' }]}>
                {attachment.unavailable ? 'Photo unavailable' : 'Loading photo...'}
              </Text>
            </View>
          )
        )}

        {attachment?.type === 'audio' && (
          <VoicePlayer
            url={attachment.url}
            duration={attachment.duration}
            isMine={isMine}
            unavailable={attachment.unavailable}
          />
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
                {attachment.unavailable ? 'Document unavailable' : attachment.url ? 'Tap to open' : 'Loading document...'}
              </Text>
            </View>
            {!attachment.url && !attachment.unavailable && <ActivityIndicator size="small" color={VibeColors.primary} />}
          </TouchableOpacity>
        )}

        {(!attachment || attachment.isCaption) && (
          <Text style={[styles.text, isMine && styles.textMine]}>{text}</Text>
        )}

        <View style={styles.metaRow}>
          <Text style={[styles.time, isMine && styles.timeMine]}>{time}</Text>
          {isMine && <Text style={[styles.tick, seen && styles.tickSeen]}>{seen ? '✓✓' : '✓'}</Text>}
        </View>
      </TouchableOpacity>

      {hasReactions && (
        <View style={[styles.reactionsRow, isMine ? styles.reactionsRowMine : styles.reactionsRowOther]}>
          {Object.entries(reactionCounts).map(([emoji, data]) => {
            const iReacted = Boolean(currentUserId && data.users.includes(currentUserId));
            return (
              <TouchableOpacity
                key={emoji}
                onPress={() => onReactionPress?.(emoji)}
                style={[
                  styles.reactionBadge,
                  iReacted && styles.reactionBadgeActive,
                ]}
                activeOpacity={0.75}
              >
                <Text style={styles.reactionEmoji}>{emoji}</Text>
                {data.count > 1 && <Text style={[styles.reactionCount, iReacted && styles.reactionCountActive]}>{data.count}</Text>}
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    maxWidth: '75%',
    marginVertical: 3,
  },
  wrapperMine: {
    alignSelf: 'flex-end',
  },
  wrapperOther: {
    alignSelf: 'flex-start',
  },
  bubble: {
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 6,
    shadowColor: '#0F172A',
    shadowOpacity: 0.05,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  senderHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: 6,
  },
  senderAvatar: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  senderAvatarFallback: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  senderAvatarText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#6366F1',
  },
  senderHeader: {
    color: '#6366F1',
    fontSize: 12,
    fontWeight: '700',
  },
  replyBox: {
    flexDirection: 'row',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 5,
    marginBottom: 6,
    overflow: 'hidden',
  },
  replyBoxMine: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  replyBoxOther: {
    backgroundColor: '#F3F4F8',
  },
  replyLine: {
    width: 3.5,
    borderRadius: 2,
    marginRight: 8,
  },
  replyDetails: {
    flex: 1,
  },
  replyAuthor: {
    fontSize: 11,
    fontWeight: '700',
  },
  replyAuthorMine: {
    color: '#FFFFFF',
  },
  replyAuthorOther: {
    color: '#6366F1',
  },
  replySnippet: {
    fontSize: 12,
    marginTop: 1,
  },
  replySnippetMine: {
    color: 'rgba(255, 255, 255, 0.85)',
  },
  replySnippetOther: {
    color: '#64748B',
  },
  attachmentImage: {
    width: 230,
    height: 190,
    maxWidth: '100%',
    borderRadius: 14,
    marginBottom: 4,
  },
  attachmentPlaceholder: {
    width: 210,
    minHeight: 118,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
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
    marginBottom: 4,
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
  documentName: { color: '#0F172A', fontSize: 12, fontWeight: '700' },
  attachmentStatus: { color: '#64748B', fontSize: 10 },
  bubbleMine: {
    backgroundColor: '#6366F1',
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    backgroundColor: '#FFFFFF',
    borderBottomLeftRadius: 4,
  },
  text: {
    color: '#0F172A',
    fontSize: 15,
    lineHeight: 20,
  },
  textMine: {
    color: '#FFFFFF',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 2,
    gap: 4,
  },
  time: {
    fontSize: 10,
    color: '#64748B',
  },
  timeMine: {
    color: 'rgba(255, 255, 255, 0.75)',
  },
  tick: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.75)',
    fontWeight: '700',
  },
  tickSeen: {
    color: '#FFFFFF',
  },
  reactionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: -8,
    zIndex: 3,
  },
  reactionsRowMine: {
    justifyContent: 'flex-end',
    marginRight: 6,
  },
  reactionsRowOther: {
    justifyContent: 'flex-start',
    marginLeft: 6,
  },
  reactionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  reactionBadgeActive: {
    backgroundColor: '#EEF2FF',
    borderColor: VibeColors.primary,
  },
  reactionEmoji: {
    fontSize: 13,
  },
  reactionCount: {
    fontSize: 11,
    fontWeight: '700',
    color: VibeColors.textSecondary,
  },
  reactionCountActive: {
    color: VibeColors.primary,
  },
});

