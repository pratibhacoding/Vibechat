import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { signOut } from 'firebase/auth';
import { doc, onSnapshot, serverTimestamp, updateDoc } from 'firebase/firestore';
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
import { auth, db } from '../firebase';

export default function ProfileScreen() {
  const user = auth.currentUser;
  const [name, setName] = useState(user?.displayName || '');
  const [savedName, setSavedName] = useState(user?.displayName || '');
  const [saving, setSaving] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    if (!user) return;

    return onSnapshot(doc(db, 'users', user.uid), (snapshot) => {
      const profileName = snapshot.data()?.name;
      if (typeof profileName === 'string') {
        setName(profileName);
        setSavedName(profileName);
      }
    });
  }, [user?.uid]);

  const saveName = async () => {
    const cleanName = name.trim();
    if (!user || !cleanName) {
      Alert.alert('Name required', 'Enter a name before saving.');
      return;
    }
    if (cleanName === savedName) return;

    try {
      setSaving(true);
      await updateDoc(doc(db, 'users', user.uid), { name: cleanName });
      setSavedName(cleanName);
      Alert.alert('Profile updated', 'Your name has been saved.');
    } catch (error) {
      console.error('Profile update failed:', error);
      Alert.alert('Could not save', 'Please check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  const logout = async () => {
    try {
      setLoggingOut(true);
      if (user) {
        await updateDoc(doc(db, 'users', user.uid), {
          isOnline: false,
          lastSeen: serverTimestamp(),
        });
      }
      await signOut(auth);
      router.replace('/');
    } catch (error) {
      console.error('Sign out failed:', error);
      Alert.alert('Could not sign out', 'Please try again.');
      setLoggingOut(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom', 'left', 'right']}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <VibeIconButton name="arrowBack" label="Go back" onPress={() => router.back()} backgroundColor={VibeColors.surfaceSubtle} />
          <Text style={styles.headerTitle}>Profile</Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.identityCard}>
            <View style={styles.avatarWrap}>
              <VibeAvatar name={savedName || 'Vibe User'} size={104} />
            </View>
            <Text style={styles.displayName} numberOfLines={2}>{savedName || 'Vibe User'}</Text>
            <Text style={styles.email} numberOfLines={1}>{user?.email || ''}</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Personal information</Text>
            <View style={styles.settingRow}>
              <View style={styles.sectionIcon}><VibeIcon name="person" color={VibeColors.primary} size={18} /></View>
              <View style={styles.settingCopy}>
                <Text style={styles.settingTitle}>Edit profile</Text>
                <Text style={styles.settingSubtitle}>Change how your name appears on Vibe</Text>
              </View>
              <VibeIcon name="edit" color={VibeColors.textSecondary} size={18} />
            </View>

            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Your name"
              placeholderTextColor={VibeColors.textSecondary}
              autoCapitalize="words"
              maxLength={60}
              returnKeyType="done"
            />
            <VibePrimaryButton label="Save changes" onPress={saveName} loading={saving} disabled={!name.trim() || name.trim() === savedName} style={styles.saveButton} />
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Account</Text>
            <TouchableOpacity style={styles.logoutButton} onPress={logout} disabled={loggingOut} activeOpacity={0.75}>
              {loggingOut ? <ActivityIndicator color={VibeColors.danger} /> : <VibeIcon name="logout" color={VibeColors.danger} size={19} />}
              <Text style={styles.logoutText}>Log out</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>

        <View style={styles.bottomNav}>
          <TouchableOpacity style={styles.navItem} onPress={() => router.replace('/chats')} activeOpacity={0.8}>
            <VibeIcon name="message" color={VibeColors.textSecondary} size={19} />
            <Text style={styles.navText}>Chats</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.navItemActive} onPress={() => router.replace('/profile')} activeOpacity={0.8}>
            <VibeIcon name="person" color={VibeColors.primary} size={19} />
            <Text style={styles.navTextActive}>Profile</Text>
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
  },
  displayName: { color: VibeColors.text, fontSize: 24, fontWeight: '800', marginTop: 16 },
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
  saveButton: { marginTop: 14 },
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
});
