import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { VibeAvatar } from '../components/vibe-ui';
import { useAppTheme } from '../context/theme-context';
import { supabase } from '../supabase';
import { createBroadcastList, type BroadcastMember } from '../utils/broadcast';

export default function NewBroadcastScreen() {
  const { colors, isDark } = useAppTheme();
  const [currentUser, setCurrentUser] = useState<{ id: string; email?: string } | null>(null);
  const [contacts, setContacts] = useState<BroadcastMember[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [listName, setListName] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setCurrentUser({ id: user.id, email: user.email });
      }
    });
  }, []);

  const loadContacts = useCallback(async () => {
    if (!currentUser?.id) return;
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, avatar_url, is_online')
        .neq('id', currentUser.id)
        .order('full_name', { ascending: true });

      if (!error && data) {
        const parsed: BroadcastMember[] = data.map((item: any) => ({
          id: item.id,
          name: item.full_name || 'Vibe User',
          email: item.email || '',
          photoURL: item.avatar_url || null,
          isOnline: Boolean(item.is_online),
        }));
        setContacts(parsed);
      }
    } catch (err) {
      console.warn('Error loading contacts:', err);
    } finally {
      setLoading(false);
    }
  }, [currentUser?.id]);

  useEffect(() => {
    if (currentUser?.id) {
      void loadContacts();
    }
  }, [currentUser?.id, loadContacts]);

  const filteredContacts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter((c) => `${c.name} ${c.email}`.toLowerCase().includes(q));
  }, [contacts, search]);

  const selectedMembers = useMemo(() => {
    return contacts.filter((c) => selectedIds.includes(c.id));
  }, [contacts, selectedIds]);

  const toggleSelect = (memberId: string) => {
    setSelectedIds((prev) =>
      prev.includes(memberId) ? prev.filter((id) => id !== memberId) : [...prev, memberId]
    );
  };

  const handleCreate = async () => {
    if (!currentUser?.id) return;
    if (selectedIds.length === 0) {
      Alert.alert('No recipients selected', 'Please select at least 1 contact for this broadcast list.');
      return;
    }

    const finalName = listName.trim() || `Broadcast (${selectedMembers.length} recipients)`;
    setSubmitting(true);

    try {
      const newList = await createBroadcastList(currentUser.id, finalName, selectedMembers);
      router.replace({
        pathname: '/broadcast-chat' as any,
        params: { id: newList.id },
      });
    } catch (err: any) {
      console.error('Failed to create broadcast list:', err);
      Alert.alert('Error', 'Could not create broadcast list. Please try again.');
    } finally {
      setSubmitting(false);
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
          accessibilityLabel="Back"
        >
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>

        <View style={styles.headerTitleWrap}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>New Broadcast</Text>
          <Text style={[styles.headerSubtitle, { color: colors.primary }]}>
            {selectedIds.length} of {contacts.length} selected
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.createHeaderBtn, selectedIds.length === 0 && styles.createHeaderBtnDisabled]}
          onPress={handleCreate}
          disabled={selectedIds.length === 0 || submitting}
          accessibilityRole="button"
          accessibilityLabel="Create Broadcast"
          activeOpacity={0.8}
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Ionicons name="checkmark" size={20} color="#FFFFFF" />
          )}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={styles.flexArea}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Name Input */}
        <View style={[styles.nameInputCard, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <Ionicons name="pencil-outline" size={18} color={colors.primary} style={styles.nameInputIcon} />
          <TextInput
            style={[styles.nameTextInput, { color: colors.text }]}
            placeholder="List name (optional, e.g. College Friends)"
            placeholderTextColor={colors.textSecondary}
            value={listName}
            onChangeText={setListName}
            maxLength={50}
          />
        </View>

        {/* Selected contacts chip row */}
        {selectedMembers.length > 0 && (
          <View style={[styles.chipsContainer, { borderBottomColor: colors.border }]}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsScroll}>
              {selectedMembers.map((m) => (
                <View key={`selected-${m.id}`} style={[styles.chip, { backgroundColor: colors.primarySoft }]}>
                  <VibeAvatar name={m.name} size={28} photoURL={m.photoURL} />
                  <Text style={[styles.chipText, { color: colors.primary }]} numberOfLines={1}>
                    {m.name.split(' ')[0]}
                  </Text>
                  <TouchableOpacity onPress={() => toggleSelect(m.id)} style={styles.chipRemoveBtn}>
                    <Ionicons name="close-circle" size={16} color={colors.primary} />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Search Bar */}
        <View style={[styles.searchBox, { backgroundColor: colors.surfaceSubtle, borderColor: colors.border }]}>
          <Ionicons name="search" size={18} color={colors.textSecondary} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Search contacts..."
            placeholderTextColor={colors.textSecondary}
            value={search}
            onChangeText={setSearch}
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Contacts List */}
        {loading ? (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : filteredContacts.length === 0 ? (
          <View style={styles.emptySearchBox}>
            <Text style={[styles.emptySearchText, { color: colors.textSecondary }]}>
              {search ? 'No matching contacts found' : 'No contacts available'}
            </Text>
          </View>
        ) : (
          <FlatList
            data={filteredContacts}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.contactsList}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const isSelected = selectedIds.includes(item.id);
              return (
                <TouchableOpacity
                  style={[
                    styles.contactItem,
                    { borderBottomColor: colors.border },
                    isSelected && { backgroundColor: isDark ? '#1E1B4B' : '#F5F3FF' },
                  ]}
                  onPress={() => toggleSelect(item.id)}
                  activeOpacity={0.7}
                >
                  <VibeAvatar name={item.name} size={44} photoURL={item.photoURL} online={item.isOnline} />

                  <View style={styles.contactDetails}>
                    <Text style={[styles.contactName, { color: colors.text }]} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={[styles.contactEmail, { color: colors.textSecondary }]} numberOfLines={1}>
                      {item.email}
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.checkboxWrap,
                      { borderColor: isSelected ? colors.primary : colors.border },
                      isSelected && { backgroundColor: colors.primary },
                    ]}
                  >
                    {isSelected && <Ionicons name="checkmark" size={15} color="#FFFFFF" />}
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        )}

        {/* Bottom Floating Action Bar */}
        <View style={[styles.bottomBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
          <TouchableOpacity
            style={[
              styles.createButton,
              { backgroundColor: colors.primary },
              (selectedIds.length === 0 || submitting) && styles.createButtonDisabled,
            ]}
            onPress={handleCreate}
            disabled={selectedIds.length === 0 || submitting}
            activeOpacity={0.85}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="paper-plane" size={18} color="#FFFFFF" />
                <Text style={styles.createButtonText}>
                  Create Broadcast ({selectedIds.length})
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  flexArea: { flex: 1 },
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
    fontWeight: '600',
  },
  createHeaderBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#6366F1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  createHeaderBtnDisabled: {
    backgroundColor: '#CBD5E1',
  },
  nameInputCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  nameInputIcon: {
    marginRight: 10,
  },
  nameTextInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 4,
  },
  chipsContainer: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  chipsScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 4,
    paddingRight: 8,
    paddingVertical: 4,
    borderRadius: 20,
    gap: 6,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  chipRemoveBtn: {
    padding: 2,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 6,
    paddingHorizontal: 12,
    height: 42,
    borderRadius: 14,
    borderWidth: 1,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptySearchBox: {
    paddingVertical: 36,
    alignItems: 'center',
  },
  emptySearchText: {
    fontSize: 14,
  },
  contactsList: {
    paddingBottom: 88,
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  contactDetails: {
    flex: 1,
    minWidth: 0,
  },
  contactName: {
    fontSize: 15,
    fontWeight: '700',
  },
  contactEmail: {
    fontSize: 12,
    marginTop: 2,
  },
  checkboxWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 24 : 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 16,
    gap: 8,
    elevation: 3,
  },
  createButtonDisabled: {
    backgroundColor: '#CBD5E1',
    elevation: 0,
  },
  createButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
