import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import { toByteArray } from 'base64-js';

import { ChatListItem } from '../components/chat-list-item';
import { EmptyState } from '../components/empty-state';
import { SearchBar } from '../components/search-bar';
import { VibeAvatar, VibeIcon, VibePrimaryButton } from '../components/vibe-ui';
import { useAppTheme } from '../context/theme-context';
import { supabase } from '../supabase';

type VibeUser = {
  uid: string;
  name: string;
  email: string;
  isOnline: boolean;
  lastSeen: Date | string | null;
  photoURL?: string | null;
};

type DirectConversationItem = {
  type: 'direct';
  id: string;
  chatId?: string;
  user: VibeUser;
  name: string;
  email: string;
  photoURL?: string | null;
  isOnline: boolean;
  lastSeen: Date | string | null;
  lastMessage: string;
  updatedAt: Date | string | null;
  unreadCount: number;
  isPinned: boolean;
};

type GroupConversationItem = {
  type: 'group';
  id: string;
  name: string;
  photoURL?: string | null;
  lastMessage: string;
  lastMessageSenderName?: string;
  updatedAt: Date | string | null;
  unreadCount: number;
  participants: string[];
  isPinned: boolean;
};

type ChatListItemData = DirectConversationItem | GroupConversationItem;
type ChatFilter = 'all' | 'groups' | 'unread' | 'online' | 'pinned';

function getTimeMillis(ts: any): number {
  if (!ts) return 0;
  if (ts instanceof Date) return ts.getTime();
  const m = new Date(ts).getTime();
  return isNaN(m) ? 0 : m;
}

async function resolveStorageUrl(pathOrUrl: string | null): Promise<string | null> {
  if (!pathOrUrl) return null;
  if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) {
    const match = pathOrUrl.match(/\/vibechat-media\/(.+)$/);
    if (match && match[1]) {
      try {
        const cleanPath = match[1].split('?')[0];
        const { data } = await supabase.storage
          .from('vibechat-media')
          .createSignedUrl(decodeURIComponent(cleanPath), 60 * 60 * 24);
        if (data?.signedUrl) return data.signedUrl;
      } catch {}
    }
    return pathOrUrl;
  }
  try {
    const { data } = await supabase.storage
      .from('vibechat-media')
      .createSignedUrl(pathOrUrl, 60 * 60 * 24);
    if (data?.signedUrl) return data.signedUrl;
  } catch {}
  return pathOrUrl;
}

export default function ChatsScreen() {
  const { colors, isDark } = useAppTheme();
  const [currentSupabaseUser, setCurrentSupabaseUser] = useState<{ id: string; email?: string } | null>(null);
  const [users, setUsers] = useState<VibeUser[]>([]);
  const [directChats, setDirectChats] = useState<DirectConversationItem[]>([]);
  const [groupChats, setGroupChats] = useState<GroupConversationItem[]>([]);
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [showPeople, setShowPeople] = useState(false);
  const [chatFilter, setChatFilter] = useState<ChatFilter>('all');
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [pinsLoadedFor, setPinsLoadedFor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [conversationsLoaded, setConversationsLoaded] = useState(false);
  const [clock, setClock] = useState(() => Date.now());

  // Group creation modal state
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupPhotoUri, setNewGroupPhotoUri] = useState<string | null>(null);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [groupMemberSearch, setGroupMemberSearch] = useState('');

  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  // Supabase Auth session listener
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setCurrentSupabaseUser({ id: user.id, email: user.email });
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setCurrentSupabaseUser({ id: session.user.id, email: session.user.email });
      } else {
        setCurrentSupabaseUser(null);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const effectiveUserId = currentSupabaseUser?.id;

  useEffect(() => {
    if (!effectiveUserId) return;

    let active = true;
    AsyncStorage.getItem(`@vibe/pinned-chats:${effectiveUserId}`)
      .then((storedPins) => {
        let parsedPins: unknown = [];
        try {
          parsedPins = storedPins ? JSON.parse(storedPins) : [];
        } catch {
          parsedPins = [];
        }
        if (!active) return;
        setPinnedIds(Array.isArray(parsedPins) ? parsedPins.filter((uid): uid is string => typeof uid === 'string') : []);
        setPinsLoadedFor(effectiveUserId);
      })
      .catch((error) => {
        console.warn('Could not load pinned chats:', error);
        if (active) setPinsLoadedFor(effectiveUserId);
      });

    return () => {
      active = false;
    };
  }, [effectiveUserId]);

  useEffect(() => {
    if (!effectiveUserId || pinsLoadedFor !== effectiveUserId) return;
    AsyncStorage.setItem(`@vibe/pinned-chats:${effectiveUserId}`, JSON.stringify(pinnedIds)).catch((error) => {
      console.warn('Could not save pinned chats:', error);
    });
  }, [effectiveUserId, pinnedIds, pinsLoadedFor]);

  // Fetch registered users from Supabase profiles table (excluding current user)
  const fetchProfiles = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, avatar_url, is_online, last_seen')
        .neq('id', user.id);

      if (error) {
        console.warn('Error fetching Supabase profiles:', error);
        setLoading(false);
        return;
      }

      if (data) {
        const userList: VibeUser[] = data.map((p) => ({
          uid: p.id,
          name: p.full_name || 'Vibe User',
          email: p.email || '',
          isOnline: p.is_online === true,
          lastSeen: p.last_seen ? new Date(p.last_seen) : null,
          photoURL: p.avatar_url || null,
        }));
        setUsers(userList);
        setLoading(false);
      }
    } catch (err) {
      console.warn('Profiles load error:', err);
      setLoading(false);
    }
  }, []);

  // STEP 2: Safe Supabase Realtime for profiles with unique channel topic
  useEffect(() => {
    let active = true;
    const runFetch = async () => {
      await fetchProfiles();
      if (!active) return;
    };

    void runFetch();

    const channelTopic = `profiles_sub_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const channel = supabase
      .channel(channelTopic)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles' },
        () => {
          void fetchProfiles();
        }
      );

    channel.subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [fetchProfiles]);

  // Ephemeral presence tracking
  useEffect(() => {
    if (!currentSupabaseUser) return;

    const presenceTopic = `presence_chats_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const presenceChannel = supabase.channel(presenceTopic);

    presenceChannel
      .on('presence', { event: 'sync' }, () => {
        const state = presenceChannel.presenceState();
        setOnlineUserIds(new Set(Object.keys(state)));
      });

    presenceChannel.subscribe();

    return () => {
      supabase.removeChannel(presenceChannel);
    };
  }, [currentSupabaseUser]);

  // Fetch All Chats from Supabase (chat_members + chats + profiles)
  const fetchAllChats = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setConversationsLoaded(true);
        return;
      }

      const { data: myMemberships, error: memberErr } = await supabase
        .from('chat_members')
        .select(`
          chat_id,
          unread_count,
          pinned,
          role,
          chats!inner (
            id,
            type,
            name,
            photo_url,
            created_by,
            last_message,
            last_message_at,
            updated_at
          )
        `)
        .eq('user_id', user.id);

      if (memberErr) {
        console.warn('Error fetching Supabase chats:', memberErr);
        setConversationsLoaded(true);
        return;
      }

      if (!myMemberships || myMemberships.length === 0) {
        setDirectChats([]);
        setGroupChats([]);
        setConversationsLoaded(true);
        return;
      }

      // 1. Separate into direct chats and group chats
      const directMemberships = myMemberships.filter((m) => (m.chats as any)?.type === 'direct');
      const groupMemberships = myMemberships.filter((m) => (m.chats as any)?.type === 'group');

      // 2. Process Group Chats
      const groupItems: GroupConversationItem[] = await Promise.all(
        groupMemberships.map(async (m) => {
          const chatData = (m as any).chats;
          const rawDate = chatData.last_message_at || chatData.updated_at;
          const updatedAtDate = rawDate ? new Date(rawDate) : null;

          let resolvedPhoto: string | null = chatData.photo_url || null;
          if (resolvedPhoto) {
            resolvedPhoto = await resolveStorageUrl(resolvedPhoto);
          }

          return {
            type: 'group',
            id: m.chat_id,
            name: chatData.name || 'Group Chat',
            photoURL: resolvedPhoto,
            lastMessage: chatData.last_message || 'Group created',
            lastMessageSenderName: '',
            updatedAt: updatedAtDate,
            unreadCount: Number(m.unread_count || 0),
            participants: [],
            isPinned: m.pinned === true || pinnedIds.includes(m.chat_id),
          };
        })
      );
      setGroupChats(groupItems);

      // 3. Process Direct Chats: resolve other member's profile
      if (directMemberships.length === 0) {
        setDirectChats([]);
        setConversationsLoaded(true);
        return;
      }

      const directChatIds = directMemberships.map((m) => m.chat_id);
      const { data: otherMembers, error: otherErr } = await supabase
        .from('chat_members')
        .select(`
          chat_id,
          user_id,
          profiles!inner (
            id,
            full_name,
            email,
            avatar_url,
            is_online,
            last_seen
          )
        `)
        .in('chat_id', directChatIds)
        .neq('user_id', user.id);

      if (otherErr) {
        console.warn('Error fetching other chat members:', otherErr);
        setConversationsLoaded(true);
        return;
      }

      const otherMap: Record<string, any> = {};
      otherMembers?.forEach((om) => {
        otherMap[om.chat_id] = om.profiles;
      });

      const directItems: DirectConversationItem[] = await Promise.all(
        directMemberships
          .filter((m) => Boolean(otherMap[m.chat_id]))
          .map(async (m) => {
            const chatData = (m as any).chats;
            const otherProfile = otherMap[m.chat_id];
            const lastSeenDate = otherProfile.last_seen ? new Date(otherProfile.last_seen) : null;
            const isOnline =
              onlineUserIds.has(otherProfile.id) ||
              (otherProfile.is_online === true && lastSeenDate !== null && clock - lastSeenDate.getTime() < 120000);

            let resolvedAvatar: string | null = otherProfile.avatar_url || null;
            if (resolvedAvatar) {
              resolvedAvatar = await resolveStorageUrl(resolvedAvatar);
            }

            const otherUser: VibeUser = {
              uid: otherProfile.id,
              name: otherProfile.full_name || 'Vibe User',
              email: otherProfile.email || '',
              isOnline,
              lastSeen: lastSeenDate,
              photoURL: resolvedAvatar,
            };

            const rawDate = chatData.last_message_at || chatData.updated_at;
            const updatedAtDate = rawDate ? new Date(rawDate) : null;

            return {
              type: 'direct',
              id: m.chat_id,
              chatId: m.chat_id,
              user: otherUser,
              name: otherUser.name,
              email: otherUser.email,
              photoURL: resolvedAvatar,
              isOnline,
              lastSeen: lastSeenDate,
              lastMessage: chatData.last_message || '',
              updatedAt: updatedAtDate,
              unreadCount: Number(m.unread_count || 0),
              isPinned: m.pinned === true || pinnedIds.includes(m.chat_id),
            };
          })
      );

      setDirectChats(directItems);
      setConversationsLoaded(true);
    } catch (err) {
      console.warn('Error in fetchAllChats:', err);
      setConversationsLoaded(true);
    }
  }, [clock, pinnedIds, onlineUserIds]);

  // STEP 2: Safe Supabase Realtime for chats & chat_members
  useEffect(() => {
    let active = true;
    const runFetch = async () => {
      await fetchAllChats();
      if (!active) return;
    };

    void runFetch();

    const channelTopic = `chats_sub_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const channel = supabase
      .channel(channelTopic)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chats' },
        () => {
          void fetchAllChats();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chat_members' },
        () => {
          void fetchAllChats();
        }
      );

    channel.subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [fetchAllChats]);

  const formatTime = (timestamp?: Date | string | null) => {
    if (!timestamp) return '';
    const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
    if (isNaN(date.getTime())) return '';

    if (date.toDateString() !== new Date(clock).toDateString()) {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }

    return date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const togglePinned = (id: string) => {
    setPinnedIds((current) =>
      current.includes(id) ? current.filter((pinnedId) => pinnedId !== id) : [...current, id]
    );
  };

  const openDirectChat = (user: VibeUser, directChatId?: string) => {
    setShowPeople(false);
    router.push({
      pathname: '/chat',
      params: {
        uid: user.uid,
        name: user.name,
        photoURL: user.photoURL || '',
        chatId: directChatId || '',
        isGroup: 'false',
      },
    });
  };

  const openGroupChat = (group: GroupConversationItem) => {
    router.push({
      pathname: '/chat',
      params: {
        uid: group.id,
        name: group.name,
        photoURL: group.photoURL || '',
        isGroup: 'true',
        chatId: group.id,
      },
    });
  };

  // Group creation logic
  const handlePickGroupPhoto = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission needed', 'Please allow photo access to select a group photo.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.85,
      });
      if (!result.canceled && result.assets[0]) {
        setNewGroupPhotoUri(result.assets[0].uri);
      }
    } catch (err) {
      console.error('Pick group photo error:', err);
    }
  };

  const toggleSelectUserForGroup = (uid: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]
    );
  };

  const handleCreateGroup = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      Alert.alert('Error', 'You must be signed in to create a group.');
      return;
    }

    const cleanName = newGroupName.trim();
    if (!cleanName) {
      Alert.alert('Group Name Required', 'Please enter a name for the group.');
      return;
    }
    if (selectedUserIds.length === 0) {
      Alert.alert('Members Required', 'Please select at least 1 member for the group.');
      return;
    }

    setCreatingGroup(true);
    try {
      // 1. Authoritative group creation via secure create_group_chat RPC
      const { data: rpcChatId, error: rpcErr } = await supabase.rpc('create_group_chat', {
        p_name: cleanName,
        p_photo_url: null,
        p_member_ids: selectedUserIds,
      });

      if (rpcErr || !rpcChatId) {
        console.error('Group creation failed via RPC:', rpcErr);
        Alert.alert(
          'Group Creation Failed',
          rpcErr?.message || 'Could not create group chat. Please check your network or database permissions.'
        );
        return;
      }

      const createdChatId = rpcChatId as string;
      let finalPhotoPath: string | null = null;
      let signedPhotoUrl: string | null = null;

      // 2. Safe group photo upload under chats/<chatId>/group_photos/... per Storage RLS
      if (newGroupPhotoUri) {
        try {
          const uniqueName = `${Date.now()}_${Math.random().toString(36).substring(2, 6)}.jpg`;
          const filePath = `chats/${createdChatId}/group_photos/${uniqueName}`;

          if (Platform.OS === 'web') {
            const response = await fetch(newGroupPhotoUri);
            const blob = await response.blob();
            const { error: uploadErr } = await supabase.storage
              .from('vibechat-media')
              .upload(filePath, blob, {
                contentType: 'image/jpeg',
                upsert: true,
              });
            if (uploadErr) throw uploadErr;
          } else {
            const base64 = await FileSystem.readAsStringAsync(newGroupPhotoUri, {
              encoding: FileSystem.EncodingType.Base64,
            });
            const bytes = toByteArray(base64);
            const { error: uploadErr } = await supabase.storage
              .from('vibechat-media')
              .upload(filePath, bytes, {
                contentType: 'image/jpeg',
                upsert: true,
              });
            if (uploadErr) throw uploadErr;
          }

          finalPhotoPath = filePath;

          // Update chat record with the storage path
          await supabase.from('chats').update({ photo_url: filePath }).eq('id', createdChatId);

          // Resolve signed URL for immediate local preview
          signedPhotoUrl = await resolveStorageUrl(filePath);
        } catch (photoErr: any) {
          console.warn('Group photo upload warning:', photoErr);
        }
      }

      setShowCreateGroupModal(false);
      setNewGroupName('');
      setNewGroupPhotoUri(null);
      setSelectedUserIds([]);

      router.push({
        pathname: '/chat',
        params: {
          uid: createdChatId,
          name: cleanName,
          photoURL: signedPhotoUrl || finalPhotoPath || '',
          isGroup: 'true',
          chatId: createdChatId,
        },
      });
    } catch (error: any) {
      console.error('Create group error:', error);
      Alert.alert('Creation Failed', error?.message || 'Could not create the group. Please try again.');
    } finally {
      setCreatingGroup(false);
    }
  };

  const normalizedSearch = search.trim().toLowerCase();

  // Unified items list (Messages view)
  const visibleConversations: ChatListItemData[] = useMemo(() => {
    const allCombined: ChatListItemData[] = [...directChats, ...groupChats];

    return allCombined
      .filter((item) => {
        if (chatFilter === 'groups') return item.type === 'group';
        if (chatFilter === 'pinned') return item.isPinned;
        if (chatFilter === 'unread') return item.unreadCount > 0;
        if (chatFilter === 'online') {
          return item.type === 'direct' && item.isOnline;
        }
        return true;
      })
      .filter((item) => {
        if (!normalizedSearch) return true;
        const searchTarget = `${item.name} ${item.lastMessage} ${item.type === 'direct' ? item.email : ''}`.toLowerCase();
        return searchTarget.includes(normalizedSearch);
      })
      .sort((first, second) => {
        const pinOrder = Number(second.isPinned) - Number(first.isPinned);
        if (pinOrder !== 0) return pinOrder;
        return getTimeMillis(second.updatedAt) - getTimeMillis(first.updatedAt);
      });
  }, [chatFilter, directChats, groupChats, normalizedSearch]);

  // People Directory list
  const visiblePeople = useMemo(() => {
    return users
      .filter((user) =>
        `${user.name} ${user.email}`.toLowerCase().includes(normalizedSearch)
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [users, normalizedSearch]);

  const activeUsers = useMemo(() => {
    return users
      .filter((user) => user.isOnline && user.lastSeen !== null && clock - getTimeMillis(user.lastSeen) < 120000)
      .slice(0, 5);
  }, [users, clock]);

  const filteredGroupCandidates = useMemo(() => {
    const q = groupMemberSearch.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => `${u.name} ${u.email}`.toLowerCase().includes(q));
  }, [users, groupMemberSearch]);

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: colors.background }, Platform.OS === 'web' && styles.safeAreaWeb]}
      edges={['top', 'bottom', 'left', 'right']}
    >
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <View style={[styles.container, { backgroundColor: colors.background }, Platform.OS === 'web' && [styles.containerWeb, { borderColor: colors.border }]]}>
        <View style={styles.searchWrap}>
          <SearchBar value={search} onChangeText={setSearch} placeholder={showPeople ? 'Search people' : 'Search conversations'} />
        </View>

        {!showPeople && (
          <View style={[styles.filterRow, { backgroundColor: colors.surfaceSubtle }]} accessibilityRole="tablist">
            {(['all', 'groups', 'unread', 'online', 'pinned'] as const).map((filter) => (
              <TouchableOpacity
                key={filter}
                accessibilityRole="tab"
                accessibilityState={{ selected: chatFilter === filter }}
                style={[
                  styles.filterTab,
                  chatFilter === filter && [styles.filterTabActive, { backgroundColor: colors.surface }],
                ]}
                onPress={() => setChatFilter(filter)}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.filterText,
                    { color: colors.textSecondary },
                    chatFilter === filter && { color: colors.primary, fontWeight: '700' },
                  ]}
                >
                  {filter === 'all'
                    ? 'All'
                    : filter === 'groups'
                      ? 'Groups'
                      : filter === 'unread'
                        ? 'Unread'
                        : filter === 'online'
                          ? 'Online'
                          : 'Pinned'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Active Now Stories/Presence section */}
        {activeUsers.length > 0 && !showPeople && chatFilter === 'all' && (
          <View style={styles.activeSection}>
            <View style={styles.activeHeader}>
              <Text style={[styles.activeTitle, { color: colors.text }]}>Active now</Text>
              <TouchableOpacity onPress={() => setShowPeople(true)} activeOpacity={0.7}>
                <Text style={[styles.seeAll, { color: colors.textSecondary }]}>See all</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={activeUsers}
              keyExtractor={(item) => `active-${item.uid}`}
              contentContainerStyle={{ gap: 14 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.activeUserItem}
                  onPress={() => openDirectChat(item)}
                  activeOpacity={0.78}
                >
                  <VibeAvatar name={item.name} size={48} photoURL={item.photoURL} online={true} />
                  <Text style={[styles.activeUserName, { color: colors.textSecondary }]} numberOfLines={1}>
                    {item.name.split(' ')[0]}
                  </Text>
                </TouchableOpacity>
              )}
            />
          </View>
        )}

        <View style={styles.sectionHeaderRow}>
          <View style={styles.sectionTitleRow}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>{showPeople ? 'People' : 'Messages'}</Text>
            <Text style={[styles.sectionCount, { color: colors.primary, backgroundColor: colors.primarySoft }]}>
              {showPeople ? visiblePeople.length : visibleConversations.length}
            </Text>
          </View>

          <View style={styles.headerActionsGroup}>
            <TouchableOpacity
              style={[styles.headerActionBtn, { backgroundColor: colors.primarySoft }]}
              onPress={() => router.push('/broadcasts' as any)}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel="Broadcasts"
            >
              <Ionicons name="megaphone-outline" color={colors.primary} size={14} />
              <Text style={[styles.headerActionBtnText, { color: colors.primary }]}>Broadcast</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.headerActionBtn, { backgroundColor: colors.primarySoft }]}
              onPress={() => setShowCreateGroupModal(true)}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel="New Group"
            >
              <VibeIcon name="add" color={colors.primary} size={15} />
              <Text style={[styles.headerActionBtnText, { color: colors.primary }]}>New Group</Text>
            </TouchableOpacity>
          </View>
        </View>

        {loading || (!showPeople && !conversationsLoaded) ? (
          <ActivityIndicator size="large" style={styles.loader} color={colors.primary} />
        ) : showPeople ? (
          /* People List */
          <FlatList
            data={visiblePeople}
            keyExtractor={(item) => item.uid}
            contentContainerStyle={visiblePeople.length === 0 ? styles.emptyList : styles.list}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <EmptyState
                title="No users found"
                description="Try another name or email address."
              />
            }
            renderItem={({ item }) => (
              <ChatListItem
                name={item.name}
                preview={item.email}
                time=""
                unreadCount={0}
                online={onlineUserIds.has(item.uid) || (item.isOnline && item.lastSeen !== null && clock - getTimeMillis(item.lastSeen) < 120000)}
                isActive={false}
                photoURL={item.photoURL}
                onPress={() => openDirectChat(item)}
              />
            )}
          />
        ) : (
          /* Conversations List (Direct + Groups) */
          <FlatList
            data={visibleConversations}
            keyExtractor={(item) => item.id}
            contentContainerStyle={visibleConversations.length === 0 ? styles.emptyList : styles.list}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <EmptyState
                title={
                  chatFilter === 'groups'
                    ? 'No groups yet'
                    : chatFilter === 'unread'
                      ? 'All caught up'
                      : chatFilter === 'online'
                        ? 'No active chats'
                        : chatFilter === 'pinned'
                          ? 'No pinned chats'
                          : 'Your Vibe starts here'
                }
                description={
                  chatFilter === 'groups'
                    ? 'Create a group to start chatting with multiple friends.'
                    : chatFilter === 'unread'
                      ? 'There are no unread messages right now.'
                      : chatFilter === 'online'
                        ? 'Conversations will appear here when friends are active.'
                        : chatFilter === 'pinned'
                          ? 'Pin a conversation to keep it easy to find.'
                          : 'Find someone and start chatting.'
                }
                actionLabel={
                  chatFilter === 'groups'
                    ? 'Create a group'
                    : chatFilter === 'all'
                      ? 'Find people'
                      : undefined
                }
                onAction={
                  chatFilter === 'groups'
                    ? () => setShowCreateGroupModal(true)
                    : chatFilter === 'all'
                      ? () => setShowPeople(true)
                      : undefined
                }
              />
            }
            renderItem={({ item }) => {
              if (item.type === 'group') {
                return (
                  <ChatListItem
                    name={item.name}
                    preview={item.lastMessage || 'No messages yet'}
                    time={item.updatedAt ? formatTime(item.updatedAt) : ''}
                    unreadCount={item.unreadCount}
                    online={false}
                    isActive={true}
                    pinned={item.isPinned}
                    photoURL={item.photoURL}
                    isGroup={true}
                    onTogglePinned={() => togglePinned(item.id)}
                    onPress={() => openGroupChat(item)}
                  />
                );
              }

              return (
                <ChatListItem
                  name={item.name}
                  preview={item.lastMessage || 'Tap to start chatting'}
                  time={item.updatedAt ? formatTime(item.updatedAt) : ''}
                  unreadCount={item.unreadCount}
                  online={item.isOnline}
                  isActive={true}
                  pinned={item.isPinned}
                  photoURL={item.photoURL}
                  isGroup={false}
                  onTogglePinned={() => togglePinned(item.id)}
                  onPress={() => openDirectChat(item.user, item.chatId || item.id)}
                />
              );
            }}
          />
        )}

        {/* FAB: Toggle between Conversations and People */}
        <TouchableOpacity
          style={[styles.fab, { backgroundColor: colors.primary }]}
          onPress={() => setShowPeople((current) => !current)}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={showPeople ? 'View Messages' : 'View People'}
        >
          <VibeIcon name={showPeople ? 'message' : 'add'} color="#FFFFFF" size={23} />
        </TouchableOpacity>

        {/* Bottom Navigation */}
        <View style={[styles.bottomNav, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <TouchableOpacity style={[styles.navItemActive, { backgroundColor: colors.primarySoft }]} onPress={() => {}} activeOpacity={0.8}>
            <VibeIcon name="message" color={colors.primary} size={19} />
            <Text style={[styles.navTextActive, { color: colors.primary }]}>Chats</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.navItem} onPress={() => router.push('/calls' as any)} activeOpacity={0.8}>
            <VibeIcon name="call" color={colors.textSecondary} size={19} />
            <Text style={[styles.navText, { color: colors.textSecondary }]}>Calls</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.navItem} onPress={() => router.push('/profile')} activeOpacity={0.8}>
            <VibeIcon name="person" color={colors.textSecondary} size={19} />
            <Text style={[styles.navText, { color: colors.textSecondary }]}>Profile</Text>
          </TouchableOpacity>
        </View>

        {/* Create Group Modal */}
        <Modal
          visible={showCreateGroupModal}
          animationType="slide"
          transparent
          onRequestClose={() => setShowCreateGroupModal(false)}
        >
          <View style={[styles.modalOverlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
            <View style={[styles.createGroupCard, { backgroundColor: colors.surface }]}>
              {/* Header */}
              <View style={styles.createGroupHeader}>
                <Text style={[styles.createGroupTitle, { color: colors.text }]}>New Group</Text>
                <TouchableOpacity
                  onPress={() => setShowCreateGroupModal(false)}
                  style={styles.closeBtn}
                >
                  <VibeIcon name="close" color={colors.textSecondary} size={20} />
                </TouchableOpacity>
              </View>

              {/* Group Name & Photo */}
              <View style={styles.groupInfoRow}>
                <TouchableOpacity
                  style={[styles.groupPhotoPicker, { borderColor: colors.border, backgroundColor: colors.surfaceSubtle }]}
                  onPress={handlePickGroupPhoto}
                  activeOpacity={0.7}
                >
                  {newGroupPhotoUri ? (
                    <Image source={{ uri: newGroupPhotoUri }} style={styles.groupPhotoPreview} contentFit="cover" />
                  ) : (
                    <VibeIcon name="image" color={colors.textSecondary} size={24} />
                  )}
                  <View style={[styles.groupPhotoBadge, { backgroundColor: colors.primary }]}>
                    <VibeIcon name="edit" color="#FFFFFF" size={11} />
                  </View>
                </TouchableOpacity>

                <View style={styles.groupNameInputWrap}>
                  <TextInput
                    style={[styles.groupNameInput, { backgroundColor: colors.inputBackground, borderColor: colors.border, color: colors.text }]}
                    placeholder="Group name"
                    placeholderTextColor={colors.textSecondary}
                    value={newGroupName}
                    onChangeText={setNewGroupName}
                    maxLength={40}
                  />
                  <Text style={[styles.selectedCountText, { color: colors.textSecondary }]}>
                    {selectedUserIds.length} {selectedUserIds.length === 1 ? 'member' : 'members'} selected
                  </Text>
                </View>
              </View>

              {/* Selected Users Chips Tray */}
              {selectedUserIds.length > 0 && (
                <View style={[styles.selectedMembersTray, { backgroundColor: colors.surfaceSubtle }]}>
                  <FlatList
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    data={users.filter((u) => selectedUserIds.includes(u.uid))}
                    keyExtractor={(item) => `sel-${item.uid}`}
                    contentContainerStyle={styles.selectedMembersContent}
                    renderItem={({ item }) => (
                      <View style={[styles.selectedUserChip, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                        <VibeAvatar name={item.name} size={22} photoURL={item.photoURL} />
                        <Text style={[styles.selectedUserName, { color: colors.text }]} numberOfLines={1}>
                          {item.name.split(' ')[0]}
                        </Text>
                        <TouchableOpacity
                          onPress={() => toggleSelectUserForGroup(item.uid)}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                          style={styles.removeSelectedUserBtn}
                        >
                          <VibeIcon name="close" color={colors.textSecondary} size={12} />
                        </TouchableOpacity>
                      </View>
                    )}
                  />
                </View>
              )}

              {/* Member Search */}
              <View style={[styles.memberSearchWrap, { backgroundColor: colors.surfaceSubtle, borderColor: colors.border }]}>
                <VibeIcon name="search" color={colors.textSecondary} size={16} />
                <TextInput
                  style={[styles.memberSearchInput, { color: colors.text }]}
                  placeholder="Search contacts to add..."
                  placeholderTextColor={colors.textSecondary}
                  value={groupMemberSearch}
                  onChangeText={setGroupMemberSearch}
                />
              </View>

              {/* Members Selection List */}
              <FlatList
                data={filteredGroupCandidates}
                keyExtractor={(item) => `group-user-${item.uid}`}
                style={styles.memberCandidateList}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => {
                  const isSelected = selectedUserIds.includes(item.uid);
                  return (
                    <TouchableOpacity
                      style={[
                        styles.candidateRow,
                        { borderBottomColor: colors.border },
                        isSelected && { backgroundColor: colors.primarySoft },
                      ]}
                      onPress={() => toggleSelectUserForGroup(item.uid)}
                      activeOpacity={0.7}
                    >
                      <VibeAvatar name={item.name} size={42} photoURL={item.photoURL} />
                      <View style={styles.candidateInfo}>
                        <Text style={[styles.candidateName, { color: colors.text }]}>{item.name}</Text>
                        <Text style={[styles.candidateEmail, { color: colors.textSecondary }]}>{item.email}</Text>
                      </View>
                      <View
                        style={[
                          styles.checkboxCircle,
                          { borderColor: isSelected ? colors.primary : colors.border },
                          isSelected && { backgroundColor: colors.primary },
                        ]}
                      >
                        {isSelected && <VibeIcon name="check" color="#FFFFFF" size={14} />}
                      </View>
                    </TouchableOpacity>
                  );
                }}
              />

              {/* Create Action Button */}
              <View style={styles.createGroupActions}>
                <VibePrimaryButton
                  label={creatingGroup ? 'Creating Group...' : 'Create Group'}
                  onPress={handleCreateGroup}
                  loading={creatingGroup}
                  disabled={creatingGroup || !newGroupName.trim() || selectedUserIds.length === 0}
                />
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  safeAreaWeb: {
    backgroundColor: '#F5F3FF',
  },
  container: {
    flex: 1,
  },
  containerWeb: {
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
    borderLeftWidth: 1,
    borderRightWidth: 1,
  },
  searchWrap: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 10,
  },
  filterRow: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    gap: 6,
    marginHorizontal: 20,
    marginBottom: 8,
    padding: 4,
    borderRadius: 16,
  },
  filterTab: {
    minWidth: 58,
    minHeight: 34,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  filterTabActive: {
    shadowColor: '#111827',
    shadowOpacity: 0.07,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  filterText: {
    fontSize: 12,
    fontWeight: '600',
  },
  activeSection: {
    paddingHorizontal: 20,
    paddingBottom: 10,
    paddingTop: 2,
  },
  activeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  activeTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  seeAll: {
    fontSize: 12,
    fontWeight: '600',
  },
  activeUserItem: {
    alignItems: 'center',
    width: 54,
  },
  activeUserName: {
    fontSize: 11,
    marginTop: 6,
    textAlign: 'center',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginTop: 10,
    marginBottom: 12,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  sectionCount: {
    fontSize: 11,
    fontWeight: '700',
    minWidth: 24,
    height: 24,
    lineHeight: 24,
    textAlign: 'center',
    borderRadius: 999,
    overflow: 'hidden',
  },
  headerActionsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  headerActionBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  newGroupBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  newGroupBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  list: { paddingHorizontal: 12, paddingBottom: 84 },
  emptyList: { paddingHorizontal: 12, paddingBottom: 110 },
  loader: { marginTop: 24 },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 88,
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#6366F1',
    shadowOpacity: 0.28,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
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
  // Modal styles
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  createGroupCard: {
    maxHeight: '85%',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 18,
    paddingHorizontal: 20,
    paddingBottom: 24,
    shadowColor: '#000000',
    shadowOpacity: 0.15,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -4 },
    elevation: 12,
  },
  createGroupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  createGroupTitle: {
    fontSize: 20,
    fontWeight: '800',
  },
  closeBtn: {
    padding: 6,
  },
  groupInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 16,
  },
  groupPhotoPicker: {
    width: 66,
    height: 66,
    borderRadius: 33,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  groupPhotoPreview: {
    width: '100%',
    height: '100%',
  },
  groupPhotoBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  groupNameInputWrap: {
    flex: 1,
    gap: 4,
  },
  groupNameInput: {
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 15,
    fontWeight: '600',
  },
  selectedCountText: {
    fontSize: 11,
    paddingLeft: 4,
  },
  memberSearchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    gap: 8,
    marginBottom: 12,
  },
  memberSearchInput: {
    flex: 1,
    fontSize: 14,
  },
  memberCandidateList: {
    maxHeight: 260,
    marginBottom: 16,
  },
  candidateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  candidateInfo: {
    flex: 1,
  },
  candidateName: {
    fontSize: 14,
    fontWeight: '700',
  },
  candidateEmail: {
    fontSize: 12,
    marginTop: 2,
  },
  checkboxCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createGroupActions: {
    marginTop: 4,
  },
  selectedMembersTray: {
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 14,
    marginBottom: 10,
  },
  selectedMembersContent: {
    gap: 8,
    alignItems: 'center',
  },
  selectedUserChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingLeft: 4,
    paddingRight: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  selectedUserName: {
    fontSize: 12,
    fontWeight: '600',
    maxWidth: 70,
  },
  removeSelectedUserBtn: {
    padding: 2,
    borderRadius: 8,
  },
});