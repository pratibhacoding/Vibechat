import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { VibeAuthField, VibeBrand, VibeIconButton, VibePrimaryButton } from '../components/vibe-ui';
import { VibeColors } from '../constants/theme';
import { useAppTheme } from '../context/theme-context';
import { supabase } from '../supabase';

export default function ResetPasswordScreen() {
  const { colors, isDark } = useAppTheme();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleUpdatePassword = async () => {
    const password = newPassword.trim();
    if (!password) {
      Alert.alert('Password Required', 'Please enter your new password.');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Weak Password', 'Password must be at least 6 characters.');
      return;
    }

    if (password !== confirmPassword.trim()) {
      Alert.alert('Mismatch', 'Passwords do not match.');
      return;
    }

    try {
      setLoading(true);
      const { error } = await supabase.auth.updateUser({
        password,
      });

      if (error) {
        throw error;
      }

      Alert.alert('Password Updated', 'Your password has been reset successfully.', [
        { text: 'Continue to Chats', onPress: () => router.replace('/chats') },
      ]);
    } catch (error: any) {
      console.warn('Update password error:', error);
      Alert.alert('Update Failed', error?.message || 'Could not update password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={styles.content}>
            <View style={styles.navRow}>
              <VibeIconButton name="arrowBack" label="Go back" onPress={() => router.replace('/')} backgroundColor={colors.surfaceSubtle} color={colors.text} />
            </View>

            <View style={styles.hero}>
              <VibeBrand compact tagline={false} />
            </View>

            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.title, { color: colors.text }]}>Set new password</Text>
              <Text style={[styles.description, { color: colors.textSecondary }]}>Enter your new password below to secure your VibeChat account.</Text>

              <View style={styles.form}>
                <VibeAuthField
                  icon="lock"
                  placeholder="New password (min 6 characters)"
                  value={newPassword}
                  onChangeText={setNewPassword}
                  secureTextEntry
                  autoCapitalize="none"
                />
                <VibeAuthField
                  icon="lock"
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry
                  autoCapitalize="none"
                />
                <VibePrimaryButton label="Update Password" onPress={handleUpdatePassword} loading={loading} />
              </View>
            </View>

            <TouchableOpacity style={styles.backToLogin} onPress={() => router.replace('/')}>
              <Text style={[styles.login, { color: colors.primary }]}>Back to sign in</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  keyboard: { flex: 1 },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 22,
    paddingVertical: 28,
  },
  content: { width: '100%', maxWidth: 440, alignSelf: 'center' },
  navRow: { marginBottom: 14 },
  hero: { alignItems: 'center', marginBottom: 18 },
  card: {
    backgroundColor: VibeColors.surface,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: VibeColors.border,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 18,
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  title: { color: VibeColors.text, fontSize: 25, fontWeight: '800', letterSpacing: -0.4 },
  description: { color: VibeColors.textSecondary, fontSize: 14, lineHeight: 21, marginTop: 8 },
  form: { gap: 14, marginTop: 20 },
  backToLogin: { alignSelf: 'center', paddingVertical: 17 },
  login: { color: VibeColors.primary, fontSize: 14, fontWeight: '700' },
});
