import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Platform,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { collection, onSnapshot, query, Timestamp, where } from 'firebase/firestore';

import { User as FirebaseUser, onAuthStateChanged } from 'firebase/auth';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ChatListItem } from '../components/chat-list-item';
import { EmptyState } from '../components/empty-state';
import { SearchBar } from '../components/search-bar';
import { VibeAvatar, VibeIcon } from '../components/vibe-ui';
import { VibeColors } from '../constants/theme';
import { auth, db } from '../firebase';

type VibeUser = {
  uid: string;
  name: string;
  email: string;
  isOnline: boolean;
  lastSeen: Timestamp | null;
};

type ConversationSummary = {
  lastMessage: string;
  updatedAt: Timestamp | null;
  unreadCount: number;
  lastMessageSenderId: string;
  lastMessageSeen: boolean;
};

type ChatFilter = 'all' | 'unread' | 'online' | 'pinned';

export default function ChatsScreen() {
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [users, setUsers] = useState<VibeUser[]>([]);
  const [conversations, setConversations] = useState<Record<string, ConversationSummary>>({});
  const [search, setSearch] = useState('');
  const [showPeople, setShowPeople] = useState(false);
  const [chatFilter, setChatFilter] = useState<ChatFilter>('all');
  const [pinnedUserIds, setPinnedUserIds] = useState<string[]>([]);
  const [pinsLoadedFor, setPinsLoadedFor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [conversationsLoaded, setConversationsLoaded] = useState(false);
  const [clock, setClock] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        setCurrentUser(user);
      } else {
        setCurrentUser(null);
        setUsers([]);
        setLoading(false);
        router.replace('/');
      }
    });

    return unsubscribeAuth;
  }, []);

  useEffect(() => {
    if (!currentUser) {
      setPinnedUserIds([]);
      setPinsLoadedFor(null);
      return;
    }

    let active = true;
    setPinnedUserIds([]);
    setPinsLoadedFor(null);
    AsyncStorage.getItem(`@vibe/pinned-chats:${currentUser.uid}`)
      .then((storedPins) => {
        let parsedPins: unknown = [];
        try {
          parsedPins = storedPins ? JSON.parse(storedPins) : [];
        } catch {
          parsedPins = [];
        }
        if (!active) return;
        setPinnedUserIds(Array.isArray(parsedPins) ? parsedPins.filter((uid): uid is string => typeof uid === 'string') : []);
        setPinsLoadedFor(currentUser.uid);
      })
      .catch((error) => {
        console.warn('Could not load pinned chats:', error);
        if (active) setPinsLoadedFor(currentUser.uid);
      });

    return () => {
      active = false;
    };
  }, [currentUser?.uid]);

  useEffect(() => {
    if (!currentUser || pinsLoadedFor !== currentUser.uid) return;
    AsyncStorage.setItem(`@vibe/pinned-chats:${currentUser.uid}`, JSON.stringify(pinnedUserIds)).catch((error) => {
      console.warn('Could not save pinned chats:', error);
    });
  }, [currentUser?.uid, pinnedUserIds, pinsLoadedFor]);

  useEffect(() => {
    if (!currentUser) return;

    setLoading(true);

    const unsubscribeUsers = onSnapshot(
      collection(db, 'users'),
      (snapshot) => {
        const userList: VibeUser[] = [];

        snapshot.forEach((userDocument) => {
          const data = userDocument.data();

          if (userDocument.id !== currentUser.uid) {
            userList.push({
              uid: userDocument.id,
              name: data.name || 'Vibe User',
              email: data.email || '',
              isOnline: data.isOnline === true,
              lastSeen: data.lastSeen instanceof Timestamp ? data.lastSeen : null,
            });
          }
        });

        setUsers(userList);
        setLoading(false);
      },
      (error) => {
        console.log('Users Error:', error);
        setLoading(false);
      }
    );

    return unsubscribeUsers;
  }, [currentUser?.uid]);

  useEffect(() => {
    if (!currentUser) return;

    const chatsQuery = query(collection(db, 'chats'), where('participants', 'array-contains', currentUser.uid));

    const unsubscribeChats = onSnapshot(
      chatsQuery,
      (snapshot) => {
        const chatData: Record<string, ConversationSummary> = {};

        snapshot.forEach((chatDocument) => {
          const data = chatDocument.data();
          const participants: string[] = data.participants || [];
          const otherUserId = participants.find((id) => id !== currentUser.uid);

          if (otherUserId) {
            chatData[otherUserId] = {
              lastMessage: data.lastMessage || '',
              updatedAt: data.updatedAt || null,
              unreadCount: Number(data.unreadCounts?.[currentUser.uid] || 0),
              lastMessageSenderId: typeof data.lastMessageSenderId === 'string' ? data.lastMessageSenderId : '',
              lastMessageSeen: data.lastMessageSeen === true,
            };
          }
        });

        setConversations(chatData);
        setConversationsLoaded(true);
      },
      (error) => {
        console.log('Chats Error:', error);
        setConversationsLoaded(true);
      }
    );

    return unsubscribeChats;
  }, [currentUser?.uid]);

  const formatTime = (timestamp?: Timestamp | null) => {
    if (!timestamp) return '';

    const date = timestamp.toDate();
    if (date.toDateString() !== new Date(clock).toDateString()) {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }

    return date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const normalizedSearch = search.trim().toLowerCase();
  const visibleUsers = useMemo(
    () =>
      users
        .map((user) => ({ ...user, conversation: conversations[user.uid] }))
        .filter((user) => {
          if (showPeople) return true;
          if (!user.conversation) return false;
          if (chatFilter === 'pinned') return pinnedUserIds.includes(user.uid);
          if (chatFilter === 'unread') return user.conversation.unreadCount > 0;
          if (chatFilter === 'online') {
            return user.isOnline && user.lastSeen !== null && clock - user.lastSeen.toMillis() < 120000;
          }
          return true;
        })
        .filter((user) =>
          `${user.name} ${user.email} ${user.conversation?.lastMessage || ''}`.toLowerCase().includes(normalizedSearch)
        )
        .sort((first, second) => {
          if (showPeople) return first.name.localeCompare(second.name);
          const pinOrder = Number(pinnedUserIds.includes(second.uid)) - Number(pinnedUserIds.includes(first.uid));
          if (pinOrder !== 0) return pinOrder;
          return (second.conversation?.updatedAt?.toMillis() || 0) - (first.conversation?.updatedAt?.toMillis() || 0);
        }),
    [chatFilter, clock, conversations, normalizedSearch, pinnedUserIds, showPeople, users]
  );

  const activeUsers = users.filter((user) => user.isOnline && user.lastSeen !== null && Date.now() - user.lastSeen.toMillis() < 120000).slice(0, 5);
  const emptyTitle = showPeople
    ? search.trim() ? 'No users found' : 'Your Vibe starts here'
    : chatFilter === 'unread' ? 'All caught up' : chatFilter === 'online' ? 'No active chats'
      : chatFilter === 'pinned' ? 'No pinned chats' : 'Your Vibe starts here';
  const emptyDescription = showPeople
    ? search.trim() ? 'Try another name or email address.' : 'Find someone and start chatting.'
    : chatFilter === 'unread' ? 'There are no unread messages right now.'
      : chatFilter === 'online' ? 'Your conversations will appear here when someone is active.'
        : chatFilter === 'pinned' ? 'Pin a conversation to keep it easy to find.'
        : 'Find someone and start chatting.';

  const togglePinned = (userId: string) => {
    setPinnedUserIds((current) => current.includes(userId)
      ? current.filter((pinnedUserId) => pinnedUserId !== userId)
      : [...current, userId]);
  };

  const openChat = (user: VibeUser) => {
    router.push({
      pathname: '/chat',
      params: {
        uid: user.uid,
        name: user.name,
      },
    });
  };

  return (
    <SafeAreaView style={[styles.safeArea, Platform.OS === 'web' && styles.safeAreaWeb]} edges={['top', 'bottom', 'left', 'right']}>
      <StatusBar style="dark" />
      <View style={[styles.container, Platform.OS === 'web' && styles.containerWeb]}>
        <View style={styles.searchWrap}>
          <SearchBar value={search} onChangeText={setSearch} placeholder="Search conversations" />
        </View>

        {!showPeople && (
          <View style={styles.filterRow} accessibilityRole="tablist">
            {(['all', 'unread', 'online', 'pinned'] as const).map((filter) => (
              <TouchableOpacity
                key={filter}
                accessibilityRole="tab"
                accessibilityState={{ selected: chatFilter === filter }}
                style={[styles.filterTab, chatFilter === filter && styles.filterTabActive]}
                onPress={() => setChatFilter(filter)}
                activeOpacity={0.8}
              >
                <Text style={[styles.filterText, chatFilter === filter && styles.filterTextActive]}>
                  {filter === 'all' ? 'All' : filter === 'unread' ? 'Unread' : filter === 'online' ? 'Online' : 'Pinned'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {activeUsers.length > 0 && (
          <View style={styles.activeSection}>
            <View style={styles.activeHeader}>
              <Text style={styles.activeTitle}>Active now</Text>
              <Text style={styles.seeAll}>See all</Text>
            </View>
            <FlatList
              data={activeUsers}
              horizontal
              showsHorizontalScrollIndicator={false}
              keyExtractor={(item) => item.uid}
              contentContainerStyle={styles.activeUsersRow}
              renderItem={({ item }) => (
                <TouchableOpacity key={item.uid} style={styles.activeUser} onPress={() => openChat(item)} activeOpacity={0.8}>
                  <VibeAvatar name={item.name} size={46} online />
                  <Text style={styles.activeUserName} numberOfLines={1}>{item.name.split(' ')[0]}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        )}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{showPeople ? 'People on Vibe' : 'Messages'}</Text>
          <Text style={styles.sectionCount}>{visibleUsers.length}</Text>
        </View>

        {loading || (!showPeople && !conversationsLoaded) ? (
          <ActivityIndicator size="large" style={styles.loader} color={VibeColors.primary} />
        ) : (
          <FlatList
            data={visibleUsers}
            keyExtractor={(item) => item.uid}
            contentContainerStyle={visibleUsers.length === 0 ? styles.emptyList : styles.list}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <EmptyState
                title={emptyTitle}
                description={emptyDescription}
                actionLabel={!showPeople && chatFilter === 'all' ? 'Find people' : undefined}
                onAction={!showPeople && chatFilter === 'all' ? () => setShowPeople(true) : undefined}
              />
            }
            renderItem={({ item }) => (
              <ChatListItem
                name={item.name}
                preview={item.conversation?.lastMessage || 'Tap to start chatting'}
                time={item.conversation?.updatedAt ? formatTime(item.conversation.updatedAt) : ''}
                unreadCount={item.conversation?.unreadCount || 0}
                online={item.isOnline && item.lastSeen !== null && Date.now() - item.lastSeen.toMillis() < 120000}
                isActive={Boolean(item.conversation)}
                pinned={pinnedUserIds.includes(item.uid)}
                onTogglePinned={!showPeople && item.conversation ? () => togglePinned(item.uid) : undefined}
                onPress={() => openChat(item)}
              />
            )}
          />
        )}

        <TouchableOpacity style={styles.fab} onPress={() => setShowPeople((current) => !current)} activeOpacity={0.85}>
          <VibeIcon name="add" color="#FFFFFF" size={23} />
        </TouchableOpacity>

        <View style={styles.bottomNav}>
          <TouchableOpacity style={styles.navItemActive} onPress={() => router.replace('/chats')} activeOpacity={0.8}>
            <VibeIcon name="message" color={VibeColors.primary} size={18} />
            <Text style={styles.navTextActive}>Chats</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.navItem} onPress={() => router.push('/profile')} activeOpacity={0.8}>
            <VibeIcon name="person" color={VibeColors.textSecondary} size={18} />
            <Text style={styles.navText}>Profile</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F7F7FF',
  },
  safeAreaWeb: {
    backgroundColor: '#F5F3FF',
  },
  container: {
    flex: 1,
    backgroundColor: '#F7F7FF',
  },
  containerWeb: {
    width: '100%',
    maxWidth: 460,
    alignSelf: 'center',
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: '#EAE8FF',
  },
  searchWrap: {
    paddingHorizontal: 20,
    paddingTop: 14,
    marginBottom: 10,
  },
  filterRow: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    gap: 8,
    marginHorizontal: 20,
    marginBottom: 8,
    padding: 4,
    borderRadius: 16,
    backgroundColor: '#ECECF4',
  },
  filterTab: {
    minWidth: 64,
    minHeight: 36,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  filterTabActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#111827',
    shadowOpacity: 0.07,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  filterText: {
    color: VibeColors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  filterTextActive: {
    color: VibeColors.primaryDark,
    fontWeight: '700',
  },
  activeSection: {
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  activeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  activeTitle: {
    color: VibeColors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  seeAll: {
    color: VibeColors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  activeUsersRow: {
    paddingRight: 20,
    gap: 12,
  },
  activeUser: {
    alignItems: 'center',
    width: 54,
  },
  activeUserName: {
    color: VibeColors.textSecondary,
    fontSize: 11,
    marginTop: 6,
    textAlign: 'center',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginTop: 10,
    marginBottom: 12,
  },
  sectionTitle: { color: VibeColors.text, fontSize: 18, fontWeight: '800' },
  sectionCount: {
    color: VibeColors.primary,
    fontSize: 11,
    fontWeight: '700',
    minWidth: 24,
    height: 24,
    lineHeight: 24,
    textAlign: 'center',
    borderRadius: 999,
    backgroundColor: VibeColors.primarySoft,
    overflow: 'hidden',
  },
  list: { paddingHorizontal: 12, paddingBottom: 84 },
  emptyList: { paddingHorizontal: 12, paddingBottom: 110 },
  loader: { marginTop: 24 },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 88,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: VibeColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#6366F1',
    shadowOpacity: 0.25,
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
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#EEF2FF',
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
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
    backgroundColor: '#F5F3FF',
  },
  navText: {
    fontSize: 11,
    color: VibeColors.textSecondary,
    fontWeight: '600',
  },
  navTextActive: {
    fontSize: 11,
    color: VibeColors.primary,
    fontWeight: '700',
  },
});