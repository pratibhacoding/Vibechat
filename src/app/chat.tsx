import * as DocumentPicker from 'expo-document-picker';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { StatusBar } from 'expo-status-bar';
import { deleteObject, getDownloadURL, ref, uploadBytesResumable, type StorageReference } from 'firebase/storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    AppState,
    FlatList,
    KeyboardAvoidingView,
    Linking,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import EmojiPicker, { type EmojiType } from 'rn-emoji-keyboard';

import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';

import {
    collection,
    doc,
    getDocs,
    increment,
    onSnapshot,
    orderBy,
    query,
    serverTimestamp,
    setDoc,
    Timestamp,
    updateDoc,
    where,
    writeBatch,
} from 'firebase/firestore';

import { User as FirebaseUser, onAuthStateChanged } from 'firebase/auth';

import { MessageBubble } from '../components/message-bubble';
import { VibeAvatar, VibeEmptyState, VibeIcon, VibeIconButton } from '../components/vibe-ui';
import { VibeColors } from '../constants/theme';
import { auth, db, storage } from '../firebase';

type AttachmentType = 'image' | 'document';

type Message = {
  id: string;
  text: string;
  senderId: string;
  receiverId: string;
  createdAt: Timestamp | null;
  seen: boolean;
  attachmentType?: AttachmentType;
  attachmentPath?: string;
  attachmentName?: string;
  attachmentContentType?: string;
  attachmentSize?: number;
};

type PendingAttachment = {
  uri: string;
  name: string;
  contentType: string;
  size: number | null;
  type: AttachmentType;
  file?: Blob;
};

const MAX_ATTACHMENT_SIZE = 20 * 1024 * 1024;
const DOCUMENT_CONTENT_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
];

export default function ChatScreen() {
  const [isFocused, setIsFocused] = useState(false);
  const listRef = useRef<FlatList<Message>>(null);
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingHeartbeat = useRef<ReturnType<typeof setInterval> | null>(null);
  const typingExpiry = useRef<ReturnType<typeof setTimeout> | null>(null);
  const presenceExpiry = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingState = useRef(false);
  const params = useLocalSearchParams<{ uid?: string; name?: string }>();

  const uid = Array.isArray(params.uid) ? params.uid[0] : params.uid;
  const name = Array.isArray(params.name) ? params.name[0] : params.name;

  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [showQuickEmojis, setShowQuickEmojis] = useState(false);
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  const [pendingAttachment, setPendingAttachment] = useState<PendingAttachment | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [attachmentUrls, setAttachmentUrls] = useState<Record<string, string>>({});
  const [attachmentErrors, setAttachmentErrors] = useState<Record<string, boolean>>({});
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [otherIsTyping, setOtherIsTyping] = useState(false);
  const [otherIsOnline, setOtherIsOnline] = useState(false);
  const [otherLastSeen, setOtherLastSeen] = useState<Timestamp | null>(null);
  const [appIsActive, setAppIsActive] = useState(AppState.currentState === 'active');
  const [lastMessageSenderId, setLastMessageSenderId] = useState('');
  const [lastMessageReceiverId, setLastMessageReceiverId] = useState('');

  useFocusEffect(
    useCallback(() => {
      setIsFocused(true);
      return () => setIsFocused(false);
    }, [])
  );

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setAuthLoading(false);
    });

    return unsubscribeAuth;
  }, []);

  const participants = currentUser && uid ? [currentUser.uid, uid].sort() : [];
  const chatId = participants.length === 2 ? participants.join('_') : '';

  const formatTime = (timestamp?: Timestamp | null) => {
    if (!timestamp) return '';

    return timestamp.toDate().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatLastSeen = (timestamp: Timestamp | null) => {
    if (!timestamp) return 'Offline';
    return `Last seen ${timestamp.toDate().toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })}`;
  };

  const markMessagesAsSeen = useCallback(async () => {
    if (!currentUser || !uid || !chatId || !isFocused || !appIsActive) {
      return;
    }

    if (Platform.OS === 'web' && typeof document !== 'undefined' && document.visibilityState !== 'visible') {
      return;
    }

    try {
      const messagesRef = collection(db, 'chats', chatId, 'messages');
      const receivedMessages = await getDocs(query(messagesRef, where('receiverId', '==', currentUser.uid)));
      const unseenMessages = receivedMessages.docs.filter((messageDocument) => messageDocument.data().seen !== true);

      for (let start = 0; start < unseenMessages.length; start += 450) {
        const batch = writeBatch(db);
        unseenMessages.slice(start, start + 450).forEach((messageDocument) => {
          batch.update(messageDocument.ref, { seen: true });
        });
        await batch.commit();
      }

      const conversationUpdate: Record<string, unknown> = {
        [`unreadCounts.${currentUser.uid}`]: 0,
      };
      if (lastMessageSenderId === uid && lastMessageReceiverId === currentUser.uid) {
        conversationUpdate.lastMessageSeen = true;
      }
      await updateDoc(doc(db, 'chats', chatId), conversationUpdate);
    } catch (error) {
      console.log('Seen Update Error:', error);
    }
  }, [currentUser?.uid, uid, chatId, isFocused, appIsActive, lastMessageSenderId, lastMessageReceiverId]);

  useEffect(() => {
    if (isFocused && appIsActive) void markMessagesAsSeen();
  }, [appIsActive, isFocused, markMessagesAsSeen]);

  useEffect(() => {
    if (authLoading) return;
    if (!currentUser || !uid || !chatId) {
      setLoading(false);
      return;
    }

    let unsubscribeMessages: (() => void) | undefined;
    let unsubscribeChat: (() => void) | undefined;
    let unsubscribeProfile: (() => void) | undefined;
    let active = true;

    const setupChat = async () => {
      try {
        await setDoc(doc(db, 'chats', chatId), { participants }, { merge: true });
        if (!active) return;

        const messagesQuery = query(collection(db, 'chats', chatId, 'messages'), orderBy('createdAt', 'asc'));

        unsubscribeMessages = onSnapshot(
          messagesQuery,
          (snapshot) => {
            const messageList: Message[] = snapshot.docs.map((messageDocument) => {
              const data = messageDocument.data();
              return {
                id: messageDocument.id,
                text: data.text || '',
                senderId: data.senderId || '',
                receiverId: data.receiverId || '',
                createdAt: data.createdAt instanceof Timestamp ? data.createdAt : null,
                seen: data.seen === true,
                attachmentType: data.attachmentType === 'image' || data.attachmentType === 'document' ? data.attachmentType : undefined,
                attachmentPath: typeof data.attachmentPath === 'string' ? data.attachmentPath : undefined,
                attachmentName: typeof data.attachmentName === 'string' ? data.attachmentName : undefined,
                attachmentContentType: typeof data.attachmentContentType === 'string' ? data.attachmentContentType : undefined,
                attachmentSize: typeof data.attachmentSize === 'number' ? data.attachmentSize : undefined,
              };
            });

            setMessages(messageList);
            setLoading(false);
            requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
            markMessagesAsSeen();
          },
          (error) => {
            console.log('Messages Error:', error);
            setLoading(false);
          }
        );

        unsubscribeChat = onSnapshot(doc(db, 'chats', chatId), (snapshot) => {
          const data = snapshot.data();
          setLastMessageSenderId(typeof data?.lastMessageSenderId === 'string' ? data.lastMessageSenderId : '');
          setLastMessageReceiverId(typeof data?.lastMessageReceiverId === 'string' ? data.lastMessageReceiverId : '');
          const typingUpdatedAt = data?.typingUpdatedAt?.[uid];
          const typingIsRecent = typingUpdatedAt instanceof Timestamp && Date.now() - typingUpdatedAt.toMillis() < 8000;
          setOtherIsTyping(data?.typing?.[uid] === true && typingIsRecent);
          if (typingExpiry.current) clearTimeout(typingExpiry.current);
          if (data?.typing?.[uid] === true && typingIsRecent && typingUpdatedAt instanceof Timestamp) {
            const remaining = Math.max(0, 8000 - (Date.now() - typingUpdatedAt.toMillis()));
            typingExpiry.current = setTimeout(() => setOtherIsTyping(false), remaining);
          }
        });

        unsubscribeProfile = onSnapshot(doc(db, 'users', uid), (snapshot) => {
          const data = snapshot.data();
          const lastSeen = data?.lastSeen instanceof Timestamp ? data.lastSeen : null;
          const recentlyActive = lastSeen !== null && Date.now() - lastSeen.toMillis() < 120000;
          setOtherLastSeen(lastSeen);
          setOtherIsOnline(data?.isOnline === true && recentlyActive);
          if (presenceExpiry.current) clearTimeout(presenceExpiry.current);
          if (data?.isOnline === true && recentlyActive && lastSeen) {
            const remaining = Math.max(0, 120000 - (Date.now() - lastSeen.toMillis()));
            presenceExpiry.current = setTimeout(() => setOtherIsOnline(false), remaining);
          }
        });
      } catch (error) {
        console.log('Chat Setup Error:', error);
        setLoading(false);
      }
    };

    setupChat();

    return () => {
      active = false;
      unsubscribeMessages?.();
      unsubscribeChat?.();
      unsubscribeProfile?.();
      if (typingExpiry.current) clearTimeout(typingExpiry.current);
      if (presenceExpiry.current) clearTimeout(presenceExpiry.current);
    };
  }, [authLoading, currentUser?.uid, uid, chatId, markMessagesAsSeen]);

  useEffect(() => {
    let active = true;
    const messagesNeedingUrls = messages.filter(
      (item) => item.attachmentPath && !attachmentUrls[item.id] && !attachmentErrors[item.id]
    );

    messagesNeedingUrls.forEach((item) => {
      void getDownloadURL(ref(storage, item.attachmentPath!))
        .then((url) => {
          if (active) setAttachmentUrls((current) => ({ ...current, [item.id]: url }));
        })
        .catch((error) => {
          console.warn('Attachment download URL unavailable:', error);
          if (active) setAttachmentErrors((current) => ({ ...current, [item.id]: true }));
        });
    });

    return () => {
      active = false;
    };
  }, [attachmentErrors, attachmentUrls, messages]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        markMessagesAsSeen();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [markMessagesAsSeen]);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    const subscription = AppState.addEventListener('change', (state) => {
      setAppIsActive(state === 'active');
      if (state === 'active') {
        markMessagesAsSeen();
      }
    });

    return () => subscription.remove();
  }, [markMessagesAsSeen]);

  const setTyping = useCallback(async (typing: boolean) => {
    if (!currentUser || !chatId) return;

    try {
      await updateDoc(doc(db, 'chats', chatId), {
        [`typing.${currentUser.uid}`]: typing,
        [`typingUpdatedAt.${currentUser.uid}`]: serverTimestamp(),
      });
    } catch (error) {
      console.log('Typing state update failed:', error);
    }
  }, [currentUser?.uid, chatId]);

  const handleMessageChange = (text: string) => {
    setMessage(text);
    if (typingTimeout.current) clearTimeout(typingTimeout.current);

    if (text.trim()) {
      if (!typingState.current) {
        typingState.current = true;
        void setTyping(true);
        typingHeartbeat.current = setInterval(() => {
          void setTyping(true);
        }, 3500);
      }
      typingTimeout.current = setTimeout(() => {
        typingState.current = false;
        if (typingHeartbeat.current) clearInterval(typingHeartbeat.current);
        typingHeartbeat.current = null;
        void setTyping(false);
      }, 1800);
    } else if (typingState.current) {
      typingState.current = false;
      if (typingHeartbeat.current) clearInterval(typingHeartbeat.current);
      typingHeartbeat.current = null;
      void setTyping(false);
    }
  };

  const insertQuickEmoji = (emoji: string) => {
    const nextMessage = `${message}${message && !message.endsWith(' ') ? ' ' : ''}${emoji}`;
    handleMessageChange(nextMessage);
    setShowQuickEmojis(false);
  };

  const stageAttachment = (attachment: PendingAttachment) => {
    if (attachment.size !== null && attachment.size > MAX_ATTACHMENT_SIZE) {
      Alert.alert('File too large', 'Choose a file smaller than 20 MB.');
      return;
    }
    setPendingAttachment(attachment);
    setShowAttachmentMenu(false);
  };

  const pickPhoto = async () => {
    setShowAttachmentMenu(false);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.85,
      });
      if (result.canceled || !result.assets[0]) return;

      const asset = result.assets[0];
      stageAttachment({
        uri: asset.uri,
        name: asset.fileName || `photo-${Date.now()}.jpg`,
        contentType: asset.mimeType || 'image/jpeg',
        size: asset.fileSize ?? null,
        type: 'image',
        file: asset.file,
      });
    } catch (error) {
      console.error('Photo selection failed:', error);
      Alert.alert('Could not open photos', 'Please try choosing the photo again.');
    }
  };

  const pickDocument = async () => {
    setShowAttachmentMenu(false);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [...DOCUMENT_CONTENT_TYPES],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets[0]) return;

      const asset = result.assets[0];
      const contentType = asset.mimeType || '';
      if (!DOCUMENT_CONTENT_TYPES.includes(contentType)) {
        Alert.alert('Unsupported file', 'Choose a PDF, Office document, text file, or CSV.');
        return;
      }

      stageAttachment({
        uri: asset.uri,
        name: asset.name,
        contentType,
        size: asset.size ?? null,
        type: 'document',
        file: asset.file,
      });
    } catch (error) {
      console.error('Document selection failed:', error);
      Alert.alert('Could not open documents', 'Please try choosing the file again.');
    }
  };

  const uploadAttachment = async (attachment: PendingAttachment, path: string) => {
    let blob: Blob;
    if (attachment.file) {
      blob = attachment.file;
    } else {
      const response = await fetch(attachment.uri);
      blob = await response.blob();
    }
    if (blob.size > MAX_ATTACHMENT_SIZE) {
      throw new Error('Choose a file smaller than 20 MB.');
    }

    const attachmentRef = ref(storage, path);
    const uploadTask = uploadBytesResumable(attachmentRef, blob, {
      contentType: attachment.contentType,
      customMetadata: { originalName: attachment.name },
    });

    await new Promise<void>((resolve, reject) => {
      let unsubscribe = () => {};
      unsubscribe = uploadTask.on(
        'state_changed',
        (snapshot) => setUploadProgress(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)),
        (error) => {
          unsubscribe();
          reject(error);
        },
        () => {
          unsubscribe();
          resolve();
        }
      );
    });

    return { reference: attachmentRef, size: blob.size };
  };

  useEffect(() => () => {
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    if (typingHeartbeat.current) clearInterval(typingHeartbeat.current);
    if (typingState.current) void setTyping(false);
  }, [setTyping]);

  const sendMessage = async () => {
    const caption = message.trim();
    const attachment = pendingAttachment;

    if ((!caption && !attachment) || !currentUser || !uid || !chatId || isSending) {
      return;
    }

    setIsSending(true);
    setUploadProgress(attachment ? 0 : 100);
    let uploadedAttachment: { reference: StorageReference; size: number } | null = null;

    try {
      const chatRef = doc(db, 'chats', chatId);
      const messageRef = doc(collection(db, 'chats', chatId, 'messages'));
      let messageText = caption;

      if (attachment) {
        const attachmentPath = `chats/${chatId}/${messageRef.id}`;
        uploadedAttachment = await uploadAttachment(attachment, attachmentPath);
        messageText = caption || (attachment.type === 'image' ? '[Photo]' : `[Document] ${attachment.name}`);
      }

      const batch = writeBatch(db);
      batch.update(chatRef, {
        lastMessage: messageText,
        updatedAt: serverTimestamp(),
        [`unreadCounts.${uid}`]: increment(1),
        lastMessageSenderId: currentUser.uid,
        lastMessageReceiverId: uid,
        lastMessageSeen: false,
        [`typing.${currentUser.uid}`]: false,
        [`typingUpdatedAt.${currentUser.uid}`]: serverTimestamp(),
      });
      batch.set(messageRef, {
        text: messageText,
        senderId: currentUser.uid,
        receiverId: uid,
        createdAt: serverTimestamp(),
        seen: false,
        ...(attachment && uploadedAttachment ? {
          attachmentType: attachment.type,
          attachmentPath: uploadedAttachment.reference.fullPath,
          attachmentName: attachment.name,
          attachmentContentType: attachment.contentType,
          attachmentSize: uploadedAttachment.size,
        } : {}),
      });
      await batch.commit();

      setMessage('');
      setPendingAttachment(null);
      setShowQuickEmojis(false);
      setShowAttachmentMenu(false);
      typingState.current = false;
      if (typingTimeout.current) clearTimeout(typingTimeout.current);
      if (typingHeartbeat.current) clearInterval(typingHeartbeat.current);
      typingHeartbeat.current = null;
    } catch (error) {
      console.log('Send Message Error:', error);
      if (uploadedAttachment) {
        await deleteObject(uploadedAttachment.reference).catch((cleanupError) => {
          console.warn('Could not clean up failed attachment upload:', cleanupError);
        });
      }
      const errorMessage = error instanceof Error && error.message.includes('20 MB')
        ? error.message
        : 'Message could not be sent. Check your connection and try again.';
      Alert.alert('Error', errorMessage);
    } finally {
      setIsSending(false);
      setUploadProgress(0);
    }
  };

  if (authLoading) {
    return (
      <View style={styles.centeredLoader}>
        <ActivityIndicator size="large" color={VibeColors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom', 'left', 'right']}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView style={[styles.keyboardArea, Platform.OS === 'web' && styles.keyboardAreaWeb]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <VibeIconButton name="arrowBack" label="Back to chats" onPress={() => router.back()} backgroundColor={VibeColors.surfaceSubtle} />
          <View style={styles.headerIdentity}>
            <VibeAvatar name={name || 'Vibe User'} size={42} online={otherIsOnline} />
            <View style={styles.identityText}>
              <Text style={styles.name} numberOfLines={1}>{name || 'Vibe User'}</Text>
              <Text style={[styles.status, otherIsOnline && styles.onlineStatus]} numberOfLines={1}>
                {otherIsTyping ? 'typing...' : otherIsOnline ? 'Online' : formatLastSeen(otherLastSeen)}
              </Text>
            </View>
          </View>
          <View style={styles.headerActions}>
            <VibeIconButton name="call" label="Voice calls unavailable" onPress={() => Alert.alert('Voice calls', 'Voice calls are not available yet.')} color={VibeColors.primary} backgroundColor={VibeColors.primarySoft} />
            <VibeIconButton name="more" label="Conversation information" onPress={() => Alert.alert(name || 'Conversation', 'Vibe one-to-one conversation')} backgroundColor={VibeColors.surfaceSubtle} />
          </View>
        </View>

        {loading ? (
          <ActivityIndicator size="large" style={styles.loader} color={VibeColors.primary} />
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.messages}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
            ListEmptyComponent={<VibeEmptyState title="Start the conversation" description="Send a message to get things going." />}
            renderItem={({ item }) => {
              const isMyMessage = item.senderId === currentUser?.uid;
              return (
                <MessageBubble
                  text={item.text}
                  isMine={isMyMessage}
                  time={formatTime(item.createdAt)}
                  seen={item.seen}
                  attachment={item.attachmentType ? {
                    type: item.attachmentType,
                    name: item.attachmentName || 'Attachment',
                    url: attachmentUrls[item.id],
                    unavailable: attachmentErrors[item.id] === true,
                    isCaption: item.attachmentType === 'image'
                      ? item.text !== '[Photo]'
                      : item.text !== `[Document] ${item.attachmentName || 'Attachment'}`,
                    onPress: attachmentUrls[item.id]
                      ? () => {
                        void Linking.openURL(attachmentUrls[item.id]).catch((error) => {
                          console.warn('Could not open attachment:', error);
                          Alert.alert('Could not open file', 'Try downloading this attachment again later.');
                        });
                      }
                      : undefined,
                  } : undefined}
                />
              );
            }}
          />
        )}

        {otherIsTyping && <Text style={styles.typingHint}>typing...</Text>}

        {showAttachmentMenu && (
          <View style={styles.attachmentMenu}>
            <TouchableOpacity style={styles.attachmentOption} onPress={pickPhoto} activeOpacity={0.75}>
              <View style={[styles.attachmentOptionIcon, styles.photoOptionIcon]}>
                <VibeIcon name="image" color={VibeColors.primary} size={20} />
              </View>
              <Text style={styles.attachmentOptionText}>Photo</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.attachmentOption} onPress={pickDocument} activeOpacity={0.75}>
              <View style={[styles.attachmentOptionIcon, styles.documentOptionIcon]}>
                <VibeIcon name="document" color="#167A67" size={20} />
              </View>
              <Text style={styles.attachmentOptionText}>Document</Text>
            </TouchableOpacity>
          </View>
        )}

        {pendingAttachment && (
          <View style={styles.attachmentPreview}>
            {pendingAttachment.type === 'image' ? (
              <Image source={{ uri: pendingAttachment.uri }} style={styles.attachmentThumbnail} contentFit="cover" />
            ) : (
              <View style={[styles.attachmentThumbnail, styles.documentThumbnail]}>
                <VibeIcon name="document" color="#167A67" size={22} />
              </View>
            )}
            <View style={styles.attachmentDetails}>
              <Text style={styles.attachmentName} numberOfLines={1}>{pendingAttachment.name}</Text>
              <Text style={styles.attachmentMeta} numberOfLines={1}>
                {isSending ? `Uploading ${uploadProgress}%` : pendingAttachment.type === 'image' ? 'Photo ready to send' : 'Document ready to send'}
              </Text>
            </View>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Remove attachment"
              onPress={() => setPendingAttachment(null)}
              disabled={isSending}
              style={styles.removeAttachmentButton}
            >
              <VibeIcon name="close" color={VibeColors.textSecondary} size={18} />
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.inputContainer}>
          <TouchableOpacity
            style={styles.addButton}
            accessibilityRole="button"
            accessibilityLabel={showAttachmentMenu ? 'Close attachment options' : 'Open attachment options'}
            onPress={() => {
              setShowAttachmentMenu((visible) => !visible);
              setShowQuickEmojis(false);
            }}
            disabled={isSending}
            activeOpacity={0.8}
          >
            <VibeIcon name={showAttachmentMenu ? 'close' : 'add'} color={VibeColors.primary} size={22} />
          </TouchableOpacity>

          <View style={styles.messageField}>
            <TextInput
              style={styles.input}
              placeholder="Type a message"
              placeholderTextColor={VibeColors.textSecondary}
              value={message}
              editable={!isSending}
              onChangeText={handleMessageChange}
              onSubmitEditing={sendMessage}
              multiline
              maxLength={4000}
              returnKeyType="send"
            />
            <TouchableOpacity
              style={styles.inlineEmojiButton}
              accessibilityRole="button"
              accessibilityLabel="Open emoji keyboard"
              onPress={() => {
                setShowQuickEmojis(true);
                setShowAttachmentMenu(false);
              }}
              disabled={isSending}
              activeOpacity={0.7}
            >
              <VibeIcon name="smile" color={VibeColors.textSecondary} size={21} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.sendButton, (!message.trim() && !pendingAttachment || isSending) && styles.sendButtonDisabled]}
            onPress={sendMessage}
            disabled={(!message.trim() && !pendingAttachment) || isSending}
            accessibilityRole="button"
            accessibilityLabel="Send message"
          >
            {isSending ? <ActivityIndicator size="small" color="#FFFFFF" /> : <VibeIcon name="send" color="#FFFFFF" size={20} />}
          </TouchableOpacity>
        </View>

        <EmojiPicker
          open={showQuickEmojis}
          onClose={() => setShowQuickEmojis(false)}
          onEmojiSelected={(emoji: EmojiType) => insertQuickEmoji(emoji.emoji)}
          enableSearchBar
          enableRecentlyUsed
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: VibeColors.background },
  keyboardArea: { flex: 1 },
  keyboardAreaWeb: {
    width: '100%',
    maxWidth: 460,
    alignSelf: 'center',
    backgroundColor: VibeColors.chatBackground,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: VibeColors.border,
  },
  centeredLoader: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: VibeColors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: VibeColors.surface,
    borderBottomWidth: 1,
    borderBottomColor: VibeColors.border,
    shadowColor: '#0F172A',
    shadowOpacity: 0.02,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  headerIdentity: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 10,
  },
  identityText: { marginLeft: 10, flex: 1 },
  name: { color: VibeColors.text, fontSize: 17, fontWeight: '700' },
  status: { color: VibeColors.textSecondary, fontSize: 11, marginTop: 2 },
  onlineStatus: { color: VibeColors.online, fontWeight: '700' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  messages: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 18,
    backgroundColor: VibeColors.chatBackground,
    minHeight: '100%',
  },
  loader: { marginTop: 30 },
  typingHint: {
    alignSelf: 'flex-start',
    color: VibeColors.textSecondary,
    fontSize: 12,
    marginLeft: 26,
    marginBottom: 8,
    fontStyle: 'italic',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: VibeColors.surface,
    borderTopWidth: 1,
    borderTopColor: VibeColors.border,
    gap: 8,
    shadowColor: '#0F172A',
    shadowOpacity: 0.03,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: -4 },
  },
  addButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: VibeColors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachmentMenu: {
    flexDirection: 'row',
    gap: 12,
    alignSelf: 'flex-start',
    marginLeft: 12,
    marginBottom: 8,
    padding: 10,
    backgroundColor: VibeColors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: VibeColors.border,
    shadowColor: '#111827',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  attachmentOption: {
    width: 86,
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
  },
  attachmentOptionIcon: {
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
  },
  photoOptionIcon: { backgroundColor: '#F1ECFF' },
  documentOptionIcon: { backgroundColor: '#E8F7F3' },
  attachmentOptionText: {
    color: VibeColors.text,
    fontSize: 12,
    fontWeight: '600',
  },
  attachmentPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 12,
    marginBottom: 8,
    padding: 9,
    backgroundColor: VibeColors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: VibeColors.border,
  },
  attachmentThumbnail: {
    width: 48,
    height: 48,
    borderRadius: 12,
  },
  documentThumbnail: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E8F7F3',
  },
  attachmentDetails: { flex: 1, minWidth: 0 },
  attachmentName: { color: VibeColors.text, fontSize: 13, fontWeight: '700' },
  attachmentMeta: { color: VibeColors.textSecondary, fontSize: 11, marginTop: 3 },
  removeAttachmentButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 17,
    backgroundColor: VibeColors.surfaceSubtle,
  },
  messageField: {
    flex: 1,
    minHeight: 48,
    maxHeight: 124,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 14,
    paddingRight: 6,
    borderRadius: 24,
    backgroundColor: VibeColors.inputBackground,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 108,
    paddingHorizontal: 2,
    paddingVertical: 10,
    backgroundColor: 'transparent',
    color: VibeColors.text,
    fontSize: 15,
  },
  inlineEmojiButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: VibeColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#6366F1',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  sendButtonDisabled: {
    backgroundColor: '#CBD5E1',
    shadowOpacity: 0,
    elevation: 0,
  },
});