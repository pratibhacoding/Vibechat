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

import { router } from 'expo-router';
import { sendPasswordResetEmail } from 'firebase/auth';

import { VibeAuthField, VibeBrand, VibeIconButton, VibePrimaryButton } from '../components/vibe-ui';
import { VibeColors } from '../constants/theme';
import { auth } from '../firebase';

export default function ForgotPasswordScreen() {
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
      await sendPasswordResetEmail(auth, cleanEmail);
      Alert.alert('Email Sent', 'Check your email for the password reset link.');
      router.replace('/');
    } catch (error: any) {
      console.log('Reset Password Error:', error);

      if (error.code === 'auth/invalid-email') {
        Alert.alert('Error', 'Please enter a valid email.');
      } else {
        Alert.alert('Error', 'Unable to send password reset email.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={styles.content}>
            <View style={styles.navRow}>
              <VibeIconButton name="arrowBack" label="Go back" onPress={() => router.back()} backgroundColor={VibeColors.surfaceSubtle} />
            </View>

            <View style={styles.hero}>
              <VibeBrand compact tagline={false} />
            </View>

            <View style={styles.card}>
              <Text style={styles.title}>Reset your password</Text>
              <Text style={styles.description}>Enter your email and we&apos;ll send a secure reset link.</Text>

              <View style={styles.form}>
                <VibeAuthField icon="mail" placeholder="Email address" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" returnKeyType="done" />
                <VibePrimaryButton label="Send reset link" onPress={resetPassword} loading={loading} />
              </View>
            </View>

            <TouchableOpacity style={styles.backToLogin} onPress={() => router.replace('/')}>
              <Text style={styles.login}>Back to sign in</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: VibeColors.background },
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