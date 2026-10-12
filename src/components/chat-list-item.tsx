import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { VibeColors } from '../constants/theme';
import { Avatar } from './avatar';
import { VibeIcon } from './vibe-ui';

export function ChatListItem({
  name,
  preview,
  time,
  unreadCount = 0,
  online = false,
  isActive = false,
  pinned = false,
  onTogglePinned,
  onPress,
}: {
  name: string;
  preview: string;
  time: string;
  unreadCount?: number;
  online?: boolean;
  isActive?: boolean;
  pinned?: boolean;
  onTogglePinned?: () => void;
  onPress: () => void;
}) {
  return (
    <View style={[styles.row, isActive && styles.rowActive]}>
      <TouchableOpacity style={styles.chatButton} onPress={onPress} activeOpacity={0.78}>
        <Avatar name={name} size={48} online={online} />
        <View style={styles.content}>
          <View style={styles.headerRow}>
            <Text style={[styles.name, unreadCount > 0 && styles.nameUnread]} numberOfLines={1}>{name}</Text>
            <Text style={[styles.time, unreadCount > 0 && styles.timeUnread]}>{time}</Text>
          </View>

          <View style={styles.previewRow}>
            <Text style={[styles.preview, unreadCount > 0 && styles.previewUnread]} numberOfLines={1}>
              {preview}
            </Text>
            {unreadCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{unreadCount}</Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
      {onTogglePinned && (
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={pinned ? `Unpin ${name}` : `Pin ${name}`}
          accessibilityState={{ selected: pinned }}
          style={[styles.pinButton, pinned && styles.pinButtonActive]}
          onPress={onTogglePinned}
          activeOpacity={0.75}
        >
          <VibeIcon name="pin" color={pinned ? VibeColors.primary : VibeColors.textSecondary} size={18} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 14,
    marginBottom: 10,
    minHeight: 84,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#EAEBF2',
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 1,
  },
  rowActive: {
    backgroundColor: '#FCFBFF',
    borderColor: '#DDD9FF',
  },
  chatButton: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    marginLeft: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  name: {
    fontSize: 15,
    fontWeight: '700',
    color: VibeColors.text,
    flexShrink: 1,
    marginRight: 8,
  },
  nameUnread: {
    color: VibeColors.text,
  },
  time: {
    fontSize: 10,
    color: VibeColors.textSecondary,
    fontWeight: '500',
  },
  timeUnread: {
    color: VibeColors.primary,
    fontWeight: '700',
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 20,
  },
  preview: {
    flex: 1,
    fontSize: 13,
    color: VibeColors.textSecondary,
    marginRight: 8,
  },
  previewUnread: {
    color: VibeColors.text,
    fontWeight: '600',
  },
  badge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    backgroundColor: VibeColors.primary,
    shadowColor: '#5B5CE6',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  pinButton: {
    width: 38,
    height: 38,
    marginLeft: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 19,
    backgroundColor: '#F3F4F8',
  },
  pinButtonActive: {
    backgroundColor: '#F3E8FF',
  },
});
