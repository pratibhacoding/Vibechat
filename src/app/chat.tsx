import { Image } from 'expo-image';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as Linking from 'expo-linking';
import { StatusBar } from 'expo-status-bar';
import * as WebBrowser from 'expo-web-browser';
import { RecordingPresets, requestRecordingPermissionsAsync, useAudioRecorder } from 'expo-audio';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
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
import { Feather, Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import { toByteArray } from 'base64-js';
import EmojiPicker, { type EmojiType } from 'rn-emoji-keyboard';

import { MessageBubble, type MessageReply } from '../components/message-bubble';
import { VibeAvatar, VibeEmptyState, VibeIcon, VibeIconButton } from '../components/vibe-ui';
import { useCall } from '../context/call-context';
import { useAppTheme } from '../context/theme-context';
import { supabase } from '../supabase';
import { notifyChatMembers } from '../utils/notifications';

type AttachmentType = 'image' | 'document' | 'audio';

type Message = {
  id: string;
  text: string;
  senderId: string;
  receiverId: string;
  senderName?: string;
  senderAvatar?: string | null;
  createdAt: Date | string | null;
  seen: boolean;
  attachmentType?: AttachmentType;
  attachmentPath?: string;
  attachmentUrl?: string;
  fileUrl?: string;
  fileName?: string;
  attachmentName?: string;
  attachmentContentType?: string;
  mimeType?: string;
  attachmentSize?: number;
  fileSize?: number;
  attachmentDuration?: number;
  replyTo?: MessageReply;
  reactions?: Record<string, string>;
  readBy?: string[];
};

type PendingAttachment = {
  uri: string;
  name: string;
  contentType: string;
  size: number | null;
  type: AttachmentType;
  file?: Blob;
};

type GroupMemberInfo = {
  uid: string;
  name: string;
  photoURL?: string | null;
  isOnline?: boolean;
  pushToken?: string | null;
  isAdmin?: boolean;
};

const MAX_ATTACHMENT_SIZE = 25 * 1024 * 1024;
const REACTION_EMOJIS = ['❤️', '👍', '😂', '😮', '😢'];

function createVoiceStoragePath(chatId: string): string {
  return `chats/${chatId}/audio/voice_${Date.now()}.m4a`;
}

function createVoiceFileName(): string {
  return `voice-${Date.now()}.m4a`;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

const findOrCreateDirectChat = async (currentId: string, recipientId: string): Promise<string | null> => {
  // 1. Try atomic RPC first
  try {
    const { data: rpcChatId, error: rpcErr } = await supabase.rpc('get_or_create_direct_chat', {
      p_recipient_id: recipientId,
    });
    if (!rpcErr && rpcChatId) {
      return rpcChatId as string;
    }
  } catch {}

  // 2. Fallback query if RPC has not been created in Supabase yet
  try {
    const { data: myDirectChats } = await supabase
      .from('chat_members')
      .select('chat_id, chats!inner(id, type)')
      .eq('user_id', currentId)
      .eq('chats.type', 'direct');

    if (myDirectChats && myDirectChats.length > 0) {
      const chatIds = myDirectChats.map((c) => c.chat_id);
      const { data: match } = await supabase
        .from('chat_members')
        .select('chat_id')
        .in('chat_id', chatIds)
        .eq('user_id', recipientId)
        .limit(1)
        .maybeSingle();

      if (match?.chat_id) {
        return match.chat_id;
      }
    }

    // Create new direct chat
    const { data: newChat, error: chatErr } = await supabase
      .from('chats')
      .insert({
        type: 'direct',
        created_by: currentId,
      })
      .select('id')
      .single();

    if (chatErr || !newChat) {
      console.warn('Failed to create direct chat:', chatErr);
      return null;
    }

    await supabase.from('chat_members').insert([
      { chat_id: newChat.id, user_id: currentId, role: 'member', unread_count: 0 },
      { chat_id: newChat.id, user_id: recipientId, role: 'member', unread_count: 0 },
    ]);

    return newChat.id;
  } catch (err) {
    console.warn('Error in findOrCreateDirectChat fallback:', err);
    return null;
  }
};

export default function ChatScreen() {
  const { colors, isDark } = useAppTheme();
  const { startCall } = useCall();
  const insets = useSafeAreaInsets();
  const [isFocused, setIsFocused] = useState(false);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);
  const listRef = useRef<FlatList<Message>>(null);
  const inputRef = useRef<TextInput>(null);
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingExpiry = useRef<ReturnType<typeof setTimeout> | null>(null);
  const presenceExpiry = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordingTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const typingState = useRef(false);
  const realtimeChannelRef = useRef<any>(null);

  const params = useLocalSearchParams<{
    uid?: string;
    name?: string;
    photoURL?: string;
    isGroup?: string;
    chatId?: string;
  }>();

  const isGroup = params.isGroup === 'true';
  const targetId = Array.isArray(params.uid) ? params.uid[0] : params.uid;
  const initialName = Array.isArray(params.name) ? params.name[0] : params.name;
  const initialPhoto = Array.isArray(params.photoURL) ? params.photoURL[0] : params.photoURL;
  const explicitChatId = Array.isArray(params.chatId) ? params.chatId[0] : params.chatId;

  const [supabaseUser, setSupabaseUser] = useState<{ id: string; email?: string } | null>(null);
  const [directChatId, setDirectChatId] = useState<string | null>(explicitChatId || null);
  const [currentUserName, setCurrentUserName] = useState('Vibe User');
  const [message, setMessage] = useState('');
  const [showQuickEmojis, setShowQuickEmojis] = useState(false);
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  const [pendingAttachment, setPendingAttachment] = useState<PendingAttachment | null>(null);
  const [attachmentUrls, setAttachmentUrls] = useState<Record<string, string>>({});
  const [attachmentErrors, setAttachmentErrors] = useState<Record<string, boolean>>({});
  const [isSending, setIsSending] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);

  // Profile / status of conversation
  const [chatName, setChatName] = useState(initialName || (isGroup ? 'Group Chat' : 'Conversation'));
  const [chatPhotoURL, setChatPhotoURL] = useState<string | null>(initialPhoto || null);
  const [otherIsTyping, setOtherIsTyping] = useState(false);
  const [otherIsOnline, setOtherIsOnline] = useState(false);
  const [otherLastSeen, setOtherLastSeen] = useState<Date | string | null>(null);
  const [appIsActive, setAppIsActive] = useState(() => AppState.currentState === 'active');

  // Group specific
  const [groupParticipants, setGroupParticipants] = useState<string[]>([]);
  const [groupMembers, setGroupMembers] = useState<GroupMemberInfo[]>([]);
  const [groupAdmins, setGroupAdmins] = useState<string[]>([]);
  const [groupCreatedBy, setGroupCreatedBy] = useState<string>('');
  const [groupTypingText, setGroupTypingText] = useState<string>('');
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [candidateUsers, setCandidateUsers] = useState<{ uid: string; name: string; photoURL?: string | null }[]>([]);
  const [selectedAddMemberUids, setSelectedAddMemberUids] = useState<string[]>([]);
  const [isEditingGroupName, setIsEditingGroupName] = useState(false);
  const [editedGroupName, setEditedGroupName] = useState('');
  const [isUpdatingGroup, setIsUpdatingGroup] = useState(false);

  // Reply and Reactions
  const [replyingTo, setReplyingTo] = useState<MessageReply | null>(null);
  const [selectedMessageForAction, setSelectedMessageForAction] = useState<Message | null>(null);

  // Voice recording
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);

  const effectiveChatId = isGroup ? (explicitChatId || targetId || '') : (directChatId || '');

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      setAppIsActive(nextState === 'active');
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => {
        setIsKeyboardVisible(true);
        requestAnimationFrame(() => {
          listRef.current?.scrollToEnd({ animated: true });
        });
      }
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        setIsKeyboardVisible(false);
      }
    );

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      setIsFocused(true);
      return () => setIsFocused(false);
    }, [])
  );

  // Supabase Auth session listener
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setSupabaseUser({ id: user.id, email: user.email });
        const metaName = user.user_metadata?.full_name || user.user_metadata?.name;
        if (metaName) setCurrentUserName(metaName);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setSupabaseUser({ id: session.user.id, email: session.user.email });
        const metaName = session.user.user_metadata?.full_name || session.user.user_metadata?.name;
        if (metaName) setCurrentUserName(metaName);
      } else {
        setSupabaseUser(null);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Direct chat resolution: ensure directChatId is resolved
  useEffect(() => {
    if (isGroup || directChatId || !supabaseUser || !targetId) return;

    let active = true;

    findOrCreateDirectChat(supabaseUser.id, targetId).then((resolvedId) => {
      if (active) {
        if (resolvedId) {
          setDirectChatId(resolvedId);
        } else {
          setLoading(false);
        }
      }
    });

    return () => {
      active = false;
    };
  }, [isGroup, directChatId, supabaseUser, targetId]);

  // Load recipient profile for direct chat
  useEffect(() => {
    if (isGroup || !targetId) return;

    let active = true;
    supabase
      .from('profiles')
      .select('id, full_name, avatar_url, is_online, last_seen')
      .eq('id', targetId)
      .maybeSingle()
      .then(({ data: profile }) => {
        if (!active || !profile) return;
        if (profile.full_name) setChatName(profile.full_name);
        if (profile.avatar_url) setChatPhotoURL(profile.avatar_url);
        setOtherIsOnline(profile.is_online === true);
        if (profile.last_seen) {
          setOtherLastSeen(new Date(profile.last_seen));
        }
      });

    return () => {
      active = false;
    };
  }, [isGroup, targetId]);

  // Load group details for group chat
  const loadGroupDetails = useCallback(async () => {
    if (!isGroup || !effectiveChatId) return;

    try {
      // 1. Fetch group chat row
      const { data: chatRow } = await supabase
        .from('chats')
        .select('name, photo_url, created_by')
        .eq('id', effectiveChatId)
        .maybeSingle();

      if (chatRow) {
        if (chatRow.name) setChatName(chatRow.name);
        if (chatRow.photo_url) {
          try {
            const { data: signedData } = await supabase.storage
              .from('vibechat-media')
              .createSignedUrl(chatRow.photo_url, 60 * 60 * 24);
            setChatPhotoURL(signedData?.signedUrl || chatRow.photo_url);
          } catch {
            setChatPhotoURL(chatRow.photo_url);
          }
        }
        if (chatRow.created_by) setGroupCreatedBy(chatRow.created_by);
      }

      // 2. Fetch group members with profiles
      const { data: membersData } = await supabase
        .from('chat_members')
        .select(`
          user_id,
          role,
          profiles!inner (
            id,
            full_name,
            avatar_url,
            is_online
          )
        `)
        .eq('chat_id', effectiveChatId);

      if (membersData) {
        const membersList: GroupMemberInfo[] = membersData.map((m: any) => ({
          uid: m.user_id,
          name: m.profiles?.full_name || 'Member',
          photoURL: m.profiles?.avatar_url || null,
          isOnline: m.profiles?.is_online === true,
          isAdmin: m.role === 'admin' || m.role === 'owner',
        }));

        setGroupMembers(membersList);
        setGroupParticipants(membersList.map((m) => m.uid));
        setGroupAdmins(membersList.filter((m) => m.isAdmin).map((m) => m.uid));
      }
    } catch (err) {
      console.warn('Error loading group details:', err);
    }
  }, [isGroup, effectiveChatId]);

  useFocusEffect(
    useCallback(() => {
      if (isGroup && effectiveChatId) {
        void loadGroupDetails();
      }
    }, [isGroup, effectiveChatId, loadGroupDetails])
  );

  // Load candidate users when adding group members
  useEffect(() => {
    if (!showAddMemberModal) return;

    const fetchCandidates = async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, full_name, avatar_url');
        if (error) throw error;
        if (data) {
          const list = data
            .filter((p) => !groupParticipants.includes(p.id))
            .map((p) => ({
              uid: p.id,
              name: p.full_name || 'Vibe User',
              photoURL: p.avatar_url || null,
            }));
          setCandidateUsers(list);
        }
      } catch (err) {
        console.warn('Fetch candidate users error:', err);
      }
    };
    fetchCandidates();
  }, [showAddMemberModal, groupParticipants]);

  const markMessagesAsSeen = useCallback(async (cId: string, uId: string, msgList?: any[]) => {
    try {
      await supabase
        .from('chat_members')
        .update({ unread_count: 0 })
        .eq('chat_id', cId)
        .eq('user_id', uId);

      const incoming = (msgList || []).filter((m) => (m.sender_id || m.senderId) !== uId);
      if (incoming.length > 0) {
        const nowIso = new Date().toISOString();
        const reads = incoming.map((m) => ({
          message_id: m.id,
          user_id: uId,
          read_at: nowIso,
        }));
        await supabase
          .from('message_reads')
          .upsert(reads, { onConflict: 'message_id,user_id', ignoreDuplicates: true });
      }
    } catch (err) {
      console.warn('Error in markMessagesAsSeen:', err);
    }
  }, []);

  // Messages loader & Supabase Realtime subscription
  useEffect(() => {
    if (!effectiveChatId || !supabaseUser) return;

    let active = true;

    const loadMessages = async () => {
      try {
        const { data: dbMessages, error: msgError } = await supabase
          .from('messages')
          .select('*')
          .eq('chat_id', effectiveChatId)
          .order('created_at', { ascending: true });

        if (msgError) {
          console.warn('Error fetching messages:', msgError);
          if (active) setLoading(false);
          return;
        }

        const msgList = dbMessages || [];
        const messageIds = msgList.map((m) => m.id);

        let readSet = new Set<string>();
        const reactionsMap: Record<string, Record<string, string>> = {};

        if (messageIds.length > 0) {
          // Read receipts
          const { data: readRows } = await supabase
            .from('message_reads')
            .select('message_id, user_id')
            .in('message_id', messageIds)
            .neq('user_id', supabaseUser.id);

          if (readRows) {
            readRows.forEach((r) => readSet.add(r.message_id));
          }

          // Reactions
          const { data: reactionRows } = await supabase
            .from('message_reactions')
            .select('message_id, user_id, reaction')
            .in('message_id', messageIds);

          if (reactionRows) {
            reactionRows.forEach((r) => {
              if (!reactionsMap[r.message_id]) {
                reactionsMap[r.message_id] = {};
              }
              reactionsMap[r.message_id][r.user_id] = r.reaction;
            });
          }
        }

        if (active) {
          const mapped: Message[] = msgList.map((m) => {
            const isMine = m.sender_id === supabaseUser.id;
            const seen = isMine ? readSet.has(m.id) : true;
            return {
              id: m.id,
              text: m.text || '',
              senderId: m.sender_id,
              receiverId: targetId || (isGroup ? 'group' : ''),
              createdAt: m.created_at ? new Date(m.created_at) : null,
              seen,
              attachmentType: m.message_type === 'image' || m.message_type === 'document' || m.message_type === 'file' || m.message_type === 'audio'
                ? (m.message_type === 'file' ? 'document' : m.message_type)
                : undefined,
              attachmentPath: m.storage_path,
              attachmentUrl: undefined,
              fileUrl: undefined,
              fileName: m.file_name,
              attachmentName: m.file_name,
              mimeType: m.mime_type,
              fileSize: m.file_size,
              attachmentSize: m.file_size,
              replyTo: m.reply_to && typeof m.reply_to.text === 'string' ? m.reply_to : undefined,
              reactions: reactionsMap[m.id],
            };
          });

          setMessages(mapped);
          setLoading(false);
          requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
        }

        if (isFocused && appIsActive) {
          void markMessagesAsSeen(effectiveChatId, supabaseUser.id, msgList);
        }
      } catch (err) {
        console.warn('Load messages error:', err);
        if (active) setLoading(false);
      }
    };

    void loadMessages();

    // STEP 2 & STEP 13: Unique topic per mount, handlers registered before subscribe()
    const channelTopic = `chat_${effectiveChatId}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const channel = supabase.channel(channelTopic);
    realtimeChannelRef.current = channel;

    channel
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `chat_id=eq.${effectiveChatId}`,
        },
        async (payload) => {
          const newRow = payload.new;
          if (!newRow) return;

          setMessages((prev) => {
            if (prev.some((m) => m.id === newRow.id)) return prev;
            const isMine = newRow.sender_id === supabaseUser.id;
            const newMsg: Message = {
              id: newRow.id,
              text: newRow.text || '',
              senderId: newRow.sender_id,
              receiverId: targetId || (isGroup ? 'group' : ''),
              createdAt: newRow.created_at ? new Date(newRow.created_at) : null,
              seen: isMine ? false : true,
              attachmentType: newRow.message_type === 'image' || newRow.message_type === 'document' || newRow.message_type === 'file' || newRow.message_type === 'audio'
                ? (newRow.message_type === 'file' ? 'document' : newRow.message_type)
                : undefined,
              attachmentPath: newRow.storage_path,
              attachmentUrl: undefined,
              fileName: newRow.file_name,
              attachmentName: newRow.file_name,
              mimeType: newRow.mime_type,
              replyTo: newRow.reply_to && typeof newRow.reply_to.text === 'string' ? newRow.reply_to : undefined,
            };
            return [...prev, newMsg];
          });
          requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));

          if (newRow.sender_id !== supabaseUser.id && isFocused && appIsActive) {
            try {
              await supabase
                .from('chat_members')
                .update({ unread_count: 0 })
                .eq('chat_id', effectiveChatId)
                .eq('user_id', supabaseUser.id);

              await supabase.from('message_reads').upsert({
                message_id: newRow.id,
                user_id: supabaseUser.id,
                read_at: new Date().toISOString(),
              }, { onConflict: 'message_id,user_id', ignoreDuplicates: true });
            } catch {}
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'message_reads',
        },
        (payload) => {
          const readRow = payload.new;
          if (readRow && readRow.user_id !== supabaseUser.id && readRow.message_id) {
            setMessages((prev) =>
              prev.map((m) => (m.id === readRow.message_id ? { ...m, seen: true } : m))
            );
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'message_reactions',
        },
        (payload) => {
          const changedRow = (payload.new || payload.old) as any;
          if (!changedRow?.message_id) return;

          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== changedRow.message_id) return m;
              const currentReactions = { ...(m.reactions || {}) };
              if (payload.eventType === 'DELETE') {
                delete currentReactions[changedRow.user_id];
              } else {
                currentReactions[changedRow.user_id] = changedRow.reaction;
              }
              return { ...m, reactions: currentReactions };
            })
          );
        }
      )
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (!payload || payload.userId === supabaseUser.id) return;
        if (payload.isTyping) {
          if (isGroup) {
            setGroupTypingText(`${payload.userName || 'Someone'} is typing...`);
            if (typingExpiry.current) clearTimeout(typingExpiry.current);
            typingExpiry.current = setTimeout(() => setGroupTypingText(''), 2500);
          } else {
            setOtherIsTyping(true);
            if (typingExpiry.current) clearTimeout(typingExpiry.current);
            typingExpiry.current = setTimeout(() => setOtherIsTyping(false), 2500);
          }
        } else {
          if (isGroup) setGroupTypingText('');
          else setOtherIsTyping(false);
        }
      });

    channel.subscribe();

    return () => {
      active = false;
      realtimeChannelRef.current = null;
      supabase.removeChannel(channel);
      if (typingExpiry.current) clearTimeout(typingExpiry.current);
      if (presenceExpiry.current) clearTimeout(presenceExpiry.current);
    };
  }, [effectiveChatId, supabaseUser, targetId, isGroup, isFocused, appIsActive, markMessagesAsSeen]);

  // Re-focus sync for seen receipts
  useEffect(() => {
    if (effectiveChatId && supabaseUser && isFocused && appIsActive && messages.length > 0) {
      void markMessagesAsSeen(
        effectiveChatId,
        supabaseUser.id,
        messages.map((m) => ({ id: m.id, sender_id: m.senderId }))
      );
    }
  }, [effectiveChatId, supabaseUser, isFocused, appIsActive, messages.length, markMessagesAsSeen]);

  // Private Supabase Storage bucket signed URL resolver
  const getSignedAttachmentUrl = useCallback(async (path: string): Promise<string> => {
    if (!path) throw new Error('Storage path is required');
    if (path.startsWith('http://') || path.startsWith('https://')) {
      return path;
    }
    try {
      const { data, error } = await supabase.storage
        .from('vibechat-media')
        .createSignedUrl(path, 60 * 60 * 24);
      if (!error && data?.signedUrl) {
        return data.signedUrl;
      }
      if (error) {
        console.warn('createSignedUrl error:', error);
        throw error;
      }
    } catch (err) {
      console.warn('createSignedUrl exception:', err);
      throw err;
    }
    throw new Error('Unable to resolve storage URL');
  }, []);

  useEffect(() => {
    let active = true;
    const messagesNeedingUrls = messages.filter(
      (item) => item.attachmentPath && !attachmentUrls[item.id] && !attachmentErrors[item.id]
    );

    if (messagesNeedingUrls.length === 0) return;

    messagesNeedingUrls.forEach(async (item) => {
      try {
        const url = await getSignedAttachmentUrl(item.attachmentPath!);
        if (active) {
          setAttachmentUrls((prev) => ({ ...prev, [item.id]: url }));
        }
      } catch (err) {
        console.warn('Attachment download URL unavailable:', err);
        if (active) {
          setAttachmentErrors((prev) => ({ ...prev, [item.id]: true }));
        }
      }
    });

    return () => {
      active = false;
    };
  }, [attachmentErrors, attachmentUrls, messages, getSignedAttachmentUrl]);

  const isCurrentUserAdmin = useMemo(() => {
    if (!supabaseUser) return false;
    return groupAdmins.includes(supabaseUser.id) || groupCreatedBy === supabaseUser.id;
  }, [supabaseUser, groupAdmins, groupCreatedBy]);

  const formatTime = (timestamp?: Date | string | null) => {
    if (!timestamp) return '';
    const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const formatLastSeen = (timestamp: Date | string | null) => {
    if (!timestamp) return 'Offline';
    const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
    if (isNaN(date.getTime())) return 'Offline';
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const timeStr = date.toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
    if (isToday) {
      return `Last seen today at ${timeStr}`;
    }
    return `Last seen ${date.toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
    })} at ${timeStr}`;
  };

  // STEP 5: Realtime broadcast typing indicator
  const setTyping = useCallback(
    (typing: boolean) => {
      if (!realtimeChannelRef.current || !supabaseUser) return;
      try {
        realtimeChannelRef.current.send({
          type: 'broadcast',
          event: 'typing',
          payload: {
            userId: supabaseUser.id,
            userName: currentUserName,
            isTyping: typing,
          },
        });
      } catch (err) {
        console.warn('Typing broadcast error:', err);
      }
    },
    [supabaseUser, currentUserName]
  );

  const handleMessageChange = (text: string) => {
    setMessage(text);
    if (typingTimeout.current) clearTimeout(typingTimeout.current);

    if (text.trim()) {
      if (!typingState.current) {
        typingState.current = true;
        setTyping(true);
      }
      typingTimeout.current = setTimeout(() => {
        typingState.current = false;
        setTyping(false);
      }, 1800);
    } else if (typingState.current) {
      typingState.current = false;
      setTyping(false);
    }
  };

  const insertQuickEmoji = (emoji: string) => {
    const nextMessage = `${message}${message && !message.endsWith(' ') ? ' ' : ''}${emoji}`;
    handleMessageChange(nextMessage);
    setShowQuickEmojis(false);
  };

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

  const handleAttachmentPress = () => {
    if (isSending) return;
    Keyboard.dismiss();
    setShowQuickEmojis(false);
    setShowAttachmentMenu((prev) => !prev);
  };

  const openAttachment = async (msg: Message) => {
    let url = attachmentUrls[msg.id] || msg.attachmentUrl || msg.fileUrl;
    if (!url && msg.attachmentPath) {
      try {
        url = await getSignedAttachmentUrl(msg.attachmentPath);
        setAttachmentUrls((prev) => ({ ...prev, [msg.id]: url! }));
      } catch {}
    }

    if (!url) {
      Alert.alert('File unavailable', 'The document link could not be loaded.');
      return;
    }

    try {
      if (Platform.OS === 'web') {
        window.open(url, '_blank');
        return;
      }
      const supported = await Linking.canOpenURL(url).catch(() => false);
      if (supported) {
        await Linking.openURL(url);
      } else {
        await WebBrowser.openBrowserAsync(url);
      }
    } catch (error) {
      console.error('Document open error:', error);
      Alert.alert('Cannot open file', 'Could not open this document on your device.');
    }
  };

  const handleCallPress = () => {
    if (isGroup) {
      Alert.alert('Voice Call', 'Voice calling is currently supported for 1-to-1 direct chats.');
      return;
    }
    if (!targetId) {
      Alert.alert('Voice Call', 'Recipient information is not available.');
      return;
    }
    void startCall(targetId, chatName, chatPhotoURL, 'voice', effectiveChatId);
  };

  const handleVideoCallPress = () => {
    if (isGroup) {
      Alert.alert('Video Call', 'Video calling is currently supported for 1-to-1 direct chats.');
      return;
    }
    if (!targetId) {
      Alert.alert('Video Call', 'Recipient information is not available.');
      return;
    }
    void startCall(targetId, chatName, chatPhotoURL, 'video', effectiveChatId);
  };

  // Voice recording logic
  const startRecording = async () => {
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Microphone permission required', 'Please enable microphone access in settings to send voice notes.');
        return;
      }

      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
      setIsRecording(true);
      setRecordingDuration(0);

      if (recordingTimer.current) clearInterval(recordingTimer.current);
      const startTime = Date.now();
      recordingTimer.current = setInterval(() => {
        setRecordingDuration(Math.floor((Date.now() - startTime) / 1000));
      }, 500);
    } catch (error) {
      console.error('Start recording error:', error);
      Alert.alert('Recording error', 'Could not start audio recording.');
    }
  };

  const cancelRecording = async () => {
    try {
      if (recordingTimer.current) clearInterval(recordingTimer.current);
      recordingTimer.current = null;
      await audioRecorder.stop();
    } catch (err) {
      console.warn('Cancel recording error:', err);
    } finally {
      setIsRecording(false);
      setRecordingDuration(0);
    }
  };

  // STEP 8: Voice notes uploaded to Supabase Storage vibechat-media
  const sendVoiceMessage = async () => {
    if (!supabaseUser || !effectiveChatId || !isRecording) return;

    try {
      if (recordingTimer.current) clearInterval(recordingTimer.current);
      recordingTimer.current = null;
      const finalDuration = recordingDuration;
      setIsRecording(false);
      setIsSending(true);

      await audioRecorder.stop();
      const uri = audioRecorder.uri;
      if (!uri) throw new Error('Audio file missing');

      const filePath = createVoiceStoragePath(effectiveChatId);
      const uploadedVoice = await uploadFileFromUri(uri, filePath, 'audio/m4a');

      const nowIso = new Date().toISOString();

      await supabase.from('messages').insert({
        chat_id: effectiveChatId,
        sender_id: supabaseUser.id,
        message_type: 'audio',
        text: '🎤 Voice message',
        storage_path: uploadedVoice.path,
        file_name: createVoiceFileName(),
        file_size: uploadedVoice.size,
        mime_type: 'audio/m4a',
        reply_to: replyingTo ? replyingTo : null,
      });

      await supabase.from('chats').update({
        last_message: '🎤 Voice message',
        last_message_at: nowIso,
        updated_at: nowIso,
      }).eq('id', effectiveChatId);

      void notifyChatMembers({
        chatId: effectiveChatId,
        senderId: supabaseUser.id,
        senderName: currentUserName,
        messageText: '🎤 Voice message',
        isGroup,
      });

      setReplyingTo(null);
    } catch (error) {
      console.error('Voice send error:', error);
      Alert.alert('Send failed', 'Could not send voice message. Try again.');
    } finally {
      setIsSending(false);
      setRecordingDuration(0);
    }
  };

  // STEP 8: Media upload helper for Supabase Storage (React Native & Web compatible)
  const uploadFileFromUri = async (
    uri: string,
    path: string,
    contentType: string,
    webFile?: Blob
  ): Promise<{ path: string; size: number }> => {
    let body: ArrayBuffer | Blob;

    if (Platform.OS === 'web') {
      if (webFile) {
        body = webFile;
      } else {
        const response = await fetch(uri);
        body = await response.blob();
      }
    } else {
      // In React Native on Android / iOS:
      const base64Data = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const uint8 = toByteArray(base64Data);
      body = uint8.buffer.slice(uint8.byteOffset, uint8.byteOffset + uint8.byteLength) as ArrayBuffer;
    }

    const { error } = await supabase.storage
      .from('vibechat-media')
      .upload(path, body, {
        contentType,
        upsert: true,
      });

    if (error) throw error;
    const size = body instanceof ArrayBuffer ? body.byteLength : (body as Blob).size;
    return { path, size };
  };

  // STEP 3 & STEP 5 & STEP 8: Send Text / Media / Group message via Supabase
  const sendMessage = async () => {
    const caption = message.trim();
    const attachment = pendingAttachment;

    if ((!caption && !attachment) || !supabaseUser || isSending) {
      return;
    }

    let activeChatId = effectiveChatId;
    if (!activeChatId && !isGroup && targetId) {
      activeChatId = (await findOrCreateDirectChat(supabaseUser.id, targetId)) || '';
      if (activeChatId) {
        setDirectChatId(activeChatId);
      }
    }

    if (!activeChatId) {
      Alert.alert('Error', 'Unable to initialize conversation.');
      return;
    }

    setIsSending(true);
    setUploadProgress(attachment ? 30 : 100);

    try {
      let uploadedAttachment: { path: string; size: number } | null = null;
      let messageText = caption;

      if (attachment) {
        const fileExt = attachment.name.includes('.') ? attachment.name.split('.').pop() : '';
        const sanitizedExt = fileExt ? `.${fileExt.replace(/[^a-zA-Z0-9]/g, '')}` : '';
        const nameWithoutExt = attachment.name.includes('.')
          ? attachment.name.substring(0, attachment.name.lastIndexOf('.'))
          : attachment.name;
        const sanitizedBase = nameWithoutExt.replace(/[^a-zA-Z0-9_-]/g, '_') || 'file';
        const uniqueFileName = `${Date.now()}_${sanitizedBase}${sanitizedExt}`;

        const folder = attachment.type === 'image' ? 'images' : 'documents';
        const attachmentPath = `chats/${activeChatId}/${folder}/${uniqueFileName}`;

        uploadedAttachment = await uploadFileFromUri(
          attachment.uri,
          attachmentPath,
          attachment.contentType,
          attachment.file
        );
        if (!uploadedAttachment?.path) {
          throw new Error('Attachment upload failed');
        }
        messageText = caption || (attachment.type === 'image' ? '[Photo]' : `[Document] ${attachment.name}`);
        setUploadProgress(75);
      }

      const nowIso = new Date().toISOString();
      const messageType = attachment
        ? (attachment.type === 'document' ? 'document' : 'image')
        : 'text';

      const { error: sendErr } = await supabase.from('messages').insert({
        chat_id: activeChatId,
        sender_id: supabaseUser.id,
        message_type: messageType,
        text: messageText,
        storage_path: uploadedAttachment?.path || null,
        file_name: attachment?.name || null,
        file_size: uploadedAttachment?.size || attachment?.size || null,
        mime_type: attachment?.contentType || null,
        reply_to: replyingTo ? replyingTo : null,
      });

      if (sendErr) throw sendErr;

      await supabase.from('chats').update({
        last_message: messageText,
        last_message_at: nowIso,
        updated_at: nowIso,
      }).eq('id', activeChatId);

      void notifyChatMembers({
        chatId: activeChatId,
        senderId: supabaseUser.id,
        senderName: currentUserName,
        messageText,
        isGroup,
      });

      setMessage('');
      setPendingAttachment(null);
      setReplyingTo(null);
      setShowQuickEmojis(false);
      setShowAttachmentMenu(false);
      typingState.current = false;
      setTyping(false);
    } catch (error: any) {
      console.error('Send message failed:', error);
      const errorMsg = error?.message || 'Message could not be sent. Please check your connection.';
      Alert.alert('Upload Error', errorMsg);
    } finally {
      setIsSending(false);
      setUploadProgress(0);
    }
  };

  // STEP 10: Toggle message reaction using Supabase message_reactions table
  const handleToggleReaction = async (targetMessage: Message, emoji: string) => {
    if (!supabaseUser || !effectiveChatId) return;

    try {
      const currentReaction = targetMessage.reactions?.[supabaseUser.id];
      if (currentReaction === emoji) {
        await supabase
          .from('message_reactions')
          .delete()
          .eq('message_id', targetMessage.id)
          .eq('user_id', supabaseUser.id);

        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== targetMessage.id) return m;
            const updated = { ...(m.reactions || {}) };
            delete updated[supabaseUser.id];
            return { ...m, reactions: updated };
          })
        );
      } else {
        await supabase
          .from('message_reactions')
          .upsert(
            {
              message_id: targetMessage.id,
              user_id: supabaseUser.id,
              reaction: emoji,
            },
            { onConflict: 'message_id,user_id' }
          );

        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== targetMessage.id) return m;
            return { ...m, reactions: { ...(m.reactions || {}), [supabaseUser.id]: emoji } };
          })
        );
      }
    } catch (error) {
      console.warn('Reaction toggle error:', error);
    }
  };

  // STEP 3: Group Admin Actions
  const handleChangeGroupPhoto = async () => {
    if (!isCurrentUserAdmin || !effectiveChatId || isUpdatingGroup) return;

    try {
      const { granted } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!granted) {
        Alert.alert('Permission needed', 'Please allow gallery access to update group photo.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (result.canceled || !result.assets[0]) return;

      setIsUpdatingGroup(true);
      const asset = result.assets[0];

      const uniqueName = `${Date.now()}_${Math.random().toString(36).substring(2, 6)}.jpg`;
      const photoPath = `chats/${effectiveChatId}/group_photos/${uniqueName}`;
      await uploadFileFromUri(asset.uri, photoPath, asset.mimeType || 'image/jpeg');

      // Use private storage signed URL strategy
      let signedUrl = photoPath;
      try {
        const { data: signedData } = await supabase.storage
          .from('vibechat-media')
          .createSignedUrl(photoPath, 60 * 60 * 24);
        if (signedData?.signedUrl) {
          signedUrl = signedData.signedUrl;
        }
      } catch {}

      // Update group info with storage path
      try {
        await supabase.rpc('update_group_info', {
          p_chat_id: effectiveChatId,
          p_photo_url: photoPath,
        });
      } catch {
        await supabase.from('chats').update({ photo_url: photoPath }).eq('id', effectiveChatId);
      }

      setChatPhotoURL(signedUrl);
      Alert.alert('Success', 'Group photo updated successfully.');
    } catch (error: any) {
      console.error('Update group photo failed:', error);
      Alert.alert('Photo Upload Failed', error?.message || 'Could not update group photo.');
    } finally {
      setIsUpdatingGroup(false);
    }
  };

  const handleSaveGroupName = async () => {
    const trimmed = editedGroupName.trim();
    if (!trimmed) {
      Alert.alert('Invalid Name', 'Group name cannot be empty.');
      return;
    }
    if (!isCurrentUserAdmin || !effectiveChatId || isUpdatingGroup) return;

    try {
      setIsUpdatingGroup(true);
      try {
        await supabase.rpc('update_group_info', {
          p_chat_id: effectiveChatId,
          p_name: trimmed,
        });
      } catch {
        await supabase.from('chats').update({ name: trimmed }).eq('id', effectiveChatId);
      }

      setChatName(trimmed);
      setIsEditingGroupName(false);
    } catch (error: any) {
      console.error('Update group name failed:', error);
      Alert.alert('Update Failed', error?.message || 'Could not update group name.');
    } finally {
      setIsUpdatingGroup(false);
    }
  };

  const handleAddMembers = async () => {
    if (selectedAddMemberUids.length === 0 || !effectiveChatId || !isCurrentUserAdmin || isUpdatingGroup) return;

    try {
      setIsUpdatingGroup(true);
      try {
        await supabase.rpc('add_group_members', {
          p_chat_id: effectiveChatId,
          p_member_ids: selectedAddMemberUids,
        });
      } catch {
        const rows = selectedAddMemberUids.map((uid) => ({
          chat_id: effectiveChatId,
          user_id: uid,
          role: 'member',
          unread_count: 0,
        }));
        await supabase.from('chat_members').insert(rows);
      }

      setSelectedAddMemberUids([]);
      setShowAddMemberModal(false);
      void loadGroupDetails();
      Alert.alert('Success', 'Members added successfully.');
    } catch (error: any) {
      console.error('Add members failed:', error);
      Alert.alert('Error', error?.message || 'Could not add members.');
    } finally {
      setIsUpdatingGroup(false);
    }
  };

  const handleRemoveMember = (memberUid: string, memberName: string) => {
    if (!isCurrentUserAdmin || !effectiveChatId || isUpdatingGroup) return;
    if (memberUid === supabaseUser?.id) {
      Alert.alert('Notice', 'Use "Leave Group" below if you wish to leave.');
      return;
    }

    Alert.alert(
      'Remove Member',
      `Are you sure you want to remove ${memberName} from this group?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              setIsUpdatingGroup(true);
              try {
                await supabase.rpc('remove_group_member', {
                  p_chat_id: effectiveChatId,
                  p_member_id: memberUid,
                });
              } catch {
                await supabase
                  .from('chat_members')
                  .delete()
                  .eq('chat_id', effectiveChatId)
                  .eq('user_id', memberUid);
              }
              void loadGroupDetails();
            } catch (error: any) {
              console.error('Remove member failed:', error);
              Alert.alert('Error', error?.message || 'Could not remove member.');
            } finally {
              setIsUpdatingGroup(false);
            }
          },
        },
      ]
    );
  };

  const handleLeaveGroup = () => {
    if (!supabaseUser || !effectiveChatId || isUpdatingGroup) return;

    Alert.alert(
      'Leave Group',
      'Are you sure you want to leave this group? You will no longer receive group messages.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            try {
              setIsUpdatingGroup(true);
              try {
                await supabase.rpc('remove_group_member', {
                  p_chat_id: effectiveChatId,
                  p_member_id: supabaseUser.id,
                });
              } catch {
                await supabase
                  .from('chat_members')
                  .delete()
                  .eq('chat_id', effectiveChatId)
                  .eq('user_id', supabaseUser.id);
              }
              setShowGroupModal(false);
              router.replace('/chats');
            } catch (err: any) {
              console.error('Leave group error:', err);
              Alert.alert('Error', err?.message || 'Could not leave group.');
            } finally {
              setIsUpdatingGroup(false);
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        {/* Header */}
        <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Back to conversations"
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={24} color="#0F172A" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.headerProfileArea}
            onPress={() => (isGroup ? setShowGroupModal(true) : setShowContactModal(true))}
            accessibilityRole="button"
            activeOpacity={0.7}
          >
            <VibeAvatar
              name={chatName}
              photoURL={chatPhotoURL}
              size={42}
              online={!isGroup && otherIsOnline}
            />

            <View style={styles.headerTextWrap}>
              <Text style={styles.headerName} numberOfLines={1}>
                {chatName}
              </Text>
              <Text
                style={[
                  styles.headerStatus,
                  (!isGroup && otherIsOnline) && styles.headerStatusOnline,
                ]}
                numberOfLines={1}
              >
                {isGroup
                  ? `${groupMembers.length} members`
                  : otherIsTyping
                    ? 'typing...'
                    : otherIsOnline
                      ? 'Online'
                      : formatLastSeen(otherLastSeen)}
              </Text>
            </View>
          </TouchableOpacity>

          <View style={styles.headerActions}>
            {!isGroup && (
              <>
                <TouchableOpacity
                  style={styles.headerCallButton}
                  onPress={handleCallPress}
                  accessibilityRole="button"
                  accessibilityLabel="Voice call"
                  activeOpacity={0.7}
                >
                  <Ionicons name="call-outline" size={20} color="#0F172A" />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.headerCallButton}
                  onPress={handleVideoCallPress}
                  accessibilityRole="button"
                  accessibilityLabel="Video call"
                  activeOpacity={0.7}
                >
                  <Ionicons name="videocam-outline" size={20} color="#0F172A" />
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity
              style={styles.moreButton}
              onPress={() => (isGroup ? setShowGroupModal(true) : setShowContactModal(true))}
              accessibilityRole="button"
              accessibilityLabel="More options"
              activeOpacity={0.7}
            >
              <Ionicons name="ellipsis-vertical" size={21} color="#0F172A" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Message list with soft lavender background and subtle messaging pattern */}
        <View style={styles.chatBody}>
          <View style={styles.patternLayer} pointerEvents="none">
            <Ionicons name="chatbubble-ellipses-outline" size={22} color="#6366F1" style={[styles.patternIcon, { top: '5%', left: '8%' }]} />
            <Ionicons name="heart-outline" size={18} color="#6366F1" style={[styles.patternIcon, { top: '12%', right: '12%' }]} />
            <Ionicons name="sparkles-outline" size={20} color="#6366F1" style={[styles.patternIcon, { top: '24%', left: '46%' }]} />
            <Ionicons name="happy-outline" size={20} color="#6366F1" style={[styles.patternIcon, { top: '35%', left: '12%' }]} />
            <Ionicons name="chatbubbles-outline" size={24} color="#6366F1" style={[styles.patternIcon, { top: '46%', right: '10%' }]} />
            <Ionicons name="star-outline" size={18} color="#6366F1" style={[styles.patternIcon, { top: '58%', left: '28%' }]} />
            <Ionicons name="paper-plane-outline" size={20} color="#6366F1" style={[styles.patternIcon, { top: '70%', right: '20%' }]} />
            <Ionicons name="heart-outline" size={16} color="#6366F1" style={[styles.patternIcon, { top: '82%', left: '10%' }]} />
            <Ionicons name="chatbubble-outline" size={20} color="#6366F1" style={[styles.patternIcon, { top: '92%', right: '14%' }]} />
          </View>

          {loading ? (
            <ActivityIndicator size="large" style={styles.loader} color="#6366F1" />
          ) : (
            <FlatList
              ref={listRef}
              data={messages}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.messages}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
              onLayout={() => listRef.current?.scrollToEnd({ animated: false })}
              ListEmptyComponent={
                <VibeEmptyState
                  title="Start the conversation"
                  description={
                    isGroup ? 'Send the first message to this group!' : 'Send a message to get things going.'
                  }
                />
              }
              renderItem={({ item, index }) => {
                const currentUserId = supabaseUser?.id;
                const isMyMessage = Boolean(currentUserId && item.senderId === currentUserId);
                const prevMessage = index > 0 ? messages[index - 1] : null;
                const isConsecutive = prevMessage && prevMessage.senderId === item.senderId;
                const shouldShowSenderHeader = isGroup && !isMyMessage && !isConsecutive;

                return (
                  <MessageBubble
                    text={item.text}
                    isMine={isMyMessage}
                    time={formatTime(item.createdAt)}
                    seen={item.seen}
                    senderName={shouldShowSenderHeader ? (item.senderName || 'Member') : undefined}
                    senderAvatar={shouldShowSenderHeader ? (item.senderAvatar || null) : undefined}
                    replyTo={item.replyTo}
                    reactions={item.reactions}
                    currentUserId={currentUserId}
                    onLongPress={() => setSelectedMessageForAction(item)}
                    onReactionPress={(emoji) => handleToggleReaction(item, emoji)}
                    attachment={
                      item.attachmentType
                        ? {
                            type: item.attachmentType,
                            name: item.attachmentName || 'Attachment',
                            url: attachmentUrls[item.id] || item.attachmentUrl || item.fileUrl,
                            unavailable: attachmentErrors[item.id] === true,
                            duration: item.attachmentDuration,
                            onPress: item.attachmentType === 'document' ? () => void openAttachment(item) : undefined,
                            isCaption:
                              item.attachmentType === 'image'
                                ? item.text !== '[Photo]'
                                : item.attachmentType === 'audio'
                                  ? false
                                  : item.text !== `[Document] ${item.attachmentName || 'Attachment'}`,
                          }
                        : undefined
                    }
                  />
                );
              }}
            />
          )}
        </View>

        {(isGroup ? Boolean(groupTypingText) : otherIsTyping) && (
          <Text style={styles.typingHint}>{isGroup ? groupTypingText : 'typing...'}</Text>
        )}

        {/* Attachment preview above composer */}
        {pendingAttachment && (
          <View style={styles.attachmentPreview}>
            {pendingAttachment.type === 'image' ? (
              <Image source={{ uri: pendingAttachment.uri }} style={styles.attachmentThumbnail} contentFit="cover" />
            ) : (
              <View style={[styles.attachmentThumbnail, styles.documentPreviewThumb]}>
                <Ionicons name="document-text" size={24} color="#6366F1" />
              </View>
            )}
            <View style={styles.attachmentDetails}>
              <Text style={styles.attachmentName} numberOfLines={1}>{pendingAttachment.name}</Text>
              <Text style={styles.attachmentMeta}>
                {pendingAttachment.size ? `${(pendingAttachment.size / 1024).toFixed(0)} KB` : 'Ready to send'}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setPendingAttachment(null)} style={styles.removeAttachmentBtn}>
              <Ionicons name="close" size={18} color="#64748B" />
            </TouchableOpacity>
          </View>
        )}

        {/* Reply Preview Bar above input */}
        {replyingTo && (
          <View style={styles.replyPreviewBar}>
            <View style={styles.replyPreviewLine} />
            <View style={styles.replyPreviewContent}>
              <Text style={styles.replyPreviewAuthor} numberOfLines={1}>
                Replying to {replyingTo.senderName || 'message'}
              </Text>
              <Text style={styles.replyPreviewText} numberOfLines={1}>
                {replyingTo.text}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setReplyingTo(null)} style={styles.replyPreviewClose}>
              <Ionicons name="close" size={18} color="#64748B" />
            </TouchableOpacity>
          </View>
        )}

        {/* Attachment menu options above composer */}
        {showAttachmentMenu && (
          <View style={styles.attachmentMenu}>
            <TouchableOpacity
              style={styles.attachmentOption}
              onPress={() => void pickPhoto()}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel="Attach photo"
            >
              <View style={[styles.attachmentOptionIcon, styles.photoOptionIcon]}>
                <Ionicons name="image" size={22} color="#6366F1" />
              </View>
              <Text style={styles.attachmentOptionText}>Photo</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.attachmentOption}
              onPress={() => void pickDocument()}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel="Attach document"
            >
              <View style={[styles.attachmentOptionIcon, styles.documentOptionIcon]}>
                <Ionicons name="document-text" size={22} color="#167A67" />
              </View>
              <Text style={styles.attachmentOptionText}>Document</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Composer Bar */}
        <View style={[styles.composerContainer, { backgroundColor: colors.surface, borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 8) }]}>
          {isRecording ? (
            <View style={styles.recorderBar}>
              <TouchableOpacity onPress={cancelRecording} style={styles.recorderCancelBtn}>
                <Ionicons name="trash-outline" size={22} color="#EF4444" />
              </TouchableOpacity>
              <View style={styles.recordingPulse}>
                <View style={styles.recordingRedDot} />
                <Text style={styles.recordingTimeText}>{formatDuration(recordingDuration)}</Text>
              </View>
              <TouchableOpacity onPress={sendVoiceMessage} style={styles.recorderSendBtn}>
                <Ionicons name="arrow-up" size={22} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.inputRow}>
              <View style={styles.inputCard}>
                <TouchableOpacity
                  style={styles.inputIconButton}
                  onPress={() => {
                    Keyboard.dismiss();
                    setShowAttachmentMenu(false);
                    setShowQuickEmojis((prev) => !prev);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Choose emoji"
                  activeOpacity={0.7}
                >
                  <Ionicons name={showQuickEmojis ? 'happy' : 'happy-outline'} size={24} color="#6366F1" />
                </TouchableOpacity>

                <TextInput
                  ref={inputRef}
                  value={message}
                  onChangeText={handleMessageChange}
                  onFocus={() => {
                    setShowAttachmentMenu(false);
                    setShowQuickEmojis(false);
                  }}
                  placeholder="Type a message..."
                  placeholderTextColor="#94A3B8"
                  style={styles.textInput}
                  multiline
                  maxLength={2000}
                />

                <TouchableOpacity
                  style={styles.inputIconButton}
                  onPress={handleAttachmentPress}
                  accessibilityRole="button"
                  accessibilityLabel="Attach media"
                  activeOpacity={0.7}
                >
                  <Ionicons name={showAttachmentMenu ? 'close' : 'attach-outline'} size={24} color="#64748B" />
                </TouchableOpacity>
              </View>

              {message.trim() || pendingAttachment ? (
                <TouchableOpacity
                  style={[styles.sendButton, isSending && styles.sendButtonDisabled]}
                  onPress={sendMessage}
                  disabled={isSending}
                  accessibilityRole="button"
                  accessibilityLabel="Send message"
                  activeOpacity={0.85}
                >
                  {isSending ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Ionicons name="arrow-up" size={24} color="#FFFFFF" />
                  )}
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={styles.micButton}
                  onPress={startRecording}
                  accessibilityRole="button"
                  accessibilityLabel="Record voice message"
                  activeOpacity={0.85}
                >
                  <Ionicons name="mic" size={22} color="#FFFFFF" />
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        <EmojiPicker
          open={showQuickEmojis}
          onClose={() => setShowQuickEmojis(false)}
          onEmojiSelected={(emoji: EmojiType) => insertQuickEmoji(emoji.emoji)}
          enableSearchBar
          enableRecentlyUsed
        />

        {/* Message Action Modal (Reactions + Reply) */}
        <Modal
          visible={Boolean(selectedMessageForAction)}
          animationType="fade"
          transparent
          onRequestClose={() => setSelectedMessageForAction(null)}
        >
          <TouchableOpacity
            style={styles.actionModalOverlay}
            activeOpacity={1}
            onPress={() => setSelectedMessageForAction(null)}
          >
            <View style={styles.actionModalContent}>
              <View style={styles.actionReactionsRow}>
                {REACTION_EMOJIS.map((emoji) => (
                  <TouchableOpacity
                    key={emoji}
                    style={styles.actionEmojiBtn}
                    onPress={() => {
                      if (selectedMessageForAction) {
                        void handleToggleReaction(selectedMessageForAction, emoji);
                        setSelectedMessageForAction(null);
                      }
                    }}
                  >
                    <Text style={styles.actionEmojiText}>{emoji}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.actionOptionsRow}>
                <TouchableOpacity
                  style={styles.actionOptionBtn}
                  onPress={() => {
                    if (selectedMessageForAction) {
                      setReplyingTo({
                        id: selectedMessageForAction.id,
                        text: selectedMessageForAction.text,
                        senderId: selectedMessageForAction.senderId,
                        senderName: selectedMessageForAction.senderName,
                      });
                      setSelectedMessageForAction(null);
                      inputRef.current?.focus();
                    }
                  }}
                >
                  <Ionicons name="return-up-back" size={20} color="#6366F1" />
                  <Text style={styles.actionOptionText}>Reply</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>
        </Modal>

        {/* Contact info modal for direct chat */}
        <Modal
          visible={showContactModal}
          animationType="slide"
          transparent
          onRequestClose={() => setShowContactModal(false)}
        >
          <View style={styles.contactModalOverlay}>
            <View style={styles.contactModalCard}>
              <View style={styles.contactModalHeader}>
                <Text style={styles.contactModalTitle}>Contact Info</Text>
                <TouchableOpacity onPress={() => setShowContactModal(false)}>
                  <Ionicons name="close" size={24} color="#64748B" />
                </TouchableOpacity>
              </View>

              <View style={styles.contactInfoBody}>
                <VibeAvatar name={chatName} photoURL={chatPhotoURL} size={88} online={otherIsOnline} />
                <Text style={styles.contactNameText}>{chatName}</Text>
                <Text style={styles.contactStatusText}>
                  {otherIsOnline ? 'Active now' : formatLastSeen(otherLastSeen)}
                </Text>

                <View style={{ flexDirection: 'row', marginTop: 18, gap: 14 }}>
                  <TouchableOpacity
                    style={[styles.contactActionBtn, { backgroundColor: '#EEF2FF' }]}
                    onPress={() => {
                      setShowContactModal(false);
                      handleCallPress();
                    }}
                  >
                    <Ionicons name="call" size={18} color="#6366F1" />
                    <Text style={{ fontSize: 13, fontWeight: '600', color: '#6366F1', marginTop: 4 }}>Audio</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.contactActionBtn, { backgroundColor: '#EEF2FF' }]}
                    onPress={() => {
                      setShowContactModal(false);
                      handleVideoCallPress();
                    }}
                  >
                    <Ionicons name="videocam" size={18} color="#6366F1" />
                    <Text style={{ fontSize: 13, fontWeight: '600', color: '#6366F1', marginTop: 4 }}>Video</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        </Modal>

        {/* Group Info Modal */}
        <Modal
          visible={showGroupModal}
          animationType="slide"
          transparent
          onRequestClose={() => setShowGroupModal(false)}
        >
          <View style={styles.groupModalOverlay}>
            <View style={styles.groupModalCard}>
              <View style={styles.groupModalHeader}>
                <Text style={styles.groupModalTitle}>Group Details</Text>
                <TouchableOpacity onPress={() => setShowGroupModal(false)}>
                  <Ionicons name="close" size={24} color="#64748B" />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.groupModalScroll} showsVerticalScrollIndicator={false}>
                {/* Group Photo & Name */}
                <View style={styles.groupHeroArea}>
                  <TouchableOpacity
                    style={styles.groupPhotoTouchable}
                    onPress={handleChangeGroupPhoto}
                    disabled={!isCurrentUserAdmin || isUpdatingGroup}
                  >
                    <VibeAvatar name={chatName} photoURL={chatPhotoURL} size={80} />
                    {isCurrentUserAdmin && (
                      <View style={styles.photoEditBadge}>
                        <Ionicons name="camera" size={14} color="#FFFFFF" />
                      </View>
                    )}
                  </TouchableOpacity>

                  {isEditingGroupName ? (
                    <View style={styles.editNameRow}>
                      <TextInput
                        style={styles.editNameInput}
                        value={editedGroupName}
                        onChangeText={setEditedGroupName}
                        placeholder="Group name"
                        maxLength={40}
                      />
                      <TouchableOpacity onPress={handleSaveGroupName} style={styles.saveNameBtn}>
                        <Ionicons name="checkmark" size={20} color="#6366F1" />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => setIsEditingGroupName(false)} style={styles.cancelNameBtn}>
                        <Ionicons name="close" size={20} color="#64748B" />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={styles.nameDisplayRow}>
                      <Text style={styles.groupNameHeading}>{chatName}</Text>
                      {isCurrentUserAdmin && (
                        <TouchableOpacity
                          onPress={() => {
                            setEditedGroupName(chatName);
                            setIsEditingGroupName(true);
                          }}
                          style={styles.editNamePencil}
                        >
                          <Ionicons name="pencil" size={16} color="#6366F1" />
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                  <Text style={styles.groupMemberCountSubtitle}>{groupMembers.length} participants</Text>
                </View>

                {/* Add Member button (admin only) */}
                {isCurrentUserAdmin && (
                  <TouchableOpacity
                    style={styles.addMemberBtn}
                    onPress={() => setShowAddMemberModal(true)}
                    activeOpacity={0.78}
                  >
                    <Ionicons name="person-add-outline" size={20} color="#6366F1" />
                    <Text style={styles.addMemberBtnText}>Add Participants</Text>
                  </TouchableOpacity>
                )}

                {/* Members List */}
                <Text style={styles.membersSectionTitle}>Participants</Text>
                {groupMembers.map((member) => (
                  <View key={`member-${member.uid}`} style={styles.memberRow}>
                    <VibeAvatar name={member.name} photoURL={member.photoURL} size={40} online={member.isOnline} />
                    <View style={styles.memberInfo}>
                      <Text style={styles.memberName}>{member.name}</Text>
                      <Text style={styles.memberStatus}>{member.isOnline ? 'Online' : 'Offline'}</Text>
                    </View>
                    <View style={styles.memberActionsRow}>
                      {member.isAdmin && (
                        <View style={styles.adminPill}>
                          <Text style={styles.adminPillText}>Admin</Text>
                        </View>
                      )}
                      {isCurrentUserAdmin && member.uid !== supabaseUser?.id && (
                        <TouchableOpacity
                          onPress={() => handleRemoveMember(member.uid, member.name)}
                          style={styles.removeMemberBtn}
                        >
                          <Ionicons name="trash-outline" size={16} color="#EF4444" />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                ))}

                {/* Leave Group Button */}
                <TouchableOpacity
                  style={styles.leaveGroupButton}
                  onPress={handleLeaveGroup}
                  activeOpacity={0.8}
                >
                  <Ionicons name="log-out-outline" size={20} color="#EF4444" />
                  <Text style={styles.leaveGroupText}>Leave Group</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* Add Member Modal */}
        <Modal
          visible={showAddMemberModal}
          animationType="slide"
          transparent
          onRequestClose={() => setShowAddMemberModal(false)}
        >
          <View style={styles.addMemberModalOverlay}>
            <View style={styles.addMemberModalContent}>
              <View style={styles.groupModalHeader}>
                <Text style={styles.groupModalTitle}>Add Participants</Text>
                <TouchableOpacity onPress={() => setShowAddMemberModal(false)}>
                  <Ionicons name="close" size={24} color="#64748B" />
                </TouchableOpacity>
              </View>

              <FlatList
                data={candidateUsers}
                keyExtractor={(item) => `cand-${item.uid}`}
                style={styles.candidateUsersList}
                ListEmptyComponent={
                  <View style={styles.emptyCandidatesBox}>
                    <Text style={styles.emptyCandidatesText}>No contacts available to add</Text>
                  </View>
                }
                renderItem={({ item }) => {
                  const isSelected = selectedAddMemberUids.includes(item.uid);
                  return (
                    <TouchableOpacity
                      style={[styles.candidateItem, isSelected && styles.candidateItemSelected]}
                      onPress={() => {
                        setSelectedAddMemberUids((prev) =>
                          prev.includes(item.uid) ? prev.filter((id) => id !== item.uid) : [...prev, item.uid]
                        );
                      }}
                      activeOpacity={0.7}
                    >
                      <VibeAvatar name={item.name} photoURL={item.photoURL} size={40} />
                      <Text style={styles.candidateName}>{item.name}</Text>
                      <View style={[styles.checkboxWrap, isSelected && styles.checkboxWrapActive]}>
                        {isSelected && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}
                      </View>
                    </TouchableOpacity>
                  );
                }}
              />

              <TouchableOpacity
                style={[
                  styles.confirmAddBtn,
                  selectedAddMemberUids.length === 0 && styles.confirmAddBtnDisabled,
                ]}
                onPress={handleAddMembers}
                disabled={selectedAddMemberUids.length === 0 || isUpdatingGroup}
              >
                <Text style={styles.confirmAddBtnText}>
                  Add Selected ({selectedAddMemberUids.length})
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardAvoid: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backButton: {
    padding: 6,
    marginRight: 4,
  },
  headerProfileArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerTextWrap: {
    flex: 1,
    justifyContent: 'center',
  },
  headerName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  headerStatus: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  headerStatusOnline: {
    color: '#22C55E',
    fontWeight: '600',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 4,
  },
  headerCallButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    marginRight: 4,
  },
  moreButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
  },
  chatBody: {
    flex: 1,
    position: 'relative',
    backgroundColor: '#F4F6FF',
  },
  patternLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.035,
  },
  patternIcon: {
    position: 'absolute',
  },
  messages: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 16,
    flexGrow: 1,
    justifyContent: 'flex-end',
  },
  loader: {
    marginTop: 30,
  },
  typingHint: {
    alignSelf: 'flex-start',
    fontSize: 12,
    marginLeft: 26,
    marginBottom: 6,
    fontStyle: 'italic',
    color: '#6366F1',
  },
  attachmentPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 12,
    marginBottom: 8,
    padding: 8,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  attachmentThumbnail: {
    width: 48,
    height: 48,
    borderRadius: 12,
  },
  documentPreviewThumb: {
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachmentDetails: {
    flex: 1,
    minWidth: 0,
  },
  attachmentName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  attachmentMeta: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  removeAttachmentBtn: {
    padding: 6,
  },
  replyPreviewBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 12,
    marginBottom: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
  },
  replyPreviewLine: {
    width: 4,
    height: '100%',
    borderRadius: 2,
    backgroundColor: '#6366F1',
    marginRight: 8,
  },
  replyPreviewContent: {
    flex: 1,
  },
  replyPreviewAuthor: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6366F1',
  },
  replyPreviewText: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  replyPreviewClose: {
    padding: 4,
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
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    minHeight: 46,
    maxHeight: 120,
  },
  inputIconButton: {
    padding: 6,
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    color: '#0F172A',
    paddingVertical: 8,
    paddingHorizontal: 6,
  },
  sendButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#6366F1',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
  },
  sendButtonDisabled: {
    backgroundColor: '#C7D2FE',
  },
  micButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#6366F1',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
  },
  recorderBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    height: 48,
    backgroundColor: '#F8FAFC',
    borderRadius: 24,
  },
  recorderCancelBtn: {
    padding: 8,
  },
  recordingPulse: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  recordingRedDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#EF4444',
  },
  recordingTimeText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  recorderSendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#6366F1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachmentMenu: {
    flexDirection: 'row',
    gap: 16,
    alignSelf: 'flex-start',
    marginHorizontal: 12,
    marginBottom: 8,
    padding: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#111827',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
    zIndex: 20,
  },
  attachmentOption: {
    width: 76,
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
  },
  attachmentOptionIcon: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
  },
  photoOptionIcon: {
    backgroundColor: '#EEF2FF',
  },
  documentOptionIcon: {
    backgroundColor: '#E8F7F3',
  },
  attachmentOptionText: {
    color: '#0F172A',
    fontSize: 12,
    fontWeight: '600',
  },
  actionModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionModalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 16,
    width: '85%',
    maxWidth: 340,
    elevation: 10,
  },
  actionReactionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
  },
  actionEmojiBtn: {
    padding: 8,
  },
  actionEmojiText: {
    fontSize: 26,
  },
  actionOptionsRow: {
    paddingTop: 12,
  },
  actionOptionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  actionOptionText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
  },
  contactModalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
  },
  contactModalCard: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 18,
    paddingBottom: 36,
    paddingHorizontal: 20,
    backgroundColor: '#FFFFFF',
  },
  contactModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  contactModalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  contactInfoBody: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  contactNameText: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 14,
  },
  contactStatusText: {
    fontSize: 14,
    color: '#64748B',
    marginTop: 4,
  },
  contactActionBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 84,
  },
  groupModalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
  },
  groupModalCard: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 18,
    paddingBottom: 24,
    paddingHorizontal: 20,
    maxHeight: '85%',
    backgroundColor: '#FFFFFF',
  },
  groupModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  groupModalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  groupModalScroll: {
    marginBottom: 10,
  },
  groupHeroArea: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  groupPhotoTouchable: {
    position: 'relative',
  },
  photoEditBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#6366F1',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  nameDisplayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  groupNameHeading: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
  },
  editNamePencil: {
    padding: 4,
  },
  editNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    width: '90%',
  },
  editNameInput: {
    flex: 1,
    height: 40,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    paddingHorizontal: 12,
    fontSize: 16,
    color: '#0F172A',
  },
  saveNameBtn: {
    padding: 6,
  },
  cancelNameBtn: {
    padding: 6,
  },
  groupMemberCountSubtitle: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 4,
  },
  addMemberBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: '#EEF2FF',
    marginVertical: 12,
  },
  addMemberBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#6366F1',
  },
  membersSectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 12,
    marginBottom: 8,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F1F5F9',
  },
  memberInfo: {
    flex: 1,
    marginLeft: 12,
  },
  memberName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0F172A',
  },
  memberStatus: {
    fontSize: 12,
    marginTop: 2,
    color: '#64748B',
  },
  memberActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  adminPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: '#EEF2FF',
  },
  adminPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6366F1',
  },
  removeMemberBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  leaveGroupButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: '#FEE2E2',
    gap: 8,
  },
  leaveGroupText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#EF4444',
  },
  addMemberModalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
  },
  addMemberModalContent: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 18,
    paddingBottom: 36,
    paddingHorizontal: 20,
    maxHeight: '75%',
    backgroundColor: '#FFFFFF',
  },
  candidateUsersList: {
    maxHeight: 280,
    marginVertical: 10,
  },
  emptyCandidatesBox: {
    paddingVertical: 30,
    alignItems: 'center',
  },
  emptyCandidatesText: {
    fontSize: 14,
    color: '#94A3B8',
  },
  candidateItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    marginBottom: 6,
    gap: 12,
    backgroundColor: '#F8FAFC',
  },
  candidateItemSelected: {
    backgroundColor: '#EEF2FF',
  },
  candidateName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#0F172A',
  },
  checkboxWrap: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxWrapActive: {
    borderColor: '#6366F1',
    backgroundColor: '#6366F1',
  },
  confirmAddBtn: {
    marginTop: 12,
    backgroundColor: '#6366F1',
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
  },
  confirmAddBtnDisabled: {
    backgroundColor: '#C7D2FE',
    elevation: 0,
  },
  confirmAddBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});