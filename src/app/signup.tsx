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

import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';

import { VibeAuthField, VibeBrand, VibePrimaryButton } from '../components/vibe-ui';
import { VibeColors } from '../constants/theme';
import { auth, db } from '../firebase';

export default function SignupScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmationVisible, setConfirmationVisible] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSignup = async () => {
    if (!name.trim() || !email.trim() || !password.trim()) {
      Alert.alert('Error', 'Please fill all fields');
      return;
    }

    if (!confirmPassword) {
      Alert.alert('Confirm password', 'Enter your password again to confirm it.');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Passwords do not match', 'Check both password fields and try again.');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }

    try {
      setLoading(true);
      const cleanEmail = email.trim().toLowerCase();
      const userCredential = await createUserWithEmailAndPassword(auth, cleanEmail, password);
      const user = userCredential.user;

      await setDoc(doc(db, 'users', user.uid), {
        uid: user.uid,
        name: name.trim(),
        email: cleanEmail,
        isOnline: true,
        lastSeen: serverTimestamp(),
        createdAt: serverTimestamp(),
      });

      Alert.alert('Success', 'Account created successfully!');
      router.replace('/chats');
    } catch (error: any) {
      console.log('Signup Error:', error);

      if (error.code === 'auth/email-already-in-use') {
        Alert.alert('Error', 'This email is already registered');
      } else if (error.code === 'auth/invalid-email') {
        Alert.alert('Error', 'Please enter a valid email');
      } else if (error.code === 'auth/weak-password') {
        Alert.alert('Error', 'Password is too weak');
      } else if (error.code === 'permission-denied') {
        Alert.alert('Database Error', 'Firestore permission denied. Please check security rules.');
      } else {
        Alert.alert('Error', error.message);
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
            <View style={styles.hero}>
              <VibeBrand compact tagline={false} />
            </View>

            <View style={styles.card}>
              <Text style={styles.title}>Create account</Text>
              <Text style={styles.subtitle}>Join Vibe and start chatting.</Text>

              <View style={styles.form}>
                <VibeAuthField icon="person" placeholder="Full name" value={name} onChangeText={setName} autoCapitalize="words" autoComplete="name" returnKeyType="next" />
                <VibeAuthField icon="mail" placeholder="Email address" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" returnKeyType="next" />
                <VibeAuthField icon="lock" placeholder="Password" value={password} onChangeText={setPassword} secureTextEntry={!passwordVisible} onToggleSecure={() => setPasswordVisible((visible) => !visible)} autoComplete="new-password" returnKeyType="next" />
                <VibeAuthField icon="lock" placeholder="Confirm password" value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry={!confirmationVisible} onToggleSecure={() => setConfirmationVisible((visible) => !visible)} autoComplete="new-password" returnKeyType="done" />
                <VibePrimaryButton label="Create account" onPress={handleSignup} loading={loading} style={styles.submitButton} />
              </View>
            </View>

            <View style={styles.loginContainer}>
              <Text style={styles.normalText}>Already have an account?</Text>
              <TouchableOpacity onPress={() => router.back()}>
                <Text style={styles.loginText}>Sign in</Text>
              </TouchableOpacity>
            </View>
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
  hero: { alignItems: 'center', marginBottom: 18 },
  card: {
    backgroundColor: VibeColors.surface,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: '#E9E3FF',
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 18,
    shadowColor: '#0F172A',
    shadowOpacity: 0.05,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  title: { color: VibeColors.text, fontSize: 28, fontWeight: '800', letterSpacing: -0.6 },
  subtitle: { color: VibeColors.textSecondary, fontSize: 14, lineHeight: 22, marginTop: 6 },
  form: { gap: 12, marginTop: 20 },
  submitButton: { marginTop: 6 },
  loginContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: 18,
  },
  normalText: { color: VibeColors.textSecondary, fontSize: 14 },
  loginText: { color: VibeColors.primary, fontSize: 14, fontWeight: '700' },
});