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

export default function ForgotPasswordScreen() {
  const { colors, isDark } = useAppTheme();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const resetPassword = async () => {
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail) {
      Alert.alert('Error', 'Please enter your email.');
      return;
    }

    try {
      setLoading(true);
      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: 'myiosapp://reset-password',
      });

      if (error) {
        throw error;
      }

      Alert.alert(
        'Email Sent',
        'Check your inbox for the password reset link to set your new password.',
        [{ text: 'OK', onPress: () => router.replace('/') }]
      );
    } catch (error: any) {
      console.warn('Reset Password Error:', error);
      Alert.alert('Error', error?.message || 'Unable to send password reset email.');
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
              <VibeIconButton name="arrowBack" label="Go back" onPress={() => router.back()} backgroundColor={colors.surfaceSubtle} color={colors.text} />
            </View>

            <View style={styles.hero}>
              <VibeBrand compact tagline={false} />
            </View>

            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.title, { color: colors.text }]}>Reset your password</Text>
              <Text style={[styles.description, { color: colors.textSecondary }]}>Enter your email and we&apos;ll send a secure reset link.</Text>

              <View style={styles.form}>
                <VibeAuthField icon="mail" placeholder="Email address" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" returnKeyType="done" />
                <VibePrimaryButton label="Send reset link" onPress={resetPassword} loading={loading} />
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