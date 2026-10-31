import { useState } from 'react';

import { StatusBar } from 'expo-status-bar';
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

import { VibeAuthField, VibeBrand, VibePrimaryButton } from '../components/vibe-ui';
import { VibeColors } from '../constants/theme';
import { useAppTheme } from '../context/theme-context';
import { supabase } from '../supabase';

export default function LoginScreen() {
  const { colors, isDark } = useAppTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);

  const handleLogin = async () => {
    const cleanEmail = email.trim();

    if (!cleanEmail || !password) {
      Alert.alert('Error', 'Please enter email and password.');
      return;
    }

    try {
      setLoading(true);
      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (error) {
        throw error;
      }

      router.replace('/chats');
    } catch (error: any) {
      console.log('Login Error:', error);

      const msg = error.message?.toLowerCase() || '';
      if (
        msg.includes('invalid login credentials') ||
        msg.includes('invalid credentials') ||
        error.status === 400
      ) {
        Alert.alert('Login Failed', 'Incorrect email or password.');
      } else if (msg.includes('email not confirmed')) {
        Alert.alert('Login Failed', 'Please verify your email address before signing in.');
      } else if (msg.includes('rate limit') || msg.includes('too many requests') || error.status === 429) {
        Alert.alert('Try Again Later', 'Too many login attempts. Please try again later.');
      } else if (msg.includes('invalid email')) {
        Alert.alert('Error', 'Please enter a valid email address.');
      } else {
        Alert.alert('Login Failed', error.message || 'Unable to sign in. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }, Platform.OS === 'web' && styles.safeAreaWeb]} edges={['top', 'bottom']}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={[styles.content, Platform.OS === 'web' && styles.contentWeb]}>
            <View style={styles.bgShapeOne} />
            <View style={styles.bgShapeTwo} />
            <View style={styles.hero}>
              <VibeBrand />
            </View>

            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.title, { color: colors.text }]}>Welcome back</Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Connect with the people who matter.</Text>

              <View style={styles.form}>
                <VibeAuthField
                  icon="mail"
                  placeholder="Email address"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  returnKeyType="next"
                />
                <VibeAuthField
                  icon="lock"
                  placeholder="Password"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!passwordVisible}
                  onToggleSecure={() => setPasswordVisible((visible) => !visible)}
                  autoComplete="current-password"
                  returnKeyType="done"
                />

                <TouchableOpacity style={styles.forgotButton} onPress={() => router.push('/forgot-password')}>
                  <Text style={[styles.forgotText, { color: colors.primary }]}>Forgot password?</Text>
                </TouchableOpacity>

                <VibePrimaryButton label="Sign In" onPress={handleLogin} loading={loading} />
              </View>
            </View>

            <View style={styles.divider}>
              <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
              <Text style={[styles.dividerText, { color: colors.textSecondary }]}>or continue with</Text>
              <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
            </View>

            <View style={styles.signupContainer}>
              <Text style={[styles.signupText, { color: colors.textSecondary }]}>New to Vibe?</Text>
              <TouchableOpacity onPress={() => router.push('/signup')}>
                <Text style={[styles.signupLink, { color: colors.primary }]}>Create account</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  safeAreaWeb: {
    backgroundColor: '#F4F1FF',
  },
  keyboard: { flex: 1 },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  content: {
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
    position: 'relative',
    paddingVertical: 8,
  },
  contentWeb: {
    maxWidth: 420,
    minHeight: '100%',
  },
  bgShapeOne: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(167, 139, 250, 0.16)',
    top: -32,
    left: -34,
  },
  bgShapeTwo: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(147, 197, 253, 0.12)',
    bottom: -42,
    right: -54,
  },
  hero: {
    alignItems: 'center',
    marginBottom: 20,
    zIndex: 2,
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: '#E9E3FF',
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 18,
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
    zIndex: 2,
  },
  title: { color: VibeColors.text, fontSize: 27, fontWeight: '800', letterSpacing: -0.6 },
  subtitle: { color: VibeColors.textSecondary, fontSize: 14, lineHeight: 22, marginTop: 6 },
  form: { gap: 14, marginTop: 20 },
  forgotButton: { alignSelf: 'flex-end', minHeight: 30, justifyContent: 'center' },
  forgotText: { color: VibeColors.primary, fontSize: 14, fontWeight: '700' },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 18,
    marginBottom: 8,
    zIndex: 2,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#E2E8F0' },
  dividerText: { color: VibeColors.textSecondary, fontSize: 12, fontWeight: '600', textTransform: 'uppercase' },
  signupContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    zIndex: 2,
  },
  signupText: { color: VibeColors.textSecondary, fontSize: 14 },
  signupLink: { color: VibeColors.primary, fontSize: 14, fontWeight: '700' },
});