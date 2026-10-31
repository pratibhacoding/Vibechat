import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useAppTheme } from '../context/theme-context';
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
  photoURL,
  isGroup = false,
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
  photoURL?: string | null;
  isGroup?: boolean;
  onTogglePinned?: () => void;
  onPress: () => void;
}) {
  const { colors, isDark } = useAppTheme();

  return (
    <View
      style={[
        styles.row,
        {
          backgroundColor: isActive ? (isDark ? colors.surfaceSubtle : '#FCFBFF') : colors.surface,
          borderColor: isActive ? colors.primarySoft : colors.border,
        },
      ]}
    >
      <TouchableOpacity style={styles.chatButton} onPress={onPress} activeOpacity={0.78}>
        <Avatar name={name} size={48} online={!isGroup && online} photoURL={photoURL} />
        <View style={styles.content}>
          <View style={styles.headerRow}>
            <View style={styles.nameContainer}>
              <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
                {name}
              </Text>
              {isGroup && (
                <View style={[styles.groupBadge, { backgroundColor: colors.primarySoft }]}>
                  <Text style={[styles.groupBadgeText, { color: colors.primary }]}>Group</Text>
                </View>
              )}
            </View>
            <Text style={[styles.time, { color: unreadCount > 0 ? colors.primary : colors.textSecondary }]}>
              {time}
            </Text>
          </View>

          <View style={styles.previewRow}>
            <Text
              style={[
                styles.preview,
                {
                  color: unreadCount > 0 ? colors.text : colors.textSecondary,
                  fontWeight: unreadCount > 0 ? '600' : '400',
                },
              ]}
              numberOfLines={1}
            >
              {preview}
            </Text>
            {unreadCount > 0 && (
              <View style={[styles.badge, { backgroundColor: colors.primary }]}>
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
          style={[
            styles.pinButton,
            {
              backgroundColor: pinned
                ? (isDark ? 'rgba(99, 102, 241, 0.25)' : '#F3E8FF')
                : colors.surfaceSubtle,
            },
          ]}
          onPress={onTogglePinned}
          activeOpacity={0.75}
        >
          <VibeIcon name="pin" color={pinned ? colors.primary : colors.textSecondary} size={18} />
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
    borderRadius: 20,
    borderWidth: 1,
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 1,
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
  nameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    marginRight: 8,
    gap: 6,
  },
  name: {
    fontSize: 15,
    fontWeight: '700',
    flexShrink: 1,
  },
  groupBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  groupBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  time: {
    fontSize: 10,
    fontWeight: '500',
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
    marginRight: 8,
  },
  badge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
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
  },
});
