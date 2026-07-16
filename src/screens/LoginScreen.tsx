import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { LockKeyhole, Mail } from 'lucide-react-native';

import { useAuth } from '../context/AuthContext';
import { Colors } from '../theme/colors';

const licenceGuardLogo = require('../../assets/LicenceGuard Logo.png');

export default function LoginScreen() {
  const { signIn, loading } = useAuth();

  const [email, setEmail] = useState('vansitterta@gmail.com');
  const [password, setPassword] = useState('');

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      Alert.alert(
        'Missing details',
        'Enter your email address and password.'
      );
      return;
    }

    try {
      await signIn(email.trim(), password);
    } catch (error) {
      Alert.alert(
        'Login failed',
        error instanceof Error
          ? error.message
          : 'Unable to sign in.'
      );
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={
          Platform.OS === 'ios' ? 'padding' : undefined
        }
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator
        >
          <View style={styles.container}>
            <View style={styles.brandSection}>
              <Image
                accessibilityLabel="LicenceGuard"
                resizeMode="contain"
                source={licenceGuardLogo}
                style={styles.logo}
              />

              <Text style={styles.brandSubtitle}>
                FIREARM COMPETENCY &amp; LICENCE MANAGEMENT
              </Text>

              <Text style={styles.tagline}>
                PROTECT • COMPLY • RENEW
              </Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.eyebrow}>
                SECURE LICENCEGUARD ACCESS
              </Text>

              <Text style={styles.title}>
                Sign in
              </Text>

              <Text style={styles.description}>
                Access client applications, competencies,
                firearm licences, expiry alerts and
                application preparation workflows.
              </Text>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>
                  Email address
                </Text>

                <View style={styles.inputWrapper}>
                  <Mail
                    color={Colors.silverDark}
                    size={19}
                  />

                  <TextInput
                    autoCapitalize="none"
                    autoComplete="email"
                    keyboardType="email-address"
                    onChangeText={setEmail}
                    placeholder="you@example.com"
                    placeholderTextColor={Colors.silverDark}
                    style={styles.input}
                    value={email}
                  />
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>
                  Password
                </Text>

                <View style={styles.inputWrapper}>
                  <LockKeyhole
                    color={Colors.silverDark}
                    size={19}
                  />

                  <TextInput
                    autoCapitalize="none"
                    autoComplete="password"
                    onChangeText={setPassword}
                    onSubmitEditing={() => {
                      void handleLogin();
                    }}
                    placeholder="Enter your password"
                    placeholderTextColor={Colors.silverDark}
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
                  pressed && !loading
                    ? styles.loginButtonPressed
                    : null,
                  loading
                    ? styles.loginButtonDisabled
                    : null,
                ]}
              >
                <View pointerEvents="none" style={styles.loginUpperBand} />
                <View pointerEvents="none" style={styles.loginReflection} />
                <View pointerEvents="none" style={styles.loginLowerBand} />
                <View pointerEvents="none" style={styles.loginBottomEdge} />

                {loading ? (
                  <ActivityIndicator
                    color={Colors.white}
                  />
                ) : (
                  <Text style={styles.loginButtonText}>
                    Sign in
                  </Text>
                )}
              </Pressable>

              <Text style={styles.helpText}>
                Use an authorised LicenceGuard dealer
                account.
              </Text>
            </View>

            <Text style={styles.footerText}>
              Manage first applications, additional
              applications, renewals, reapplications and
              final outcomes in one secure workspace.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: Colors.background,
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 18,
    paddingVertical: 6,
  },
  brandSection: {
    alignItems: 'center',
    marginBottom: 6,
  },
  logo: {
    height: 154,
    maxWidth: 440,
    width: '80%',
  },
  brandSubtitle: {
    color: Colors.silver,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    marginTop: 3,
    textAlign: 'center',
  },
  tagline: {
    color: Colors.primaryLight,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.8,
    marginTop: 3,
    textAlign: 'center',
  },
  card: {
    alignSelf: 'center',
    backgroundColor: Colors.surfaceRaised,
    borderColor: Colors.primaryLight,
    borderRadius: 18,
    borderWidth: 1,
    maxWidth: 430,
    padding: 14,
    shadowColor: Colors.primary,
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.2,
    shadowRadius: 18,
    width: '100%',
  },
  eyebrow: {
    color: Colors.primary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  title: {
    color: Colors.white,
    fontSize: 24,
    fontWeight: '800',
    marginTop: 4,
  },
  description: {
    color: Colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 5,
  },
  fieldGroup: {
    marginTop: 11,
  },
  label: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 5,
  },
  inputWrapper: {
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderColor: Colors.borderStrong,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 44,
    paddingHorizontal: 12,
  },
  input: {
    color: Colors.white,
    flex: 1,
    fontSize: 15,
    marginLeft: 10,
    paddingVertical: 10,
  },
  loginButton: {
    alignItems: 'center',
    backgroundColor: Colors.primary,
    borderColor: Colors.primaryLight,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    marginTop: 14,
    minHeight: 46,
    overflow: 'hidden',
    paddingHorizontal: 18,
    position: 'relative',
    shadowColor: Colors.primaryDark,
    shadowOffset: {
      width: 0,
      height: 6,
    },
    shadowOpacity: 0.36,
    shadowRadius: 10,
  },
  loginUpperBand: {
    backgroundColor: Colors.primaryLight,
    height: '34%',
    left: 0,
    opacity: 0.34,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  loginReflection: {
    backgroundColor: Colors.primaryHighlight,
    height: 1,
    left: 14,
    opacity: 0.95,
    position: 'absolute',
    right: 14,
    top: 2,
  },
  loginLowerBand: {
    backgroundColor: Colors.primaryDark,
    bottom: 0,
    height: '30%',
    left: 0,
    opacity: 0.4,
    position: 'absolute',
    right: 0,
  },
  loginBottomEdge: {
    backgroundColor: Colors.primaryDeep,
    bottom: 1,
    height: 2,
    left: 12,
    opacity: 0.95,
    position: 'absolute',
    right: 12,
  },
  loginButtonPressed: {
    opacity: 0.86,
  },
  loginButtonDisabled: {
    opacity: 0.65,
  },
  loginButtonText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '800',
  },
  helpText: {
    color: Colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 9,
    textAlign: 'center',
  },
  footerText: {
    alignSelf: 'center',
    color: Colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8,
    maxWidth: 520,
    textAlign: 'center',
  },
});