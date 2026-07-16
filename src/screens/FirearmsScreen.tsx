import {
  useCallback,
  useEffect,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  Archive,
  CalendarClock,
  Edit3,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Target,
  TriangleAlert,
} from 'lucide-react-native';

import Button from '../components/Button';
import Card from '../components/Card';
import Screen from '../components/Screen';
import { useAuth } from '../context/AuthContext';
import { getCompetencyCategoryLabel } from '../engines/competencyEngine';
import { getClient } from '../services/clientService';
import {
  archiveFirearm,
  getFirearmTypeLabel,
  listClientFirearms,
} from '../services/firearmService';
import { Colors } from '../theme/colors';
import { Radius } from '../theme/radius';
import { Spacing } from '../theme/spacing';
import { Typography } from '../theme/typography';
import type { ClientRecord } from '../types/client';
import type { FirearmListItem } from '../types/firearm';
import type { RootStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<
  RootStackParamList,
  'Firearms'
>;

type ScreenData = {
  client: ClientRecord;
  firearms: FirearmListItem[];
};

export default function FirearmsScreen({
  navigation,
  route,
}: Props) {
  const { dealerProfile, user } = useAuth();
  const { width } = useWindowDimensions();

  const [data, setData] = useState<ScreenData | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [archivingId, setArchivingId] = useState<
    string | null
  >(null);

  const isCompact = width < 760;

  const loadData = useCallback(async () => {
    setLoading(true);

    try {
      const [client, firearms] = await Promise.all([
        getClient(route.params.clientId),
        listClientFirearms(route.params.clientId),
      ]);

      setData({
        client,
        firearms,
      });
    } catch (error) {
      Alert.alert(
        'Unable to load firearms',
        error instanceof Error
          ? error.message
          : 'An unknown error occurred.'
      );
    } finally {
      setLoading(false);
    }
  }, [route.params.clientId]);

  useEffect(() => {
    void loadData();

    const unsubscribe = navigation.addListener(
      'focus',
      () => {
        void loadData();
      }
    );

    return unsubscribe;
  }, [loadData, navigation]);

  const confirmArchive = (firearm: FirearmListItem) => {
    if (
      !dealerProfile?.dealerId ||
      !user?.id
    ) {
      return;
    }

    Alert.alert(
      'Archive firearm',
      `Archive ${firearm.make} ${
        firearm.model ?? ''
      } (${firearm.serial_number})? The record will remain in the database but will be removed from the active register.`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Archive',
          style: 'destructive',
          onPress: async () => {
            setArchivingId(firearm.id);

            try {
              await archiveFirearm(
                firearm.id,
                dealerProfile.dealerId,
                user.id
              );

              await loadData();
            } catch (error) {
              Alert.alert(
                'Unable to archive firearm',
                error instanceof Error
                  ? error.message
                  : 'An unknown error occurred.'
              );
            } finally {
              setArchivingId(null);
            }
          },
        },
      ]
    );
  };

  if (loading || !data) {
    return (
      <Screen scroll={false}>
        <View style={styles.loadingState}>
          <ActivityIndicator
            color={Colors.primary}
            size="large"
          />

          <Text style={styles.loadingText}>
            Loading firearm register...
          </Text>
        </View>
      </Screen>
    );
  }

  const { client, firearms } = data;

  const licensedCount = firearms.filter(
    (firearm) => firearm.licence
  ).length;

  const dueCount = firearms.filter((firearm) =>
    [
      'APPROACHING',
      'RENEWAL_DUE',
      'URGENT',
    ].includes(firearm.licenceHealth)
  ).length;

  const criticalCount = firearms.filter(
    (firearm) =>
      firearm.licenceHealth === 'EXPIRED' ||
      firearm.licenceHealth === 'NO_LICENCE'
  ).length;

  return (
    <Screen maxWidth={1100}>
      <View
        style={[
          styles.header,
          isCompact ? styles.headerCompact : null,
        ]}
      >
        <View style={styles.headerContent}>
          <Text style={styles.eyebrow}>
            CLIENT FIREARM REGISTER
          </Text>

          <Text style={styles.title}>
            {client.first_name} {client.surname}
          </Text>

          <Text style={styles.subtitle}>
            Capture firearms, link the correct competency
            category and monitor current licence expiry
            dates.
          </Text>
        </View>

        <Button
          leftIcon={
            <Plus
              color={Colors.white}
              size={19}
            />
          }
          onPress={() =>
            navigation.navigate('FirearmForm', {
              clientId: client.id,
            })
          }
          title="Add firearm"
        />
      </View>

      <View style={styles.summaryGrid}>
        <SummaryCard
          icon={Target}
          label="Active firearms"
          value={firearms.length}
        />

        <SummaryCard
          icon={ShieldCheck}
          label="Licences recorded"
          value={licensedCount}
        />

        <SummaryCard
          icon={CalendarClock}
          label="Application attention"
          value={dueCount}
        />

        <SummaryCard
          icon={ShieldAlert}
          label="Critical or missing"
          value={criticalCount}
        />
      </View>

      <Card
        subtitle="Only active firearm records are shown."
        title="Firearms"
      >
        {firearms.length === 0 ? (
          <View style={styles.emptyState}>
            <Target
              color={Colors.silverDark}
              size={40}
            />

            <Text style={styles.emptyTitle}>
              No firearms recorded
            </Text>

            <Text style={styles.emptyText}>
              Add the client's first firearm to begin
              licence tracking and renewal preparation.
            </Text>

            <Button
              leftIcon={
                <Plus
                  color={Colors.white}
                  size={18}
                />
              }
              onPress={() =>
                navigation.navigate('FirearmForm', {
                  clientId: client.id,
                })
              }
              style={styles.emptyButton}
              title="Add firearm"
            />
          </View>
        ) : (
          <View style={styles.firearmList}>
            {firearms.map((firearm) => (
              <FirearmCard
                archiving={
                  archivingId === firearm.id
                }
                firearm={firearm}
                key={firearm.id}
                onArchive={() =>
                  confirmArchive(firearm)
                }
                onEdit={() =>
                  navigation.navigate(
                    'FirearmForm',
                    {
                      clientId: client.id,
                      firearmId: firearm.id,
                    }
                  )
                }
              />
            ))}
          </View>
        )}
      </Card>
    </Screen>
  );
}

function FirearmCard({
  firearm,
  archiving,
  onArchive,
  onEdit,
}: {
  firearm: FirearmListItem;
  archiving: boolean;
  onArchive: () => void;
  onEdit: () => void;
}) {
  const visual = getLicenceVisual(
    firearm.licenceHealth
  );

  const description = [
    firearm.make,
    firearm.model,
    firearm.calibre,
  ]
    .filter(Boolean)
    .join(' • ');

  return (
    <View
      style={[
        styles.firearmCard,
        {
          borderColor: visual.borderColor,
        },
      ]}
    >
      <View style={styles.firearmTopRow}>
        <View style={styles.firearmIdentity}>
          <View
            style={[
              styles.firearmIcon,
              {
                backgroundColor:
                  visual.backgroundColor,
              },
            ]}
          >
            <Target
              color={visual.color}
              size={24}
            />
          </View>

          <View style={styles.firearmText}>
            <Text style={styles.firearmTitle}>
              {description}
            </Text>

            <Text style={styles.serialText}>
              Serial: {firearm.serial_number}
            </Text>
          </View>
        </View>

        <View
          style={[
            styles.statusBadge,
            {
              backgroundColor:
                visual.backgroundColor,
              borderColor: visual.borderColor,
            },
          ]}
        >
          <Text
            style={[
              styles.statusBadgeText,
              {
                color: visual.color,
              },
            ]}
          >
            {visual.label}
          </Text>
        </View>
      </View>

      <View style={styles.detailsGrid}>
        <Detail
          label="Firearm type"
          value={getFirearmTypeLabel(
            firearm.firearm_type
          )}
        />

        <Detail
          label="Required competency"
          value={getCompetencyCategoryLabel(
            firearm.required_competency
          )}
        />

        <Detail
          label="Licence number"
          value={
            firearm.licence?.licence_number ??
            'Not recorded'
          }
        />

        <Detail
          label="Licence section"
          value={
            firearm.licence?.licence_section ??
            'Not recorded'
          }
        />

        <Detail
          label="Expiry date"
          value={formatDate(
            firearm.licence?.expiry_date ?? null
          )}
        />

        <Detail
          label="Time remaining"
          value={formatDaysRemaining(
            firearm.daysUntilExpiry
          )}
        />
      </View>

      <View style={styles.actionRow}>
        <Button
          leftIcon={
            <Edit3
              color={Colors.silver}
              size={17}
            />
          }
          onPress={onEdit}
          size="small"
          title="Edit firearm and licence"
          variant="secondary"
        />

        <Button
          leftIcon={
            <Archive
              color={Colors.white}
              size={17}
            />
          }
          loading={archiving}
          onPress={onArchive}
          size="small"
          title="Archive"
          variant="danger"
        />
      </View>
    </View>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Target;
  label: string;
  value: number;
}) {
  return (
    <Card style={styles.summaryCard}>
      <View style={styles.summaryIcon}>
        <Icon
          color={Colors.primary}
          size={21}
        />
      </View>

      <Text style={styles.summaryValue}>
        {value}
      </Text>

      <Text style={styles.summaryLabel}>
        {label}
      </Text>
    </Card>
  );
}

function Detail({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View style={styles.detail}>
      <Text style={styles.detailLabel}>
        {label}
      </Text>

      <Text style={styles.detailValue}>
        {value}
      </Text>
    </View>
  );
}

function getLicenceVisual(
  health: FirearmListItem['licenceHealth']
) {
  switch (health) {
    case 'VALID':
      return {
        label: 'Valid',
        color: Colors.success,
        borderColor: Colors.success,
        backgroundColor:
          'rgba(40, 199, 111, 0.1)',
      };

    case 'APPROACHING':
      return {
        label: 'Approaching',
        color: Colors.warning,
        borderColor: Colors.warning,
        backgroundColor:
          'rgba(255, 193, 7, 0.1)',
      };

    case 'RENEWAL_DUE':
      return {
        label: 'Renewal due',
        color: Colors.warning,
        borderColor: Colors.warning,
        backgroundColor:
          'rgba(255, 193, 7, 0.1)',
      };

    case 'URGENT':
      return {
        label: 'Urgent',
        color: Colors.warning,
        borderColor: Colors.warning,
        backgroundColor:
          'rgba(255, 193, 7, 0.1)',
      };

    case 'EXPIRED':
      return {
        label: 'Expired',
        color: Colors.danger,
        borderColor: Colors.danger,
        backgroundColor:
          'rgba(229, 57, 53, 0.1)',
      };

    default:
      return {
        label: 'No licence',
        color: Colors.silver,
        borderColor: Colors.borderStrong,
        backgroundColor: Colors.surfaceSoft,
      };
  }
}

function formatDate(
  dateValue: string | null
): string {
  if (!dateValue) {
    return 'Not recorded';
  }

  return new Date(
    `${dateValue}T00:00:00`
  ).toLocaleDateString('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatDaysRemaining(
  days: number | null
): string {
  if (days === null) {
    return 'No licence recorded';
  }

  if (days < 0) {
    return `Expired ${Math.abs(days)} days ago`;
  }

  if (days === 0) {
    return 'Expires today';
  }

  return `${days} days remaining`;
}

const styles = StyleSheet.create({
  loadingState: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  loadingText: {
    ...Typography.body,
    color: Colors.textMuted,
    marginTop: Spacing.md,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.xxl,
  },
  headerCompact: {
    alignItems: 'stretch',
    flexDirection: 'column',
    gap: Spacing.lg,
  },
  headerContent: {
    flex: 1,
    marginRight: Spacing.xl,
  },
  eyebrow: {
    ...Typography.eyebrow,
    color: Colors.primary,
  },
  title: {
    ...Typography.pageTitle,
    color: Colors.white,
    marginTop: Spacing.xxs,
  },
  subtitle: {
    ...Typography.body,
    color: Colors.textMuted,
    marginTop: Spacing.sm,
    maxWidth: 680,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  summaryCard: {
    flexGrow: 1,
    minWidth: 170,
  },
  summaryIcon: {
    alignItems: 'center',
    backgroundColor: Colors.primarySoft,
    borderRadius: Radius.md,
    height: 38,
    justifyContent: 'center',
    width: 38,
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
  emptyState: {
    alignItems: 'center',
    paddingVertical: Spacing.xxxl,
  },
  emptyTitle: {
    ...Typography.cardTitle,
    color: Colors.white,
    marginTop: Spacing.md,
  },
  emptyText: {
    ...Typography.body,
    color: Colors.textMuted,
    marginTop: Spacing.xs,
    maxWidth: 520,
    textAlign: 'center',
  },
  emptyButton: {
    marginTop: Spacing.lg,
  },
  firearmList: {
    gap: Spacing.lg,
  },
  firearmCard: {
    backgroundColor: Colors.surfaceRaised,
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.lg,
  },
  firearmTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  firearmIdentity: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    marginRight: Spacing.md,
  },
  firearmIcon: {
    alignItems: 'center',
    borderRadius: Radius.md,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  firearmText: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  firearmTitle: {
    ...Typography.cardTitle,
    color: Colors.white,
  },
  serialText: {
    ...Typography.caption,
    color: Colors.textMuted,
    marginTop: Spacing.xxs,
  },
  statusBadge: {
    borderRadius: Radius.pill,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  statusBadgeText: {
    ...Typography.caption,
    fontWeight: '800',
  },
  detailsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
    marginTop: Spacing.lg,
  },
  detail: {
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    borderWidth: 1,
    flexGrow: 1,
    minWidth: 190,
    padding: Spacing.md,
  },
  detailLabel: {
    ...Typography.label,
    color: Colors.textMuted,
  },
  detailValue: {
    ...Typography.body,
    color: Colors.text,
    marginTop: Spacing.xxs,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
    marginTop: Spacing.lg,
  },
});
