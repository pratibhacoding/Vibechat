import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { VibeAvatar, VibeIcon } from '../components/vibe-ui';
import { useAppTheme } from '../context/theme-context';
import { supabase } from '../supabase';
import {
  deleteBroadcastList,
  fetchBroadcastLists,
  type BroadcastList,
} from '../utils/broadcast';

export default function BroadcastsScreen() {
  const { colors, isDark } = useAppTheme();
  const [currentUser, setCurrentUser] = useState<{ id: string; email?: string } | null>(null);
  const [lists, setLists] = useState<BroadcastList[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setCurrentUser({ id: user.id, email: user.email });
      }
    });
  }, []);

  const loadLists = useCallback(async () => {
    if (!currentUser?.id) return;
    try {
      const data = await fetchBroadcastLists(currentUser.id);
      setLists(data);
    } catch (err) {
      console.warn('Error loading broadcast lists:', err);
    } finally {
      setLoading(false);
    }
  }, [currentUser?.id]);

  useFocusEffect(
    useCallback(() => {
      if (currentUser?.id) {
        void loadLists();
      }
    }, [currentUser?.id, loadLists])
  );

  useEffect(() => {
    if (currentUser?.id) {
      void loadLists();
    }
  }, [currentUser?.id, loadLists]);

  const handleDeleteList = (list: BroadcastList) => {
    Alert.alert(
      'Delete Broadcast List',
      `Are you sure you want to delete "${list.name}"? This will not delete any messages previously sent to recipients.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!currentUser?.id) return;
            try {
              await deleteBroadcastList(currentUser.id, list.id);
              setLists((prev) => prev.filter((l) => l.id !== list.id));
            } catch (err) {
              Alert.alert('Error', 'Could not delete broadcast list.');
            }
          },
        },
      ]
    );
  };

  const formatListDate = (iso: string) => {
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return '';
      return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  };

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: colors.background }]}
      edges={['top', 'bottom', 'left', 'right']}
    >
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Back to chats"
        >
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>

        <View style={styles.headerTitleWrap}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Broadcast Lists</Text>
          <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
            {lists.length} {lists.length === 1 ? 'list' : 'lists'}
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.createBtn, { backgroundColor: colors.primarySoft }]}
          onPress={() => router.push('/new-broadcast' as any)}
          accessibilityRole="button"
          accessibilityLabel="Create New Broadcast List"
          activeOpacity={0.78}
        >
          <Ionicons name="add" size={18} color={colors.primary} />
          <Text style={[styles.createBtnText, { color: colors.primary }]}>New</Text>
        </TouchableOpacity>
      </View>

      {/* Privacy Explanation Banner */}
      <View style={[styles.banner, { backgroundColor: isDark ? '#1E1B4B' : '#EEF2FF', borderColor: colors.border }]}>
        <View style={styles.bannerIconWrap}>
          <Ionicons name="megaphone-outline" size={20} color="#6366F1" />
        </View>
        <Text style={[styles.bannerText, { color: isDark ? '#C7D2FE' : '#4338CA' }]}>
          Only you can see your broadcast lists. Messages are delivered to each recipient as an individual direct message.
        </Text>
      </View>

      {/* Main List */}
      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : lists.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={[styles.emptyIconWrap, { backgroundColor: colors.primarySoft }]}>
            <Ionicons name="paper-plane-outline" size={42} color={colors.primary} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>No broadcast lists yet</Text>
          <Text style={[styles.emptyDesc, { color: colors.textSecondary }]}>
            Create a broadcast list to send a single message to multiple contacts at once without creating a group.
          </Text>
          <TouchableOpacity
            style={[styles.emptyActionBtn, { backgroundColor: colors.primary }]}
            onPress={() => router.push('/new-broadcast' as any)}
            activeOpacity={0.85}
          >
            <Ionicons name="add" size={20} color="#FFFFFF" />
            <Text style={styles.emptyActionBtnText}>Create Broadcast List</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={lists}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const memberNames = item.members.map((m) => m.name.split(' ')[0]).join(', ');
            return (
              <TouchableOpacity
                style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() =>
                  router.push({
                    pathname: '/broadcast-chat' as any,
                    params: { id: item.id },
                  })
                }
                activeOpacity={0.75}
              >
                <View style={styles.cardIconWrap}>
                  <Ionicons name="megaphone" size={22} color="#6366F1" />
                </View>

                <View style={styles.cardDetails}>
                  <View style={styles.cardTitleRow}>
                    <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={[styles.cardDate, { color: colors.textSecondary }]}>
                      {formatListDate(item.updatedAt)}
                    </Text>
                  </View>

                  <Text style={[styles.cardMembersCount, { color: colors.primary }]}>
                    {item.members.length} {item.members.length === 1 ? 'recipient' : 'recipients'}
                  </Text>

                  {memberNames ? (
                    <Text style={[styles.cardMemberNames, { color: colors.textSecondary }]} numberOfLines={1}>
                      {memberNames}
                    </Text>
                  ) : null}
                </View>

                <TouchableOpacity
                  onPress={() => handleDeleteList(item)}
                  style={styles.deleteBtn}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  accessibilityRole="button"
                  accessibilityLabel="Delete broadcast list"
                >
                  <Ionicons name="trash-outline" size={18} color="#EF4444" />
                </TouchableOpacity>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    padding: 6,
    marginRight: 6,
  },
  headerTitleWrap: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  headerSubtitle: {
    fontSize: 12,
    marginTop: 1,
  },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
  createBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
  },
  bannerIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 20,
    borderWidth: 1,
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
    gap: 14,
  },
  cardIconWrap: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardDetails: {
    flex: 1,
    minWidth: 0,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  cardTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
  },
  cardDate: {
    fontSize: 11,
  },
  cardMembersCount: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  cardMemberNames: {
    fontSize: 12,
    marginTop: 2,
  },
  deleteBtn: {
    padding: 8,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyIconWrap: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  emptyTitle: {
    fontSize: 19,
    fontWeight: '800',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyDesc: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 24,
  },
  emptyActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 16,
    elevation: 3,
  },
  emptyActionBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
