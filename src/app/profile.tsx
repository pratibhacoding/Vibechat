import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { toByteArray } from 'base64-js';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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

import { VibeAvatar, VibeIcon, VibeIconButton, VibePrimaryButton } from '../components/vibe-ui';
import { VibeColors } from '../constants/theme';
import { useAppTheme } from '../context/theme-context';
import { supabase } from '../supabase';

export default function ProfileScreen() {
  const { colors, theme, isDark, setTheme } = useAppTheme();
  const [supabaseUser, setSupabaseUser] = useState<{ id: string; email?: string } | null>(null);
  const [name, setName] = useState('');
  const [savedName, setSavedName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [photoURL, setPhotoURL] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    let active = true;

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!active || !user) return;
      setSupabaseUser({ id: user.id, email: user.email });
      setUserEmail(user.email || '');

      const metaName = user.user_metadata?.full_name || user.user_metadata?.name;
      if (metaName) {
        setName(metaName);
        setSavedName(metaName);
      }

      supabase
        .from('profiles')
        .select('full_name, avatar_url')
        .eq('id', user.id)
        .maybeSingle()
        .then(({ data }) => {
          if (!active || !data) return;
          if (data.full_name) {
            setName(data.full_name);
            setSavedName(data.full_name);
          }
          if (data.avatar_url) {
            let initialUrl = data.avatar_url;
            if (!initialUrl.startsWith('http://') && !initialUrl.startsWith('https://')) {
              supabase.storage
                .from('vibechat-media')
                .createSignedUrl(initialUrl, 60 * 60 * 24 * 365)
                .then(({ data: signedData }) => {
                  if (active && signedData?.signedUrl) {
                    setPhotoURL(signedData.signedUrl);
                  } else if (active) {
                    setPhotoURL(initialUrl);
                  }
                })
                .catch(() => {
                  if (active) setPhotoURL(initialUrl);
                });
            } else {
              setPhotoURL(initialUrl);
            }
          }
        });
    });

    return () => {
      active = false;
    };
  }, []);

  const pickAndUploadPhoto = async () => {
    if (!supabaseUser) return;

    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission required', 'Please allow photo gallery access to set your profile picture.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        allowsEditing: true,
        aspect: [1, 1],
      });

      if (result.canceled || !result.assets[0]) return;

      const asset = result.assets[0];
      setUploadingPhoto(true);

      let body: ArrayBuffer | Blob;
      if (Platform.OS === 'web') {
        const response = await fetch(asset.uri);
        body = await response.blob();
      } else {
        const base64Data = await FileSystem.readAsStringAsync(asset.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        const uint8 = toByteArray(base64Data);
        body = uint8.buffer.slice(uint8.byteOffset, uint8.byteOffset + uint8.byteLength) as ArrayBuffer;
      }
      const fileExt = asset.uri.split('.').pop()?.split('?')[0] || 'jpg';
      const filePath = `avatars/${supabaseUser.id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('vibechat-media')
        .upload(filePath, body, {
          contentType: asset.mimeType || 'image/jpeg',
          upsert: true,
        });

      if (uploadError) {
        throw uploadError;
      }

      let avatarUrl = filePath;
      try {
        const { data: signedData } = await supabase.storage
          .from('vibechat-media')
          .createSignedUrl(filePath, 60 * 60 * 24 * 365);
        if (signedData?.signedUrl) {
          avatarUrl = signedData.signedUrl;
        }
      } catch {}

      const { error: profileError } = await supabase
        .from('profiles')
        .update({ avatar_url: avatarUrl })
        .eq('id', supabaseUser.id);

      if (profileError) {
        throw profileError;
      }

      await supabase.auth.updateUser({
        data: { avatar_url: avatarUrl },
      });

      setPhotoURL(avatarUrl);
      Alert.alert('Success', 'Profile photo updated!');
    } catch (error: any) {
      console.error('Profile photo upload error:', error);
      Alert.alert('Upload failed', error?.message || 'Could not upload profile photo. Please try again.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const saveName = async () => {
    const cleanName = name.trim();
    if (!supabaseUser || !cleanName) {
      Alert.alert('Name required', 'Enter a name before saving.');
      return;
    }
    if (cleanName === savedName) return;

    try {
      setSaving(true);
      const { error } = await supabase
        .from('profiles')
        .update({ full_name: cleanName })
        .eq('id', supabaseUser.id);

      if (error) throw error;

      await supabase.auth.updateUser({
        data: { full_name: cleanName, name: cleanName },
      });

      setSavedName(cleanName);
      Alert.alert('Profile updated', 'Your name has been saved.');
    } catch (error: any) {
      console.error('Profile update failed:', error);
      Alert.alert('Could not save', error?.message || 'Please check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  const logout = async () => {
    try {
      setLoggingOut(true);
      if (supabaseUser) {
        try {
          await supabase
            .from('profiles')
            .update({
              is_online: false,
              last_seen: new Date().toISOString(),
            })
            .eq('id', supabaseUser.id);
        } catch {}
      }
      const { error } = await supabase.auth.signOut();
      if (error) {
        throw error;
      }
      router.replace('/');
    } catch (error: any) {
      console.error('Sign out failed:', error);
      Alert.alert('Could not sign out', error?.message || 'Please try again.');
      setLoggingOut(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top', 'bottom', 'left', 'right']}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <VibeIconButton name="arrowBack" label="Go back" onPress={() => router.back()} backgroundColor={colors.surfaceSubtle} color={colors.text} />
          <Text style={[styles.headerTitle, { color: colors.text }]}>Profile</Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={[styles.identityCard, { backgroundColor: isDark ? '#191538' : '#F4F0FF', borderColor: isDark ? '#2D2056' : '#E9E2FF' }]}>
            <TouchableOpacity
              style={[styles.avatarWrap, { backgroundColor: colors.surface }]}
              onPress={pickAndUploadPhoto}
              disabled={uploadingPhoto}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Change profile picture"
            >
              <VibeAvatar name={savedName || 'Vibe User'} size={104} photoURL={photoURL} />
              <View style={[styles.avatarBadge, { borderColor: colors.surface }]}>
                {uploadingPhoto ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <VibeIcon name="image" color="#FFFFFF" size={16} />
                )}
              </View>
            </TouchableOpacity>
            <TouchableOpacity onPress={pickAndUploadPhoto} disabled={uploadingPhoto}>
              <Text style={styles.changePhotoText}>
                {uploadingPhoto ? 'Uploading photo...' : 'Change profile photo'}
              </Text>
            </TouchableOpacity>
            <Text style={[styles.displayName, { color: colors.text }]} numberOfLines={2}>{savedName || 'Vibe User'}</Text>
            <Text style={[styles.email, { color: colors.textSecondary }]} numberOfLines={1}>{userEmail || ''}</Text>
          </View>

          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Personal information</Text>
            <View style={styles.settingRow}>
              <View style={[styles.sectionIcon, { backgroundColor: colors.primarySoft }]}><VibeIcon name="person" color={colors.primary} size={18} /></View>
              <View style={styles.settingCopy}>
                <Text style={[styles.settingTitle, { color: colors.text }]}>Edit profile</Text>
                <Text style={[styles.settingSubtitle, { color: colors.textSecondary }]}>Change how your name appears on Vibe</Text>
              </View>
              <VibeIcon name="edit" color={colors.textSecondary} size={18} />
            </View>

            <TextInput
              style={[styles.input, { backgroundColor: colors.inputBackground, borderColor: colors.border, color: colors.text }]}
              value={name}
              onChangeText={setName}
              placeholder="Your name"
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="words"
              maxLength={60}
              returnKeyType="done"
            />
            <VibePrimaryButton label="Save changes" onPress={saveName} loading={saving} disabled={!name.trim() || name.trim() === savedName} style={styles.saveButton} />
          </View>

          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Appearance</Text>
            <View style={styles.themeSelectorRow}>
              {(['light', 'dark', 'system'] as const).map((mode) => (
                <TouchableOpacity
                  key={mode}
                  onPress={() => setTheme(mode)}
                  style={[
                    styles.themeTab,
                    { borderColor: colors.border, backgroundColor: colors.surfaceSubtle },
                    theme === mode && { backgroundColor: colors.primarySoft, borderColor: colors.primary },
                  ]}
                  activeOpacity={0.78}
                >
                  <Text
                    style={[
                      styles.themeTabText,
                      { color: theme === mode ? colors.primary : colors.textSecondary },
                    ]}
                  >
                    {mode === 'light' ? '☀️ Light' : mode === 'dark' ? '🌙 Dark' : '⚙️ System'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Account</Text>
            <TouchableOpacity
              style={[styles.logoutButton, { backgroundColor: isDark ? '#2E1218' : '#FFF8F8', borderColor: isDark ? '#4B1822' : '#F3D9DC' }]}
              onPress={logout}
              disabled={loggingOut}
              activeOpacity={0.75}
            >
              {loggingOut ? <ActivityIndicator color={colors.danger} /> : <VibeIcon name="logout" color={colors.danger} size={19} />}
              <Text style={styles.logoutText}>Log out</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>

        <View style={[styles.bottomNav, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <TouchableOpacity style={styles.navItem} onPress={() => router.replace('/chats')} activeOpacity={0.8}>
            <VibeIcon name="message" color={colors.textSecondary} size={19} />
            <Text style={[styles.navText, { color: colors.textSecondary }]}>Chats</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.navItem} onPress={() => router.replace('/calls' as any)} activeOpacity={0.8}>
            <VibeIcon name="call" color={colors.textSecondary} size={19} />
            <Text style={[styles.navText, { color: colors.textSecondary }]}>Calls</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.navItemActive, { backgroundColor: colors.primarySoft }]} onPress={() => router.replace('/profile')} activeOpacity={0.8}>
            <VibeIcon name="person" color={colors.primary} size={19} />
            <Text style={[styles.navTextActive, { color: colors.primary }]}>Profile</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: VibeColors.background },
  container: { flex: 1 },
  header: {
    minHeight: 58,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: VibeColors.surface,
    borderBottomWidth: 1,
    borderBottomColor: VibeColors.border,
  },
  headerTitle: { color: VibeColors.text, fontSize: 17, fontWeight: '700' },
  headerSpacer: { width: 42 },
  scrollContent: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    paddingHorizontal: 22,
    paddingBottom: 90,
  },
  identityCard: {
    alignItems: 'center',
    paddingTop: 26,
    paddingBottom: 22,
    marginTop: 20,
    marginBottom: 16,
    borderRadius: 28,
    backgroundColor: '#F4F0FF',
    borderWidth: 1,
    borderColor: '#E9E2FF',
    shadowColor: '#8B5CF6',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  avatarWrap: {
    padding: 6,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    position: 'relative',
  },
  avatarBadge: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: VibeColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    elevation: 3,
  },
  changePhotoText: {
    color: VibeColors.primary,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 10,
  },
  displayName: { color: VibeColors.text, fontSize: 24, fontWeight: '800', marginTop: 10 },
  email: { color: VibeColors.textSecondary, fontSize: 14, marginTop: 4 },
  card: {
    backgroundColor: VibeColors.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: VibeColors.border,
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginBottom: 18,
    shadowColor: '#0F172A',
    shadowOpacity: 0.02,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  sectionTitle: { color: VibeColors.textSecondary, fontSize: 12, fontWeight: '700', marginBottom: 12, textTransform: 'uppercase' },
  settingRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  sectionIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: VibeColors.primarySoft,
    marginRight: 12,
  },
  settingCopy: { flex: 1 },
  settingTitle: { color: VibeColors.text, fontSize: 15, fontWeight: '700' },
  settingSubtitle: { color: VibeColors.textSecondary, fontSize: 12, marginTop: 3 },
  input: {
    height: 54,
    borderRadius: 16,
    backgroundColor: VibeColors.inputBackground,
    borderWidth: 1,
    borderColor: VibeColors.border,
    color: VibeColors.text,
    paddingHorizontal: 15,
    fontSize: 16,
  },
  themeSelectorRow: {
    flexDirection: 'row',
    gap: 8,
  },
  themeTab: {
    flex: 1,
    minHeight: 44,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  themeTabText: {
    fontSize: 13,
    fontWeight: '700',
  },
  logoutButton: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#F3D9DC',
    backgroundColor: '#FFF8F8',
  },
  logoutText: { color: VibeColors.danger, fontWeight: '700', fontSize: 15 },
  bottomNav: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: VibeColors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowRadius: 10,
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
    backgroundColor: VibeColors.primarySoft,
  },
  navText: {
    fontSize: 12,
    color: VibeColors.textSecondary,
    fontWeight: '700',
  },
  navTextActive: {
    fontSize: 12,
    color: VibeColors.primary,
    fontWeight: '700',
  },
  saveButton: {
    marginTop: 10,
  },
});
