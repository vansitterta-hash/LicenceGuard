import PasswordScreen from './src/screens/PasswordScreen';
import {
  ActivityIndicator,
  SafeAreaView,
  StyleSheet,
} from 'react-native';

import LicenceGuardLogo from './src/components/LicenceGuardLogo';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import AppNavigator from './src/navigation/AppNavigator';
import LoginScreen from './src/screens/LoginScreen';
import { Colors } from './src/theme/colors';

function RootApplication() {
  const { loading, session, dealerProfile, registering, recovery, recoveryError, finishRecovery } = useAuth();

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingScreen}>
        <LicenceGuardLogo style={styles.loadingLogo} width={150} />
        <ActivityIndicator
          color={Colors.primary}
          size="large"
        />
      </SafeAreaView>
    );
  }

  if (recovery) return <PasswordScreen recovery error={recoveryError} onDone={finishRecovery} />;

  if (!session || !dealerProfile || registering) {
    return <LoginScreen />;
  }

  return <AppNavigator />;
}

export default function App() {
  return (
    <AuthProvider>
      <RootApplication />
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  loadingScreen: {
    alignItems: 'center',
    backgroundColor: Colors.background,
    flex: 1,
    justifyContent: 'center',
  },
  loadingLogo: {
    marginBottom: 24,
  },
});
