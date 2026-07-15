import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { LockKeyhole, Mail, ShieldCheck } from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';

export default function LoginScreen() {
  const { signIn, loading } = useAuth();

  const [email, setEmail] = useState('vansitterta@gmail.com');
  const [password, setPassword] = useState('');

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Missing details', 'Enter your email address and password.');
      return;
    }

    try {
      await signIn(email, password);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to sign in.';

      Alert.alert('Login failed', message);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        <View style={styles.container}>
          <View style={styles.brandSection}>
            <View style={styles.logoMark}>
              <ShieldCheck color="#071B2D" size={34} strokeWidth={2.4} />
            </View>

            <Text style={styles.brandName}>LicenceGuard Desk</Text>
            <Text style={styles.brandSubtitle}>
              Firearm Licence Renewal Management
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.eyebrow}>SECURE DEALER ACCESS</Text>
            <Text style={styles.title}>Sign in</Text>
            <Text style={styles.description}>
              Access client renewals, licence expiry alerts, competencies, and
              renewal preparation work.
            </Text>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Email address</Text>

              <View style={styles.inputWrapper}>
                <Mail color="#7F96A8" size={19} />
                <TextInput
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  placeholderTextColor="#718799"
                  style={styles.input}
                  value={email}
                />
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Password</Text>

              <View style={styles.inputWrapper}>
                <LockKeyhole color="#7F96A8" size={19} />
                <TextInput
                  autoCapitalize="none"
                  autoComplete="password"
                  onChangeText={setPassword}
                  onSubmitEditing={() => {
                    void handleLogin();
                  }}
                  placeholder="Enter your password"
                  placeholderTextColor="#718799"
                  secureTextEntry
                  style={styles.input}
                  value={password}
                />
              </View>
            </View>

            <Pressable
              disabled={loading}
              onPress={() => {
                void handleLogin();
              }}
              style={({ pressed }) => [
                styles.loginButton,
                pressed && !loading ? styles.loginButtonPressed : null,
                loading ? styles.loginButtonDisabled : null,
              ]}
            >
              {loading ? (
                <ActivityIndicator color="#071B2D" />
              ) : (
                <Text style={styles.loginButtonText}>Sign in</Text>
              )}
            </Pressable>

            <Text style={styles.helpText}>
              Use the dealer owner account created in Supabase Authentication.
            </Text>
          </View>

          <Text style={styles.footerText}>
            LicenceGuard Desk keeps firearm licence and competency renewals
            organised before deadlines become problems.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#071B2D',
  },
  keyboardView: {
    flex: 1,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 28,
  },
  brandSection: {
    alignItems: 'center',
    marginBottom: 28,
  },
  logoMark: {
    alignItems: 'center',
    backgroundColor: '#C89B3C',
    borderRadius: 20,
    height: 64,
    justifyContent: 'center',
    marginBottom: 14,
    width: 64,
  },
  brandName: {
    color: '#FFFFFF',
    fontSize: 27,
    fontWeight: '800',
    letterSpacing: 0.2,
    textAlign: 'center',
  },
  brandSubtitle: {
    color: '#C89B3C',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginTop: 6,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  card: {
    alignSelf: 'center',
    backgroundColor: '#102B42',
    borderColor: '#23445E',
    borderRadius: 20,
    borderWidth: 1,
    maxWidth: 460,
    padding: 22,
    width: '100%',
  },
  eyebrow: {
    color: '#C89B3C',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 27,
    fontWeight: '800',
    marginTop: 8,
  },
  description: {
    color: '#B9C8D4',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 9,
  },
  fieldGroup: {
    marginTop: 20,
  },
  label: {
    color: '#DCE5EB',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
  },
  inputWrapper: {
    alignItems: 'center',
    backgroundColor: '#0A2134',
    borderColor: '#2B4B63',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 52,
    paddingHorizontal: 14,
  },
  input: {
    color: '#FFFFFF',
    flex: 1,
    fontSize: 15,
    marginLeft: 10,
    paddingVertical: 13,
  },
  loginButton: {
    alignItems: 'center',
    backgroundColor: '#C89B3C',
    borderRadius: 12,
    justifyContent: 'center',
    marginTop: 24,
    minHeight: 52,
    paddingHorizontal: 18,
  },
  loginButtonPressed: {
    opacity: 0.86,
  },
  loginButtonDisabled: {
    opacity: 0.65,
  },
  loginButtonText: {
    color: '#071B2D',
    fontSize: 16,
    fontWeight: '800',
  },
  helpText: {
    color: '#8FA2B2',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 15,
    textAlign: 'center',
  },
  footerText: {
    alignSelf: 'center',
    color: '#8FA2B2',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 22,
    maxWidth: 460,
    textAlign: 'center',
  },
});