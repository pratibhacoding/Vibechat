import { Feather, Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { VibeAvatar } from '../components/vibe-ui';
import { VibeIcon } from '../components/vibe-ui';
import { useCall } from '../context/call-context';
import { useAppTheme } from '../context/theme-context';
import { supabase } from '../supabase';

type CallRecordItem = {
  id: string;
  channelId: string;
  callerId: string;
  receiverId: string;
  chatId?: string | null;
  callType: 'voice' | 'video';
  status: 'calling' | 'ringing' | 'accepted' | 'rejected' | 'missed' | 'busy' | 'ended' | 'cancelled';
  startedAt: string;
  acceptedAt?: string | null;
  endedAt?: string | null;
  durationSeconds: number;
  // Resolved other user
  otherUserId: string;
  otherUserName: string;
  otherUserAvatar?: string | null;
  isOutgoing: boolean;
  isMissed: boolean;
};

function formatCallTimestamp(dateStr: string): string {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '';
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });

  if (isToday) return `Today, ${timeStr}`;
  if (isYesterday) return `Yesterday, ${timeStr}`;
  return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${timeStr}`;
}

function formatCallDuration(seconds?: number): string {
  if (!seconds || seconds <= 0) return '';
  const mins = Math.floor(seconds / 60);
  const remainingSecs = seconds % 60;
  if (mins === 0) return `${remainingSecs}s`;
  return `${mins}m ${remainingSecs}s`;
}

export default function CallsScreen() {
  const { colors, isDark } = useAppTheme();
  const { startCall } = useCall();

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [calls, setCalls] = useState<CallRecordItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState<'all' | 'missed'>('all');

  // Fetch current user and calls
  const fetchCalls = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        setRefreshing(false);
        return;
      }

      setCurrentUserId(user.id);

      // Fetch calls where user is caller or receiver
      const { data: rawCalls, error: callsErr } = await supabase
        .from('call_records')
        .select('*')
        .or(`caller_id.eq.${user.id},receiver_id.eq.${user.id}`)
        .order('started_at', { ascending: false })
        .limit(100);

      if (callsErr) {
        console.warn('Could not fetch call records:', callsErr);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      if (!rawCalls || rawCalls.length === 0) {
        setCalls([]);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      // Collect IDs of contact profiles needed
      const contactIds = Array.from(
        new Set(
          rawCalls.map((c) => (c.caller_id === user.id ? c.receiver_id : c.caller_id))
        )
      );

      // Fetch profiles in batch
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url')
        .in('id', contactIds);

      const profileMap = new Map<string, { name: string; avatar?: string | null }>();
      profiles?.forEach((p) => {
        profileMap.set(p.id, {
          name: p.full_name || 'Vibe User',
          avatar: p.avatar_url || null,
        });
      });

      const formatted: CallRecordItem[] = rawCalls.map((c) => {
        const isOutgoing = c.caller_id === user.id;
        const otherId = isOutgoing ? c.receiver_id : c.caller_id;
        const profile = profileMap.get(otherId);
        const isMissed =
          !isOutgoing &&
          ['missed', 'rejected', 'busy', 'cancelled', 'ringing'].includes(c.status);

        return {
          id: c.id,
          channelId: c.channel_id,
          callerId: c.caller_id,
          receiverId: c.receiver_id,
          chatId: c.chat_id,
          callType: c.call_type || 'voice',
          status: c.status,
          startedAt: c.started_at,
          acceptedAt: c.accepted_at,
          endedAt: c.ended_at,
          durationSeconds: c.duration_seconds || 0,
          otherUserId: otherId,
          otherUserName: profile?.name || 'Vibe User',
          otherUserAvatar: profile?.avatar || null,
          isOutgoing,
          isMissed,
        };
      });

      setCalls(formatted);
    } catch (err) {
      console.warn('Exception fetching call history:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void fetchCalls();
  }, [fetchCalls]);

  // Realtime subscription for call_records updates
  useEffect(() => {
    const channel = supabase
      .channel('public:call_records')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'call_records' },
        () => {
          void fetchCalls();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchCalls]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void fetchCalls();
  }, [fetchCalls]);

  // Filtered calls
  const filteredCalls = useMemo(() => {
    return calls.filter((call) => {
      if (filterTab === 'missed' && !call.isMissed) {
        return false;
      }
      if (searchQuery.trim().length > 0) {
        const query = searchQuery.toLowerCase().trim();
        return call.otherUserName.toLowerCase().includes(query);
      }
      return true;
    });
  }, [calls, filterTab, searchQuery]);

  // Tap record -> navigate to chat
  const handleOpenChat = (call: CallRecordItem) => {
    router.push({
      pathname: '/chat',
      params: {
        uid: call.otherUserId,
        name: call.otherUserName,
        photoURL: call.otherUserAvatar || '',
        chatId: call.chatId || '',
      },
    });
  };

  // Call back handler
  const handleCallBack = (call: CallRecordItem, type: 'voice' | 'video') => {
    void startCall(
      call.otherUserId,
      call.otherUserName,
      call.otherUserAvatar,
      type,
      call.chatId || undefined
    );
  };

  const renderCallItem = ({ item }: { item: CallRecordItem }) => {
    const isVideo = item.callType === 'video';
    const duration = formatCallDuration(item.durationSeconds);
    const timeFormatted = formatCallTimestamp(item.startedAt);

    // Call state badge / subtitle
    let statusLabel = '';
    if (item.isMissed) {
      statusLabel = 'Missed';
    } else if (item.isOutgoing) {
      statusLabel = duration ? `Outgoing · ${duration}` : 'Outgoing';
    } else {
      statusLabel = duration ? `Incoming · ${duration}` : 'Incoming';
    }

    return (
      <TouchableOpacity
        style={[styles.callItem, { backgroundColor: colors.surface }]}
        onPress={() => handleOpenChat(item)}
        activeOpacity={0.7}
      >
        <VibeAvatar
          name={item.otherUserName}
          photoURL={item.otherUserAvatar}
          size={50}
        />

        <View style={styles.callDetails}>
          <Text style={[styles.contactName, { color: item.isMissed ? '#EF4444' : colors.text }]} numberOfLines={1}>
            {item.otherUserName}
          </Text>

          <View style={styles.callMetaRow}>
            {/* Direction Indicator Arrow */}
            {item.isMissed ? (
              <Ionicons name="arrow-down-outline" size={14} color="#EF4444" style={styles.metaIcon} />
            ) : item.isOutgoing ? (
              <Ionicons name="arrow-up-outline" size={14} color="#10B981" style={styles.metaIcon} />
            ) : (
              <Ionicons name="arrow-down-outline" size={14} color="#6366F1" style={styles.metaIcon} />
            )}

            {/* Call type icon (video or audio) */}
            <Ionicons
              name={isVideo ? 'videocam' : 'call'}
              size={13}
              color={item.isMissed ? '#EF4444' : colors.textSecondary}
              style={{ marginRight: 6 }}
            />

            <Text style={[styles.callMetaText, { color: item.isMissed ? '#EF4444' : colors.textSecondary }]}>
              {statusLabel} · {timeFormatted}
            </Text>
          </View>
        </View>

        {/* Action Call Buttons on the right edge */}
        <View style={styles.actionButtonsRow}>
          <TouchableOpacity
            style={[styles.callBtn, { backgroundColor: colors.primarySoft }]}
            onPress={() => handleCallBack(item, 'voice')}
            accessibilityRole="button"
            accessibilityLabel={`Voice call ${item.otherUserName}`}
            activeOpacity={0.7}
          >
            <Ionicons name="call" size={16} color={colors.primary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.callBtn, { backgroundColor: colors.primarySoft }]}
            onPress={() => handleCallBack(item, 'video')}
            accessibilityRole="button"
            accessibilityLabel={`Video call ${item.otherUserName}`}
            activeOpacity={0.7}
          >
            <Ionicons name="videocam" size={16} color={colors.primary} />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <View style={styles.headerTitleRow}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Calls</Text>
          <View style={[styles.callCountBadge, { backgroundColor: colors.primarySoft }]}>
            <Text style={[styles.callCountText, { color: colors.primary }]}>
              {calls.length}
            </Text>
          </View>
        </View>
      </View>

      {/* Filter Tabs: All vs Missed */}
      <View style={[styles.filterBar, { backgroundColor: colors.surfaceSubtle }]}>
        <TouchableOpacity
          style={[styles.filterTab, filterTab === 'all' && [styles.filterTabActive, { backgroundColor: colors.surface }]]}
          onPress={() => setFilterTab('all')}
          activeOpacity={0.7}
        >
          <Text style={[styles.filterTabText, { color: filterTab === 'all' ? colors.primary : colors.textSecondary }]}>
            All
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterTab, filterTab === 'missed' && [styles.filterTabActive, { backgroundColor: colors.surface }]]}
          onPress={() => setFilterTab('missed')}
          activeOpacity={0.7}
        >
          <Text style={[styles.filterTabText, { color: filterTab === 'missed' ? '#EF4444' : colors.textSecondary }]}>
            Missed
          </Text>
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <View style={[styles.searchBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Feather name="search" size={16} color={colors.textSecondary} style={{ marginRight: 8 }} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder="Search calls by contact name..."
          placeholderTextColor={colors.textSecondary}
          value={searchQuery}
          onChangeText={setSearchQuery}
          clearButtonMode="while-editing"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Feather name="x" size={16} color={colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Call Records List */}
      {loading ? (
        <View style={styles.centerWrap}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : filteredCalls.length === 0 ? (
        <View style={styles.centerWrap}>
          <View style={[styles.emptyIconCircle, { backgroundColor: colors.primarySoft }]}>
            <Ionicons name="call-outline" size={44} color={colors.primary} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            {filterTab === 'missed' ? 'No missed calls' : 'No recent calls'}
          </Text>
          <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
            {filterTab === 'missed'
              ? 'You have answered all your incoming calls.'
              : 'Voice and video calls with your contacts will appear here.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredCalls}
          keyExtractor={(item) => item.id}
          renderItem={renderCallItem}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
        />
      )}

      {/* Bottom Navigation */}
      <View style={[styles.bottomNav, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <TouchableOpacity style={styles.navItem} onPress={() => router.replace('/chats')} activeOpacity={0.8}>
          <VibeIcon name="message" color={colors.textSecondary} size={19} />
          <Text style={[styles.navText, { color: colors.textSecondary }]}>Chats</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.navItemActive, { backgroundColor: colors.primarySoft }]} onPress={() => {}} activeOpacity={0.8}>
          <VibeIcon name="call" color={colors.primary} size={19} />
          <Text style={[styles.navTextActive, { color: colors.primary }]}>Calls</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.navItem} onPress={() => router.replace('/profile')} activeOpacity={0.8}>
          <VibeIcon name="person" color={colors.textSecondary} size={19} />
          <Text style={[styles.navText, { color: colors.textSecondary }]}>Profile</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  callCountBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  callCountText: {
    fontSize: 12,
    fontWeight: '700',
  },
  filterBar: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 6,
    padding: 3,
    borderRadius: 12,
  },
  filterTab: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  filterTabActive: {
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  filterTabText: {
    fontSize: 13,
    fontWeight: '700',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginVertical: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    padding: 0,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 90,
  },
  callItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 18,
    marginBottom: 8,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
  },
  callDetails: {
    flex: 1,
    marginLeft: 14,
    justifyContent: 'center',
  },
  contactName: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  callMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaIcon: {
    marginRight: 4,
  },
  callMetaText: {
    fontSize: 13,
    fontWeight: '500',
  },
  actionButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginLeft: 10,
  },
  callBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 36,
    paddingBottom: 80,
  },
  emptyIconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  emptyTitle: {
    fontSize: 19,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  bottomNav: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 10,
    elevation: 4,
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 8,
    borderRadius: 12,
  },
  navItemActive: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 8,
    borderRadius: 12,
  },
  navText: {
    fontSize: 11,
    fontWeight: '600',
  },
  navTextActive: {
    fontSize: 11,
    fontWeight: '700',
  },
});
