import {
  DarkTheme,
  NavigationContainer,
  type Theme,
} from '@react-navigation/native';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import {
  ShieldCheck,
  Target,
} from 'lucide-react-native';

import ClientFormScreen from '../screens/ClientFormScreen';
import ClientProfileScreen from '../screens/ClientProfileScreen';
import ClientsScreen from '../screens/ClientsScreen';
import CompetenciesScreen from '../screens/CompetenciesScreen';
import CompetencyFormScreen from '../screens/CompetencyFormScreen';
import DashboardScreen from '../screens/DashboardScreen';
import FirearmFormScreen from '../screens/FirearmFormScreen';
import FirearmsScreen from '../screens/FirearmsScreen';
import { Colors } from '../theme/colors';
import { Radius } from '../theme/radius';
import { Spacing } from '../theme/spacing';
import { Typography } from '../theme/typography';
import type { RootStackParamList } from '../types/navigation';

const Stack =
  createNativeStackNavigator<RootStackParamList>();

const licenceGuardNavigationTheme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: Colors.primary,
    background: Colors.background,
    card: Colors.surface,
    text: Colors.text,
    border: Colors.border,
    notification: Colors.primary,
  },
};

export default function AppNavigator() {
  return (
    <NavigationContainer
      theme={licenceGuardNavigationTheme}
    >
      <Stack.Navigator
        initialRouteName="Dashboard"
        screenOptions={{
          animation: 'slide_from_right',
          contentStyle: {
            backgroundColor: Colors.background,
          },
          headerBackTitle: 'Back',
          headerStyle: {
            backgroundColor: Colors.surface,
          },
          headerTintColor: Colors.white,
          headerTitleStyle: {
            fontWeight: '800',
          },
        }}
      >
        <Stack.Screen
          component={DashboardScreen}
          name="Dashboard"
          options={{
            headerShown: false,
          }}
        />

        <Stack.Screen
          component={ClientsScreen}
          name="Clients"
          options={{
            title: 'Clients',
          }}
        />

        <Stack.Screen
          component={ClientFormScreen}
          name="ClientForm"
          options={({ route }) => ({
            title: route.params?.clientId
              ? 'Edit client'
              : 'Add client',
          })}
        />

        <Stack.Screen
          component={ClientProfileScreen}
          name="ClientProfile"
          options={({ navigation, route }) => ({
            title: 'Client profile',
            headerRight: () => (
              <View style={styles.headerActions}>
                <Pressable
                  onPress={() =>
                    navigation.navigate(
                      'Competencies',
                      {
                        clientId:
                          route.params.clientId,
                      }
                    )
                  }
                  style={({ pressed }) => [
                    styles.headerAction,
                    pressed
                      ? styles.headerActionPressed
                      : null,
                  ]}
                >
                  <ShieldCheck
                    color={Colors.primary}
                    size={17}
                  />

                  <Text
                    style={styles.headerActionText}
                  >
                    Competencies
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() =>
                    navigation.navigate(
                      'Firearms',
                      {
                        clientId:
                          route.params.clientId,
                      }
                    )
                  }
                  style={({ pressed }) => [
                    styles.headerAction,
                    pressed
                      ? styles.headerActionPressed
                      : null,
                  ]}
                >
                  <Target
                    color={Colors.primary}
                    size={17}
                  />

                  <Text
                    style={styles.headerActionText}
                  >
                    Firearms
                  </Text>
                </Pressable>
              </View>
            ),
          })}
        />

        <Stack.Screen
          component={CompetenciesScreen}
          name="Competencies"
          options={{
            title: 'Competencies',
          }}
        />

        <Stack.Screen
          component={CompetencyFormScreen}
          name="CompetencyForm"
          options={({ route }) => ({
            title: route.params.competencyId
              ? 'Edit competency'
              : 'Add competency',
          })}
        />

        <Stack.Screen
          component={FirearmsScreen}
          name="Firearms"
          options={{
            title: 'Firearms',
          }}
        />

        <Stack.Screen
          component={FirearmFormScreen}
          name="FirearmForm"
          options={({ route }) => ({
            title: route.params.firearmId
              ? 'Edit firearm'
              : 'Add firearm',
          })}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  headerActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  headerAction: {
    alignItems: 'center',
    backgroundColor: Colors.primarySoft,
    borderColor: Colors.primaryDark,
    borderRadius: Radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  headerActionPressed: {
    opacity: 0.8,
  },
  headerActionText: {
    ...Typography.caption,
    color: Colors.primary,
    fontWeight: '800',
    marginLeft: Spacing.xs,
  },
});
