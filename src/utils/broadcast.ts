import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { toByteArray } from 'base64-js';
import { Platform } from 'react-native';

import { supabase } from '../supabase';
import { notifyChatMembers } from './notifications';

export type BroadcastMember = {
  id: string; // auth.users/profiles UUID
  name: string;
  email: string;
  photoURL?: string | null;
  isOnline?: boolean;
};

export type BroadcastList = {
  id: string;
  name: string;
  ownerId: string;
  members: BroadcastMember[];
  createdAt: string;
  updatedAt: string;
};

export type BroadcastHistoryItem = {
  id: string;
  broadcastId: string;
  text: string;
  createdAt: string;
  sentCount: number;
  recipientNames: string[];
  attachmentType?: 'image' | 'document';
  attachmentName?: string;
  attachmentPath?: string;
};

const STORAGE_PREFIX = '@vibe/broadcast-lists:';
const HISTORY_PREFIX = '@vibe/broadcast-history:';

/**
 * Resolves or creates a 1-to-1 direct chat UUID between current user and recipient.
 * Reuses existing RPC if available or falls back to direct query/insert without duplication.
 */
export async function findOrCreateDirectChat(currentId: string, recipientId: string): Promise<string | null> {
  // 1. Try atomic RPC first
  try {
    const { data: rpcChatId, error: rpcErr } = await supabase.rpc('get_or_create_direct_chat', {
      p_recipient_id: recipientId,
    });
    if (!rpcErr && rpcChatId) {
      return rpcChatId as string;
    }
  } catch {}

  // 2. Query existing direct chat where current user and recipient are both members
  try {
    const { data: currentMemberships } = await supabase
      .from('chat_members')
      .select('chat_id')
      .eq('user_id', currentId);

    if (currentMemberships && currentMemberships.length > 0) {
      const chatIds = currentMemberships.map((m) => m.chat_id);
      const { data: matchingRecipients } = await supabase
        .from('chat_members')
        .select('chat_id')
        .eq('user_id', recipientId)
        .in('chat_id', chatIds);

      if (matchingRecipients && matchingRecipients.length > 0) {
        const candidateChatIds = matchingRecipients.map((m) => m.chat_id);
        const { data: directChats } = await supabase
          .from('chats')
          .select('id')
          .in('id', candidateChatIds)
          .eq('type', 'direct')
          .limit(1);

        if (directChats && directChats.length > 0) {
          return directChats[0].id;
        }
      }
    }

    // 3. Create new direct chat
    const { data: newChat, error: chatErr } = await supabase
      .from('chats')
      .insert({ type: 'direct', created_by: currentId })
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
}

/**
 * Uploads media file to Supabase Storage with React Native / Web compatibility.
 */
export async function uploadBroadcastAttachment(
  uri: string,
  path: string,
  contentType: string,
  webFile?: Blob
): Promise<{ path: string; size: number }> {
  let body: ArrayBuffer | Blob;

  if (Platform.OS === 'web') {
    if (webFile) {
      body = webFile;
    } else {
      const response = await fetch(uri);
      body = await response.blob();
    }
  } else {
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
}

/**
 * Loads all broadcast lists for the current owner.
 * Attempts Supabase query first; falls back to AsyncStorage.
 */
export async function fetchBroadcastLists(ownerId: string): Promise<BroadcastList[]> {
  try {
    const { data: remoteLists, error } = await supabase
      .from('broadcast_lists')
      .select(`
        id,
        name,
        owner_id,
        created_at,
        updated_at,
        broadcast_members (
          user_id,
          profiles:user_id (
            id,
            full_name,
            email,
            avatar_url,
            is_online
          )
        )
      `)
      .eq('owner_id', ownerId)
      .order('updated_at', { ascending: false });

    if (!error && remoteLists) {
      const parsed: BroadcastList[] = remoteLists.map((item: any) => {
        const members: BroadcastMember[] = (item.broadcast_members || []).map((m: any) => {
          const profile = m.profiles || {};
          return {
            id: m.user_id,
            name: profile.full_name || 'Vibe User',
            email: profile.email || '',
            photoURL: profile.avatar_url || null,
            isOnline: Boolean(profile.is_online),
          };
        });

        return {
          id: item.id,
          name: item.name,
          ownerId: item.owner_id,
          members,
          createdAt: item.created_at,
          updatedAt: item.updated_at,
        };
      });

      // Cache locally
      await AsyncStorage.setItem(`${STORAGE_PREFIX}${ownerId}`, JSON.stringify(parsed)).catch(() => {});
      return parsed;
    }
  } catch (err) {
    // Database table not created yet or offline
  }

  // Local fallback
  try {
    const raw = await AsyncStorage.getItem(`${STORAGE_PREFIX}${ownerId}`);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch {}

  return [];
}

/**
 * Fetches a single broadcast list by ID.
 */
export async function fetchBroadcastListById(ownerId: string, listId: string): Promise<BroadcastList | null> {
  const all = await fetchBroadcastLists(ownerId);
  return all.find((l) => l.id === listId) || null;
}

/**
 * Creates a new broadcast list for the owner.
 */
export async function createBroadcastList(
  ownerId: string,
  name: string,
  members: BroadcastMember[]
): Promise<BroadcastList> {
  const now = new Date().toISOString();
  let generatedId = `bcast_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  // 1. Try Supabase insert
  try {
    const { data, error } = await supabase
      .from('broadcast_lists')
      .insert({
        owner_id: ownerId,
        name: name.trim(),
      })
      .select('id, created_at, updated_at')
      .single();

    if (!error && data) {
      generatedId = data.id;

      if (members.length > 0) {
        const memberRows = members.map((m) => ({
          broadcast_id: generatedId,
          user_id: m.id,
        }));
        await supabase.from('broadcast_members').insert(memberRows);
      }
    }
  } catch (err) {
    console.warn('Supabase broadcast_lists insert skipped (offline or table pending):', err);
  }

  const newList: BroadcastList = {
    id: generatedId,
    name: name.trim(),
    ownerId,
    members,
    createdAt: now,
    updatedAt: now,
  };

  // Update local cache
  try {
    const current = await fetchBroadcastLists(ownerId);
    const updated = [newList, ...current.filter((l) => l.id !== newList.id)];
    await AsyncStorage.setItem(`${STORAGE_PREFIX}${ownerId}`, JSON.stringify(updated));
  } catch {}

  return newList;
}

/**
 * Updates a broadcast list name and/or member recipients.
 */
export async function updateBroadcastList(
  ownerId: string,
  listId: string,
  updates: { name?: string; members?: BroadcastMember[] }
): Promise<BroadcastList> {
  const now = new Date().toISOString();

  // Try Supabase update
  try {
    if (updates.name) {
      await supabase
        .from('broadcast_lists')
        .update({ name: updates.name.trim(), updated_at: now })
        .eq('id', listId)
        .eq('owner_id', ownerId);
    }

    if (updates.members) {
      await supabase.from('broadcast_members').delete().eq('broadcast_id', listId);
      if (updates.members.length > 0) {
        const rows = updates.members.map((m) => ({
          broadcast_id: listId,
          user_id: m.id,
        }));
        await supabase.from('broadcast_members').insert(rows);
      }
    }
  } catch (err) {
    console.warn('Supabase broadcast update skipped:', err);
  }

  // Update local cache
  const all = await fetchBroadcastLists(ownerId);
  const target = all.find((l) => l.id === listId);
  const updatedList: BroadcastList = target
    ? {
        ...target,
        name: updates.name !== undefined ? updates.name.trim() : target.name,
        members: updates.members !== undefined ? updates.members : target.members,
        updatedAt: now,
      }
    : {
        id: listId,
        name: updates.name || 'Broadcast',
        ownerId,
        members: updates.members || [],
        createdAt: now,
        updatedAt: now,
      };

  const finalLists = all.map((l) => (l.id === listId ? updatedList : l));
  await AsyncStorage.setItem(`${STORAGE_PREFIX}${ownerId}`, JSON.stringify(finalLists)).catch(() => {});
  return updatedList;
}

/**
 * Deletes a broadcast list.
 */
export async function deleteBroadcastList(ownerId: string, listId: string): Promise<void> {
  try {
    await supabase.from('broadcast_lists').delete().eq('id', listId).eq('owner_id', ownerId);
  } catch {}

  const all = await fetchBroadcastLists(ownerId);
  const remaining = all.filter((l) => l.id !== listId);
  await AsyncStorage.setItem(`${STORAGE_PREFIX}${ownerId}`, JSON.stringify(remaining)).catch(() => {});
  await AsyncStorage.removeItem(`${HISTORY_PREFIX}${listId}`).catch(() => {});
}

/**
 * Loads history of messages sent to this broadcast list.
 */
export async function fetchBroadcastHistory(broadcastId: string): Promise<BroadcastHistoryItem[]> {
  try {
    const raw = await AsyncStorage.getItem(`${HISTORY_PREFIX}${broadcastId}`);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

/**
 * Dispatches a broadcast message individually to every recipient's direct chat.
 * Recipients receive it as an individual 1-to-1 message without knowing other recipients.
 */
export async function deliverBroadcastMessage({
  ownerId,
  broadcastId,
  senderName,
  messageText,
  members,
  attachment,
}: {
  ownerId: string;
  broadcastId: string;
  senderName: string;
  messageText: string;
  members: BroadcastMember[];
  attachment?: {
    type: 'image' | 'document';
    uri: string;
    name: string;
    contentType: string;
    size?: number | null;
    file?: Blob;
  };
}): Promise<{ success: boolean; sentCount: number; errors: string[] }> {
  if (members.length === 0) {
    return { success: false, sentCount: 0, errors: ['No recipients in this broadcast list'] };
  }

  // 1. For text Broadcast, the secure server RPC is the authoritative sending path
  if (!attachment) {
    const { data: rpcRes, error: rpcErr } = await supabase.rpc('send_broadcast_message', {
      p_broadcast_id: broadcastId,
      p_message_text: messageText,
    });

    if (rpcErr || !rpcRes || !rpcRes.success) {
      console.error('send_broadcast_message RPC failed:', rpcErr);
      return {
        success: false,
        sentCount: 0,
        errors: [rpcErr?.message || 'Broadcast RPC delivery failed on server'],
      };
    }

    const sentCount = Number(rpcRes.sent_count) || members.length;
    await recordBroadcastHistory(broadcastId, {
      text: messageText,
      sentCount,
      recipientNames: members.map((m) => m.name),
    });
    return { success: true, sentCount, errors: [] };
  }

  // 2. Client-side delivery to individual direct chats
  const errors: string[] = [];
  let sentCount = 0;
  const nowIso = new Date().toISOString();

  // If attachment is provided, upload once to storage
  let uploadedAttachment: { path: string; size: number } | null = null;
  if (attachment) {
    try {
      const fileExt = attachment.name.includes('.') ? attachment.name.split('.').pop() : '';
      const sanitizedExt = fileExt ? `.${fileExt.replace(/[^a-zA-Z0-9]/g, '')}` : '';
      const uniqueFileName = `${Date.now()}_bcast_${Math.random().toString(36).substring(2, 6)}${sanitizedExt}`;
      const folder = attachment.type === 'image' ? 'images' : 'documents';
      const storagePath = `broadcasts/${broadcastId}/${folder}/${uniqueFileName}`;

      uploadedAttachment = await uploadBroadcastAttachment(
        attachment.uri,
        storagePath,
        attachment.contentType,
        attachment.file
      );
    } catch (uploadError: any) {
      console.error('Broadcast attachment upload failed:', uploadError);
      return {
        success: false,
        sentCount: 0,
        errors: [`Attachment upload failed: ${uploadError?.message || 'Network error'}`],
      };
    }
  }

  const effectiveText = messageText || (attachment ? (attachment.type === 'image' ? '[Photo]' : `[Document] ${attachment.name}`) : '');

  for (const member of members) {
    try {
      // Step A: Resolve or create 1-to-1 direct chat
      const directChatId = await findOrCreateDirectChat(ownerId, member.id);
      if (!directChatId) {
        errors.push(`Could not initialize chat with ${member.name}`);
        continue;
      }

      // Step B: Insert individual message row
      const { error: msgErr } = await supabase.from('messages').insert({
        chat_id: directChatId,
        sender_id: ownerId,
        message_type: attachment ? attachment.type : 'text',
        text: effectiveText,
        storage_path: uploadedAttachment?.path || null,
        file_name: attachment?.name || null,
        file_size: uploadedAttachment?.size || attachment?.size || null,
        mime_type: attachment?.contentType || null,
      });

      if (msgErr) {
        errors.push(`Send failed to ${member.name}: ${msgErr.message}`);
        continue;
      }

      // Step C: Update chats last message & recipient unread count
      await supabase
        .from('chats')
        .update({
          last_message: effectiveText,
          last_message_at: nowIso,
          updated_at: nowIso,
        })
        .eq('id', directChatId);

      // Step D: Trigger push notification for recipient
      void notifyChatMembers({
        chatId: directChatId,
        senderId: ownerId,
        senderName,
        messageText: effectiveText,
        isGroup: false,
      });

      sentCount += 1;
    } catch (itemErr: any) {
      errors.push(`Error delivering to ${member.name}: ${itemErr?.message || 'Unknown'}`);
    }
  }

  if (sentCount > 0) {
    await recordBroadcastHistory(broadcastId, {
      text: effectiveText,
      sentCount,
      recipientNames: members.map((m) => m.name),
      attachmentType: attachment?.type,
      attachmentName: attachment?.name,
      attachmentPath: uploadedAttachment?.path,
    });
  }

  return {
    success: sentCount > 0,
    sentCount,
    errors,
  };
}

async function recordBroadcastHistory(
  broadcastId: string,
  entry: {
    text: string;
    sentCount: number;
    recipientNames: string[];
    attachmentType?: 'image' | 'document';
    attachmentName?: string;
    attachmentPath?: string;
  }
) {
  try {
    const history = await fetchBroadcastHistory(broadcastId);
    const newEntry: BroadcastHistoryItem = {
      id: `bh_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      broadcastId,
      text: entry.text,
      createdAt: new Date().toISOString(),
      sentCount: entry.sentCount,
      recipientNames: entry.recipientNames,
      attachmentType: entry.attachmentType,
      attachmentName: entry.attachmentName,
      attachmentPath: entry.attachmentPath,
    };
    await AsyncStorage.setItem(`${HISTORY_PREFIX}${broadcastId}`, JSON.stringify([newEntry, ...history]));
  } catch {}
}
