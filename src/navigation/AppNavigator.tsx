import {
  DarkTheme,
  NavigationContainer,
  type Theme,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import ApplicationCaseFormScreen from '../screens/ApplicationCaseFormScreen';
import ApplicationReadinessScreen from '../screens/ApplicationReadinessScreen';
import ApplicationPackGeneratorScreen from '../screens/ApplicationPackGeneratorScreen';
import ApplicationCasesScreen from '../screens/ApplicationCasesScreen';
import ClientFormScreen from '../screens/ClientFormScreen';
import ClientProfileScreen from '../screens/ClientProfileScreen';
import ClientsScreen from '../screens/ClientsScreen';
import CompetenciesScreen from '../screens/CompetenciesScreen';
import CompetencyFormScreen from '../screens/CompetencyFormScreen';
import DashboardScreen from '../screens/DashboardScreen';
import ReferenceLibraryScreen from '../screens/ReferenceLibraryScreen';
import FirearmFormScreen from '../screens/FirearmFormScreen';
import FirearmsScreen from '../screens/FirearmsScreen';
import DocumentLibraryScreen from '../screens/DocumentLibraryScreen';
import { Colors } from '../theme/colors';
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
          component={ReferenceLibraryScreen}
          name="ReferenceLibrary"
          options={{
            title: 'Reference library',
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
          options={{
            title: 'Client profile',
          }}
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

        <Stack.Screen
          component={DocumentLibraryScreen}
          name="DocumentLibrary"
          options={{
            title: 'Document library',
          }}
        />

        <Stack.Screen
          component={ApplicationReadinessScreen}
          name="ApplicationReadiness"
          options={{
            title: 'Application readiness',
          }}
        />

        <Stack.Screen
          component={ApplicationPackGeneratorScreen}
          name="ApplicationPackGenerator"
          options={{
            title: 'Application pack generator',
          }}
        />

        <Stack.Screen
          component={ApplicationCasesScreen}
          name="ApplicationCases"
          options={{
            title: 'Application cases',
          }}
        />

        <Stack.Screen
          component={ApplicationCaseFormScreen}
          name="ApplicationCaseForm"
          options={({ route }) => ({
            title: route.params.applicationCaseId
              ? 'Edit application case'
              : 'Open application case',
          })}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
