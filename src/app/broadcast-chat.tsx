import { Image } from 'expo-image';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import EmojiPicker, { type EmojiType } from 'rn-emoji-keyboard';

import { VibeAvatar } from '../components/vibe-ui';
import { useAppTheme } from '../context/theme-context';
import { supabase } from '../supabase';
import {
  deleteBroadcastList,
  deliverBroadcastMessage,
  fetchBroadcastHistory,
  fetchBroadcastListById,
  updateBroadcastList,
  type BroadcastHistoryItem,
  type BroadcastList,
  type BroadcastMember,
} from '../utils/broadcast';

const MAX_ATTACHMENT_SIZE = 25 * 1024 * 1024; // 25 MB

export default function BroadcastChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useAppTheme();

  const [currentUser, setCurrentUser] = useState<{ id: string; name?: string; email?: string } | null>(null);
  const [list, setList] = useState<BroadcastList | null>(null);
  const [history, setHistory] = useState<BroadcastHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Composer state
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  const [pendingAttachment, setPendingAttachment] = useState<{
    uri: string;
    name: string;
    contentType: string;
    size?: number | null;
    type: 'image' | 'document';
    file?: any;
  } | null>(null);

  // Manage List Modal state
  const [showManageModal, setShowManageModal] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState('');
  const [isUpdatingList, setIsUpdatingList] = useState(false);

  // Add Recipients Modal state
  const [showAddMembersModal, setShowAddMembersModal] = useState(false);
  const [availableContacts, setAvailableContacts] = useState<BroadcastMember[]>([]);
  const [selectedAddIds, setSelectedAddIds] = useState<string[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);

  const flatListRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);

  // Load current user
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (user) {
        let senderName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Vibe User';
        try {
          const { data: prof } = await supabase.from('profiles').select('full_name').eq('id', user.id).single();
          if (prof?.full_name) senderName = prof.full_name;
        } catch {}
        setCurrentUser({ id: user.id, name: senderName, email: user.email });
      }
    });
  }, []);

  // Load broadcast list details and history
  const loadData = useCallback(async () => {
    if (!id || !currentUser?.id) return;
    try {
      const data = await fetchBroadcastListById(currentUser.id, id);
      if (data) {
        setList(data);
        setNewName(data.name);
      }
      const historyData = await fetchBroadcastHistory(id);
      setHistory(historyData);
    } catch (err) {
      console.warn('Error loading broadcast detail:', err);
    } finally {
      setLoading(false);
    }
  }, [id, currentUser?.id]);

  useFocusEffect(
    useCallback(() => {
      if (id && currentUser?.id) {
        void loadData();
      }
    }, [id, currentUser?.id, loadData])
  );

  useEffect(() => {
    if (id && currentUser?.id) {
      void loadData();
    }
  }, [id, currentUser?.id, loadData]);

  // Load potential contacts to add
  const loadContactsForAdd = async () => {
    if (!currentUser?.id || !list) return;
    setLoadingContacts(true);
    try {
      const existingMemberIds = new Set(list.members.map((m) => m.id));
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, avatar_url, is_online')
        .neq('id', currentUser.id)
        .order('full_name', { ascending: true });

      if (!error && data) {
        const available: BroadcastMember[] = data
          .filter((item: any) => !existingMemberIds.has(item.id))
          .map((item: any) => ({
            id: item.id,
            name: item.full_name || 'Vibe User',
            email: item.email || '',
            photoURL: item.avatar_url || null,
            isOnline: Boolean(item.is_online),
          }));
        setAvailableContacts(available);
      }
    } catch (err) {
      console.warn('Error fetching contacts for add:', err);
    } finally {
      setLoadingContacts(false);
    }
  };

  // Attachment pickers
  const pickPhoto = async () => {
    setShowAttachmentMenu(false);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission required', 'Please enable photo access to send images.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.85,
      });
      if (result.canceled || !result.assets[0]) return;

      const asset = result.assets[0];
      if (asset.fileSize && asset.fileSize > MAX_ATTACHMENT_SIZE) {
        Alert.alert('Image too large', 'Please select an image smaller than 25 MB.');
        return;
      }

      setPendingAttachment({
        uri: asset.uri,
        name: asset.fileName || `photo-${Date.now()}.jpg`,
        contentType: asset.mimeType || 'image/jpeg',
        size: asset.fileSize ?? null,
        type: 'image',
        file: asset.file,
      });
    } catch (error) {
      console.error('Photo picker error:', error);
      Alert.alert('Error', 'Could not open image picker.');
    }
  };

  const pickDocument = async () => {
    setShowAttachmentMenu(false);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets || !result.assets[0]) return;

      const asset = result.assets[0];
      if (asset.size && asset.size > MAX_ATTACHMENT_SIZE) {
        Alert.alert('File too large', 'Please select a file smaller than 25 MB.');
        return;
      }

      setPendingAttachment({
        uri: asset.uri,
        name: asset.name || `document-${Date.now()}`,
        contentType: asset.mimeType || 'application/octet-stream',
        size: asset.size ?? null,
        type: 'document',
        file: asset.file,
      });
    } catch (error) {
      console.error('Document picker error:', error);
      Alert.alert('Error', 'Could not open document picker.');
    }
  };

  const insertEmoji = (emoji: string) => {
    setMessageText((prev) => `${prev}${prev && !prev.endsWith(' ') ? ' ' : ''}${emoji}`);
    setShowEmojiPicker(false);
  };

  // Deliver broadcast message
  const handleSend = async () => {
    if (!list || !currentUser?.id) return;
    const trimmed = messageText.trim();
    if (!trimmed && !pendingAttachment) return;

    if (list.members.length === 0) {
      Alert.alert('No Recipients', 'This broadcast list has no recipients. Add contacts to send a broadcast.');
      return;
    }

    setSending(true);
    Keyboard.dismiss();
    setShowAttachmentMenu(false);
    setShowEmojiPicker(false);

    const attachmentPayload = pendingAttachment ? { ...pendingAttachment } : undefined;
    const outgoingText = trimmed;

    // Reset composer state immediately for responsive feel
    setMessageText('');
    setPendingAttachment(null);

    try {
      const result = await deliverBroadcastMessage({
        ownerId: currentUser.id,
        broadcastId: list.id,
        senderName: currentUser.name || 'You',
        messageText: outgoingText,
        members: list.members,
        attachment: attachmentPayload,
      });

      if (result.success) {
        // Refresh history
        const updatedHistory = await fetchBroadcastHistory(list.id);
        setHistory(updatedHistory);
      } else {
        const errorMsg = result.errors.length > 0 ? result.errors[0] : 'Failed to send broadcast.';
        Alert.alert('Delivery Notice', errorMsg);
        // Restore text in case of full failure
        setMessageText(outgoingText);
      }
    } catch (err: any) {
      console.error('Error in handleSend broadcast:', err);
      Alert.alert('Error', err?.message || 'Could not send broadcast.');
      setMessageText(outgoingText);
    } finally {
      setSending(false);
    }
  };

  // Manage list actions
  const handleSaveName = async () => {
    if (!list || !currentUser?.id) return;
    const trimmed = newName.trim();
    if (!trimmed || trimmed === list.name) {
      setEditingName(false);
      return;
    }
    setIsUpdatingList(true);
    try {
      const updated = await updateBroadcastList(currentUser.id, list.id, { name: trimmed });
      setList(updated);
      setEditingName(false);
    } catch {
      Alert.alert('Error', 'Could not update list name.');
    } finally {
      setIsUpdatingList(false);
    }
  };

  const handleRemoveMember = async (memberId: string, memberName: string) => {
    if (!list || !currentUser?.id) return;
    Alert.alert('Remove Contact', `Remove ${memberName} from this broadcast list?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setIsUpdatingList(true);
          try {
            const nextMembers = list.members.filter((m) => m.id !== memberId);
            const updated = await updateBroadcastList(currentUser.id, list.id, { members: nextMembers });
            setList(updated);
          } catch {
            Alert.alert('Error', 'Could not remove contact.');
          } finally {
            setIsUpdatingList(false);
          }
        },
      },
    ]);
  };

  const handleConfirmAddMembers = async () => {
    if (!list || !currentUser?.id || selectedAddIds.length === 0) return;
    setIsUpdatingList(true);
    try {
      const addedMembers = availableContacts.filter((c) => selectedAddIds.includes(c.id));
      const nextMembers = [...list.members, ...addedMembers];
      const updated = await updateBroadcastList(currentUser.id, list.id, { members: nextMembers });
      setList(updated);
      setShowAddMembersModal(false);
      setSelectedAddIds([]);
    } catch {
      Alert.alert('Error', 'Could not add contacts.');
    } finally {
      setIsUpdatingList(false);
    }
  };

  const handleDeleteThisList = () => {
    if (!list || !currentUser?.id) return;
    Alert.alert(
      'Delete Broadcast List',
      `Are you sure you want to delete "${list.name}"? Recipients and past direct chats will not be affected.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteBroadcastList(currentUser.id, list.id);
              setShowManageModal(false);
              router.replace('/broadcasts' as any);
            } catch {
              Alert.alert('Error', 'Could not delete broadcast list.');
            }
          },
        },
      ]
    );
  };

  const formatMessageTime = (dateIso: string) => {
    try {
      const d = new Date(dateIso);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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
          accessibilityLabel="Back"
        >
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.headerInfoArea}
          onPress={() => setShowManageModal(true)}
          activeOpacity={0.7}
        >
          <View style={styles.headerIconBadge}>
            <Ionicons name="megaphone" size={18} color="#FFFFFF" />
          </View>

          <View style={styles.headerTextWrap}>
            <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
              {list?.name || 'Broadcast List'}
            </Text>
            <Text style={[styles.headerSubtitle, { color: colors.primary }]}>
              {list ? `${list.members.length} recipients • Tap for info` : 'Loading...'}
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setShowManageModal(true)}
          style={styles.headerMoreBtn}
          accessibilityRole="button"
          accessibilityLabel="Broadcast List Info"
        >
          <Ionicons name="ellipsis-vertical" size={20} color={colors.text} />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {loading ? (
          <View style={styles.loadingCenter}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : !list ? (
          <View style={styles.emptyContainer}>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>Broadcast List not found</Text>
            <TouchableOpacity style={styles.backActionBtn} onPress={() => router.back()}>
              <Text style={styles.backActionBtnText}>Go Back</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.chatBody}>
            {/* Messages Feed */}
            <FlatList
              ref={flatListRef}
              data={history}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.messagesList}
              ListHeaderComponent={
                <View style={styles.feedHeader}>
                  {/* WhatsApp-style Privacy Notice */}
                  <View style={[styles.privacyNoticeCard, { backgroundColor: isDark ? '#1E1B4B' : '#EEF2FF', borderColor: isDark ? '#3730A3' : '#C7D2FE' }]}>
                    <Ionicons name="shield-checkmark" size={18} color="#6366F1" style={styles.privacyIcon} />
                    <Text style={[styles.privacyText, { color: isDark ? '#C7D2FE' : '#3730A3' }]}>
                      You created a broadcast list with <Text style={styles.boldText}>{list.members.length} recipients</Text>. Each recipient receives your message as a private 1-to-1 direct chat. Their replies will appear only in your individual chat with them.
                    </Text>
                  </View>

                  {/* Recipient preview chips */}
                  {list.members.length > 0 && (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.recipientChipsScroll}
                    >
                      {list.members.map((m) => (
                        <View key={m.id} style={[styles.recipientChip, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                          <VibeAvatar name={m.name} photoURL={m.photoURL} size={20} />
                          <Text style={[styles.recipientChipName, { color: colors.text }]} numberOfLines={1}>
                            {m.name.split(' ')[0]}
                          </Text>
                        </View>
                      ))}
                    </ScrollView>
                  )}
                </View>
              }
              ListEmptyComponent={
                <View style={styles.emptyFeed}>
                  <View style={[styles.emptyFeedIconWrap, { backgroundColor: colors.primarySoft }]}>
                    <Ionicons name="chatbubbles-outline" size={36} color={colors.primary} />
                  </View>
                  <Text style={[styles.emptyFeedTitle, { color: colors.text }]}>No messages sent yet</Text>
                  <Text style={[styles.emptyFeedDesc, { color: colors.textSecondary }]}>
                    Send a message below to reach all {list.members.length} recipients simultaneously via direct message.
                  </Text>
                </View>
              }
              renderItem={({ item }) => (
                <View style={styles.messageRow}>
                  <View style={[styles.messageBubble, { backgroundColor: colors.primary }]}>
                    {/* Attachment preview if any */}
                    {item.attachmentType === 'image' && item.attachmentPath && (
                      <View style={styles.bubbleImageWrapper}>
                        <Ionicons name="image" size={20} color="#FFFFFF" style={{ marginBottom: 4 }} />
                        <Text style={styles.attachmentNameText}>Photo Broadcast</Text>
                      </View>
                    )}
                    {item.attachmentType === 'document' && (
                      <View style={styles.bubbleDocWrapper}>
                        <Ionicons name="document-text" size={24} color="#FFFFFF" />
                        <Text style={styles.attachmentNameText} numberOfLines={1}>
                          {item.attachmentName || 'Document'}
                        </Text>
                      </View>
                    )}

                    {/* Text */}
                    {Boolean(item.text) && (
                      <Text style={styles.messageBubbleText}>{item.text}</Text>
                    )}

                    {/* Delivery Footer */}
                    <View style={styles.messageBubbleFooter}>
                      <Text style={styles.messageBubbleTime}>{formatMessageTime(item.createdAt)}</Text>
                      <View style={styles.deliveryCheckWrap}>
                        <Ionicons name="checkmark-done" size={15} color="#E0E7FF" />
                        <Text style={styles.deliveryCountText}>
                          {item.sentCount} {item.sentCount === 1 ? 'recipient' : 'recipients'}
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>
              )}
            />

            {/* Pending Attachment Preview Bar */}
            {pendingAttachment && (
              <View style={[styles.attachmentPreview, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                {pendingAttachment.type === 'image' ? (
                  <Image source={{ uri: pendingAttachment.uri }} style={styles.attachmentThumbnail} />
                ) : (
                  <View style={styles.attachmentDocIcon}>
                    <Ionicons name="document-text" size={24} color="#167A67" />
                  </View>
                )}
                <View style={styles.attachmentInfoWrap}>
                  <Text style={[styles.attachmentName, { color: colors.text }]} numberOfLines={1}>
                    {pendingAttachment.name}
                  </Text>
                  <Text style={[styles.attachmentMeta, { color: colors.textSecondary }]}>
                    {pendingAttachment.type === 'image' ? 'Photo' : 'Document'}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setPendingAttachment(null)}
                  style={styles.attachmentRemoveBtn}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="close-circle" size={22} color="#EF4444" />
                </TouchableOpacity>
              </View>
            )}

            {/* Attachment Menu Popup */}
            {showAttachmentMenu && (
              <View style={[styles.attachmentMenu, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <TouchableOpacity
                  style={styles.attachmentOption}
                  onPress={pickPhoto}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityLabel="Attach photo"
                >
                  <View style={[styles.attachmentOptionIcon, { backgroundColor: '#EEF2FF' }]}>
                    <Ionicons name="image" size={22} color="#6366F1" />
                  </View>
                  <Text style={[styles.attachmentOptionText, { color: colors.text }]}>Photo</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.attachmentOption}
                  onPress={pickDocument}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityLabel="Attach document"
                >
                  <View style={[styles.attachmentOptionIcon, { backgroundColor: '#E8F7F3' }]}>
                    <Ionicons name="document-text" size={22} color="#167A67" />
                  </View>
                  <Text style={[styles.attachmentOptionText, { color: colors.text }]}>Document</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Composer Bar */}
            <View
              style={[
                styles.composerContainer,
                {
                  backgroundColor: colors.surface,
                  borderTopColor: colors.border,
                  paddingBottom: Math.max(insets.bottom, 8),
                },
              ]}
            >
              <View style={styles.inputRow}>
                <View style={[styles.inputCard, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }]}>
                  <TouchableOpacity
                    style={styles.inputIconButton}
                    onPress={() => {
                      Keyboard.dismiss();
                      setShowAttachmentMenu(false);
                      setShowEmojiPicker((prev) => !prev);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Choose emoji"
                    activeOpacity={0.7}
                  >
                    <Ionicons name={showEmojiPicker ? 'happy' : 'happy-outline'} size={24} color="#6366F1" />
                  </TouchableOpacity>

                  <TextInput
                    ref={inputRef}
                    value={messageText}
                    onChangeText={setMessageText}
                    onFocus={() => {
                      setShowAttachmentMenu(false);
                      setShowEmojiPicker(false);
                    }}
                    placeholder={`Message ${list.members.length} recipients...`}
                    placeholderTextColor="#94A3B8"
                    style={[styles.textInput, { color: colors.text }]}
                    multiline
                    maxLength={2000}
                    editable={!sending}
                  />

                  <TouchableOpacity
                    style={styles.inputIconButton}
                    onPress={() => {
                      if (sending) return;
                      Keyboard.dismiss();
                      setShowEmojiPicker(false);
                      setShowAttachmentMenu((prev) => !prev);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Attach media"
                    activeOpacity={0.7}
                  >
                    <Ionicons name={showAttachmentMenu ? 'close' : 'attach-outline'} size={24} color="#64748B" />
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={[
                    styles.sendButton,
                    { backgroundColor: colors.primary },
                    (!messageText.trim() && !pendingAttachment) || sending ? styles.sendButtonDisabled : null,
                  ]}
                  onPress={handleSend}
                  disabled={(!messageText.trim() && !pendingAttachment) || sending}
                  accessibilityRole="button"
                  accessibilityLabel="Send broadcast message"
                  activeOpacity={0.85}
                >
                  {sending ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Ionicons name="arrow-up" size={24} color="#FFFFFF" />
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {/* Emoji Picker */}
        <EmojiPicker
          open={showEmojiPicker}
          onClose={() => setShowEmojiPicker(false)}
          onEmojiSelected={(emoji: EmojiType) => insertEmoji(emoji.emoji)}
          enableSearchBar
          enableRecentlyUsed
        />

        {/* Manage List Modal */}
        <Modal
          visible={showManageModal}
          animationType="slide"
          transparent
          onRequestClose={() => setShowManageModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
              {/* Modal Header */}
              <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
                <Text style={[styles.modalHeaderTitle, { color: colors.text }]}>Broadcast Info</Text>
                <TouchableOpacity onPress={() => setShowManageModal(false)} style={styles.modalCloseBtn}>
                  <Ionicons name="close" size={24} color="#64748B" />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
                {/* List Name Section */}
                <View style={styles.listHeroSection}>
                  <View style={styles.largeIconBadge}>
                    <Ionicons name="megaphone" size={32} color="#FFFFFF" />
                  </View>

                  {editingName ? (
                    <View style={styles.editNameRow}>
                      <TextInput
                        style={[styles.editNameInput, { color: colors.text, borderColor: colors.primary }]}
                        value={newName}
                        onChangeText={setNewName}
                        placeholder="Broadcast list name"
                        placeholderTextColor="#94A3B8"
                        maxLength={40}
                        autoFocus
                      />
                      <TouchableOpacity onPress={handleSaveName} style={styles.saveNameBtn} disabled={isUpdatingList}>
                        <Ionicons name="checkmark" size={20} color="#6366F1" />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => setEditingName(false)} style={styles.cancelNameBtn}>
                        <Ionicons name="close" size={20} color="#64748B" />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={styles.nameDisplayRow}>
                      <Text style={[styles.listNameHeading, { color: colors.text }]}>{list?.name}</Text>
                      <TouchableOpacity onPress={() => setEditingName(true)} style={styles.editNamePencil}>
                        <Ionicons name="pencil" size={16} color="#6366F1" />
                      </TouchableOpacity>
                    </View>
                  )}
                  <Text style={[styles.listRecipientSubtitle, { color: colors.textSecondary }]}>
                    {list?.members.length} recipients in this list
                  </Text>
                </View>

                {/* Add Recipients Button */}
                <TouchableOpacity
                  style={[styles.addRecipientsBtn, { backgroundColor: colors.primarySoft }]}
                  onPress={() => {
                    void loadContactsForAdd();
                    setShowAddMembersModal(true);
                  }}
                  activeOpacity={0.8}
                >
                  <Ionicons name="person-add-outline" size={18} color={colors.primary} />
                  <Text style={[styles.addRecipientsBtnText, { color: colors.primary }]}>Add Recipients</Text>
                </TouchableOpacity>

                {/* Recipients List */}
                <Text style={[styles.sectionHeading, { color: colors.textSecondary }]}>Recipients</Text>
                {(list?.members || []).map((m) => (
                  <View key={m.id} style={[styles.memberRow, { borderBottomColor: colors.border }]}>
                    <VibeAvatar name={m.name} photoURL={m.photoURL} size={40} online={m.isOnline} />
                    <View style={styles.memberInfo}>
                      <Text style={[styles.memberName, { color: colors.text }]}>{m.name}</Text>
                      <Text style={[styles.memberStatus, { color: colors.textSecondary }]}>
                        {m.isOnline ? 'Online' : m.email || 'Contact'}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => handleRemoveMember(m.id, m.name)}
                      style={styles.removeMemberBtn}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="trash-outline" size={18} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                ))}

                {/* Delete List Button */}
                <TouchableOpacity
                  style={styles.deleteListBtn}
                  onPress={handleDeleteThisList}
                  activeOpacity={0.8}
                >
                  <Ionicons name="trash-bin-outline" size={20} color="#EF4444" />
                  <Text style={styles.deleteListText}>Delete Broadcast List</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* Add Members Sub-Modal */}
        <Modal
          visible={showAddMembersModal}
          animationType="slide"
          transparent
          onRequestClose={() => setShowAddMembersModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
              <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
                <Text style={[styles.modalHeaderTitle, { color: colors.text }]}>Add to Broadcast</Text>
                <TouchableOpacity onPress={() => setShowAddMembersModal(false)} style={styles.modalCloseBtn}>
                  <Ionicons name="close" size={24} color="#64748B" />
                </TouchableOpacity>
              </View>

              {loadingContacts ? (
                <View style={styles.loadingCenter}>
                  <ActivityIndicator size="small" color={colors.primary} />
                </View>
              ) : availableContacts.length === 0 ? (
                <View style={styles.emptyAddBox}>
                  <Text style={[styles.emptyAddText, { color: colors.textSecondary }]}>
                    All existing contacts are already in this broadcast list.
                  </Text>
                </View>
              ) : (
                <FlatList
                  data={availableContacts}
                  keyExtractor={(item) => item.id}
                  style={styles.addContactsList}
                  renderItem={({ item }) => {
                    const isSelected = selectedAddIds.includes(item.id);
                    return (
                      <TouchableOpacity
                        style={[styles.candidateItem, isSelected && { backgroundColor: colors.primarySoft }]}
                        onPress={() => {
                          setSelectedAddIds((prev) =>
                            prev.includes(item.id) ? prev.filter((id) => id !== item.id) : [...prev, item.id]
                          );
                        }}
                        activeOpacity={0.7}
                      >
                        <VibeAvatar name={item.name} photoURL={item.photoURL} size={40} />
                        <View style={styles.candidateInfo}>
                          <Text style={[styles.candidateName, { color: colors.text }]}>{item.name}</Text>
                          <Text style={[styles.candidateEmail, { color: colors.textSecondary }]} numberOfLines={1}>
                            {item.email}
                          </Text>
                        </View>
                        <View style={[styles.checkboxWrap, isSelected && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
                          {isSelected && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}
                        </View>
                      </TouchableOpacity>
                    );
                  }}
                />
              )}

              <TouchableOpacity
                style={[
                  styles.confirmAddBtn,
                  { backgroundColor: colors.primary },
                  (selectedAddIds.length === 0 || isUpdatingList) && styles.confirmAddBtnDisabled,
                ]}
                onPress={handleConfirmAddMembers}
                disabled={selectedAddIds.length === 0 || isUpdatingList}
                activeOpacity={0.8}
              >
                {isUpdatingList ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.confirmAddBtnText}>Add Selected ({selectedAddIds.length})</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </KeyboardAvoidingView>
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
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    padding: 6,
    marginRight: 4,
  },
  headerInfoArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerIconBadge: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#6366F1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTextWrap: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  headerSubtitle: {
    fontSize: 12,
    marginTop: 1,
    fontWeight: '500',
  },
  headerMoreBtn: {
    padding: 8,
  },
  keyboardAvoid: {
    flex: 1,
  },
  loadingCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  backActionBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#6366F1',
    borderRadius: 8,
  },
  backActionBtnText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  chatBody: {
    flex: 1,
  },
  messagesList: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 16,
    flexGrow: 1,
  },
  feedHeader: {
    marginBottom: 14,
  },
  privacyNoticeCard: {
    flexDirection: 'row',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
  },
  privacyIcon: {
    marginRight: 8,
    marginTop: 2,
  },
  privacyText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
  },
  boldText: {
    fontWeight: '700',
  },
  recipientChipsScroll: {
    paddingVertical: 4,
    gap: 8,
  },
  recipientChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 6,
  },
  recipientChipName: {
    fontSize: 12,
    fontWeight: '500',
  },
  emptyFeed: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    paddingHorizontal: 24,
  },
  emptyFeedIconWrap: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyFeedTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
  },
  emptyFeedDesc: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  messageRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 10,
  },
  messageBubble: {
    maxWidth: '82%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    borderBottomRightRadius: 4,
  },
  bubbleImageWrapper: {
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderRadius: 10,
    padding: 10,
    marginBottom: 6,
    alignItems: 'center',
  },
  bubbleDocWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderRadius: 10,
    padding: 8,
    marginBottom: 6,
    gap: 8,
  },
  attachmentNameText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  messageBubbleText: {
    color: '#FFFFFF',
    fontSize: 15,
    lineHeight: 20,
  },
  messageBubbleFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 4,
    gap: 6,
  },
  messageBubbleTime: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 11,
  },
  deliveryCheckWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  deliveryCountText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 11,
    fontWeight: '600',
  },
  attachmentPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 12,
    marginBottom: 8,
    padding: 8,
    borderRadius: 14,
    borderWidth: 1,
  },
  attachmentThumbnail: {
    width: 44,
    height: 44,
    borderRadius: 8,
  },
  attachmentDocIcon: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#E8F7F3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachmentInfoWrap: {
    flex: 1,
  },
  attachmentName: {
    fontSize: 13,
    fontWeight: '600',
  },
  attachmentMeta: {
    fontSize: 11,
    marginTop: 2,
  },
  attachmentRemoveBtn: {
    padding: 4,
  },
  attachmentMenu: {
    flexDirection: 'row',
    gap: 16,
    alignSelf: 'flex-start',
    marginHorizontal: 12,
    marginBottom: 8,
    padding: 10,
    borderRadius: 18,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  attachmentOption: {
    width: 76,
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
  },
  attachmentOptionIcon: {
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
  },
  attachmentOptionText: {
    fontSize: 12,
    fontWeight: '600',
  },
  composerContainer: {
    paddingHorizontal: 12,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  inputCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 24,
    paddingHorizontal: 8,
    paddingVertical: 4,
    minHeight: 44,
  },
  inputIconButton: {
    padding: 6,
  },
  textInput: {
    flex: 1,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 15,
    maxHeight: 120,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 1,
  },
  sendButtonDisabled: {
    opacity: 0.45,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 16,
    paddingBottom: 34,
    paddingHorizontal: 20,
    maxHeight: '88%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalHeaderTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  modalCloseBtn: {
    padding: 4,
  },
  modalScroll: {
    marginTop: 14,
  },
  listHeroSection: {
    alignItems: 'center',
    marginBottom: 18,
  },
  largeIconBadge: {
    width: 64,
    height: 64,
    borderRadius: 22,
    backgroundColor: '#6366F1',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  nameDisplayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  listNameHeading: {
    fontSize: 18,
    fontWeight: '700',
  },
  editNamePencil: {
    padding: 4,
  },
  editNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    paddingHorizontal: 12,
  },
  editNameInput: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 16,
    fontWeight: '600',
  },
  saveNameBtn: {
    padding: 8,
    backgroundColor: '#EEF2FF',
    borderRadius: 10,
  },
  cancelNameBtn: {
    padding: 8,
  },
  listRecipientSubtitle: {
    fontSize: 13,
    marginTop: 4,
  },
  addRecipientsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 14,
    marginBottom: 16,
  },
  addRecipientsBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  sectionHeading: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  memberInfo: {
    flex: 1,
    marginLeft: 12,
  },
  memberName: {
    fontSize: 15,
    fontWeight: '600',
  },
  memberStatus: {
    fontSize: 12,
    marginTop: 2,
  },
  removeMemberBtn: {
    padding: 8,
  },
  deleteListBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 24,
    marginBottom: 16,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: '#FEE2E2',
  },
  deleteListText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#EF4444',
  },
  emptyAddBox: {
    padding: 24,
    alignItems: 'center',
  },
  emptyAddText: {
    fontSize: 13,
    textAlign: 'center',
  },
  addContactsList: {
    maxHeight: 280,
    marginTop: 10,
  },
  candidateItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  candidateInfo: {
    flex: 1,
    marginLeft: 12,
  },
  candidateName: {
    fontSize: 15,
    fontWeight: '600',
  },
  candidateEmail: {
    fontSize: 12,
    marginTop: 2,
  },
  checkboxWrap: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#94A3B8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmAddBtn: {
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 14,
  },
  confirmAddBtnDisabled: {
    opacity: 0.5,
  },
  confirmAddBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
