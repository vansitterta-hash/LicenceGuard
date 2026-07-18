import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  CalendarClock,
  BookOpen,
  FileCheck2,
  LogOut,
  Search,
  TriangleAlert,
  Users,
} from 'lucide-react-native';

import Button from '../components/Button';
import Card from '../components/Card';
import Screen from '../components/Screen';
import { useAuth } from '../context/AuthContext';
import { Colors } from '../theme/colors';
import { Radius } from '../theme/radius';
import { Spacing } from '../theme/spacing';
import { Typography } from '../theme/typography';
import type { RootStackParamList } from '../types/navigation';

const licenceGuardLogo = require('../../assets/LicenceGuard Logo.png');

type Props = NativeStackScreenProps<
  RootStackParamList,
  'Dashboard'
>;

const summaryCards = [
  {
    label: 'Clients',
    value: '0',
    icon: Users,
  },
  {
    label: 'Due within 120 days',
    value: '0',
    icon: CalendarClock,
  },
  {
    label: 'Open application cases',
    value: '0',
    icon: FileCheck2,
  },
  {
    label: 'Expired or critical',
    value: '0',
    icon: TriangleAlert,
  },
];

export default function DashboardScreen({
  navigation,
}: Props) {
  const {
    dealerProfile,
    loading,
    signOut,
  } = useAuth();

  const { width } = useWindowDimensions();
  const isCompact = width < 720;

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      Alert.alert(
        'Sign-out failed',
        error instanceof Error
          ? error.message
          : 'Unable to sign out.'
      );
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator
          color={Colors.primary}
          size="large"
        />
      </View>
    );
  }

  return (
    <Screen>
      <View
        style={[
          styles.header,
          isCompact
            ? styles.headerCompact
            : null,
        ]}
      >
        <View style={styles.brandBlock}>
          <View style={styles.logoFrame}>
            <Image
              accessibilityLabel="LicenceGuard"
              resizeMode="contain"
              source={licenceGuardLogo}
              style={styles.logo}
            />
          </View>

          <View style={styles.brandText}>
            <Text style={styles.brandName}>
              LicenceGuard
            </Text>

            <Text style={styles.brandSubtitle}>
              FIREARM COMPETENCY &amp; LICENCE MANAGEMENT
            </Text>

            <Text style={styles.brandTagline}>
              PROTECT • COMPLY • RENEW
            </Text>
          </View>
        </View>

        <Button
          leftIcon={
            <LogOut
              color={Colors.silver}
              size={18}
            />
          }
          onPress={() => {
            void handleSignOut();
          }}
          size="small"
          title="Sign out"
          variant="secondary"
        />
      </View>

      <Card
        padding="large"
        style={styles.heroCard}
      >
        <Text style={styles.eyebrow}>
          DEALER APPLICATION WORKSPACE
        </Text>

        <Text style={styles.heroTitle}>
          Welcome
          {dealerProfile?.fullName
            ? `, ${dealerProfile.fullName}`
            : ''}
        </Text>

        <Text style={styles.dealerName}>
          {dealerProfile?.dealerName ??
            'LicenceGuard Dealer'}
        </Text>

        <Text style={styles.heroText}>
          Manage clients, competencies, firearm licences,
          first and additional applications, renewals,
          reapplications and final outcomes.
        </Text>

        <Button
          leftIcon={
            <Search
              color={Colors.white}
              size={20}
            />
          }
          onPress={() =>
            navigation.navigate('Clients')
          }
          style={styles.heroButton}
          title="Search or add a client"
        />
      </Card>

      <Text style={styles.sectionTitle}>
        Compliance overview
      </Text>

      <View style={styles.summaryGrid}>
        {summaryCards.map((summary) => {
          const Icon = summary.icon;

          return (
            <Pressable
              key={summary.label}
              onPress={() => navigation.navigate('Clients')}
              style={({ pressed }) => [
                styles.summaryPressable,
                pressed ? styles.summaryPressed : null,
              ]}
            >
            <Card
              style={styles.summaryCard}
            >
              <View style={styles.summaryIcon}>
                <Icon
                  color={Colors.primary}
                  size={22}
                />
              </View>

              <Text style={styles.summaryValue}>
                {summary.value}
              </Text>

              <Text style={styles.summaryLabel}>
                {summary.label}
              </Text>
            </Card>
            </Pressable>
          );
        })}
      </View>

      <Card
        subtitle="Search the classified motivations, research and supporting documents drawn from successful application packs."
        title="Reference library"
      >
        <Text style={styles.moduleText}>
          Use proven examples by calibre, firearm, application folder and document type while preparing a new case.
        </Text>

        <Button
          leftIcon={
            <BookOpen
              color={Colors.silver}
              size={19}
            />
          }
          onPress={() =>
            navigation.navigate('ReferenceLibrary')
          }
          style={styles.moduleButton}
          title="Open reference library"
          variant="secondary"
        />
      </Card>

      <Card
        subtitle="Add, search and review firearm-owner records."
        title="Client management"
      >
        <Text style={styles.moduleText}>
          Open a client profile to manage competencies,
          firearms, licences and application cases.
        </Text>

        <Button
          leftIcon={
            <Users
              color={Colors.silver}
              size={19}
            />
          }
          onPress={() =>
            navigation.navigate('Clients')
          }
          style={styles.moduleButton}
          title="Open clients"
          variant="secondary"
        />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  loadingScreen: {
    alignItems: 'center',
    backgroundColor: Colors.background,
    flex: 1,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.lg,
  },
  headerCompact: {
    alignItems: 'stretch',
    flexDirection: 'column',
    gap: Spacing.lg,
  },
  brandBlock: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 1,
  },
  logoFrame: {
    alignItems: 'center',
    backgroundColor: Colors.surfaceRaised,
    borderColor: Colors.primaryDark,
    borderRadius: Radius.lg,
    borderWidth: 1,
    height: 76,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 76,
  },
  logo: {
    height: 72,
    width: 72,
  },
  brandText: {
    flexShrink: 1,
    marginLeft: Spacing.md,
  },
  brandName: {
    ...Typography.sectionTitle,
    color: Colors.white,
  },
  brandSubtitle: {
    ...Typography.caption,
    color: Colors.silver,
    fontWeight: '800',
    letterSpacing: 0.7,
    marginTop: Spacing.xxs,
  },
  brandTagline: {
    ...Typography.caption,
    color: Colors.primary,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginTop: Spacing.xxs,
  },
  heroCard: {
    borderColor: Colors.primaryDark,
  },
  eyebrow: {
    ...Typography.eyebrow,
    color: Colors.primary,
  },
  heroTitle: {
    ...Typography.pageTitle,
    color: Colors.white,
    marginTop: Spacing.sm,
  },
  dealerName: {
    ...Typography.bodyStrong,
    color: Colors.silver,
    marginTop: Spacing.xs,
  },
  heroText: {
    ...Typography.body,
    color: Colors.textMuted,
    marginTop: Spacing.md,
    maxWidth: 760,
  },
  heroButton: {
    alignSelf: 'flex-start',
    marginTop: Spacing.xl,
  },
  sectionTitle: {
    ...Typography.sectionTitle,
    color: Colors.white,
    marginBottom: Spacing.md,
    marginTop: Spacing.lg,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
    marginBottom: Spacing.xxl,
  },
  summaryPressable: {
    flexBasis: 220,
    flexGrow: 1,
  },
  summaryPressed: {
    opacity: 0.82,
  },
  summaryCard: {
    flexGrow: 1,
    minHeight: 140,
    minWidth: 190,
  },
  summaryIcon: {
    alignItems: 'center',
    backgroundColor: Colors.primarySoft,
    borderRadius: Radius.md,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  summaryValue: {
    ...Typography.metric,
    color: Colors.white,
    marginTop: Spacing.md,
  },
  summaryLabel: {
    ...Typography.caption,
    color: Colors.textMuted,
    marginTop: Spacing.xxs,
  },
  moduleText: {
    ...Typography.body,
    color: Colors.textMuted,
  },
  moduleButton: {
    alignSelf: 'flex-start',
    marginTop: Spacing.lg,
  },
});
