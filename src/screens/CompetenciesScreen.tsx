import {
  useCallback,
  useEffect,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  BadgeCheck,
  CalendarClock,
  Edit3,
  FilePlus2,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  TriangleAlert,
} from 'lucide-react-native';

import Button from '../components/Button';
import Card from '../components/Card';
import Screen from '../components/Screen';
import { useAuth } from '../context/AuthContext';
import {
  deleteCompetency,
  getClientCompetencySummary,
  type ClientCompetencySummary,
  type CompetencyCategorySummary,
  type CompetencyHealth,
} from '../engines/competencyEngine';
import { getClient } from '../services/clientService';
import { Colors } from '../theme/colors';
import { Radius } from '../theme/radius';
import { Spacing } from '../theme/spacing';
import { Typography } from '../theme/typography';
import type { ClientRecord } from '../types/client';
import type { RootStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<
  RootStackParamList,
  'Competencies'
>;

type ScreenData = {
  client: ClientRecord;
  summary: ClientCompetencySummary;
};

export default function CompetenciesScreen({
  navigation,
  route,
}: Props) {
  const { dealerProfile } = useAuth();
  const { width } = useWindowDimensions();

  const [data, setData] = useState<ScreenData | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<
    string | null
  >(null);

  const isCompact = width < 760;

  const loadData = useCallback(async () => {
    setLoading(true);

    try {
      const [client, summary] = await Promise.all([
        getClient(route.params.clientId),
        getClientCompetencySummary(
          route.params.clientId
        ),
      ]);

      setData({
        client,
        summary,
      });
    } catch (error) {
      Alert.alert(
        'Unable to load competencies',
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

  const confirmDelete = (
    category: CompetencyCategorySummary
  ) => {
    if (
      !category.record ||
      !dealerProfile?.dealerId
    ) {
      return;
    }

    Alert.alert(
      'Delete competency',
      `Delete the ${category.label} competency record? This action cannot be undone.`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (
              !category.record ||
              !dealerProfile?.dealerId
            ) {
              return;
            }

            setDeletingId(category.record.id);

            try {
              await deleteCompetency(
                category.record.id,
                dealerProfile.dealerId
              );

              await loadData();
            } catch (error) {
              Alert.alert(
                'Unable to delete competency',
                error instanceof Error
                  ? error.message
                  : 'An unknown error occurred.'
              );
            } finally {
              setDeletingId(null);
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
            Loading competencies...
          </Text>
        </View>
      </Screen>
    );
  }

  const { client, summary } = data;

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
            CLIENT COMPETENCIES
          </Text>

          <Text style={styles.title}>
            {client.first_name} {client.surname}
          </Text>

          <Text style={styles.subtitle}>
            Capture and maintain the four competency
            categories used by LicenceGuard.
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
            navigation.navigate('CompetencyForm', {
              clientId: client.id,
            })
          }
          title="Add competency"
        />
      </View>

      <View style={styles.summaryGrid}>
        <SummaryCard
          icon={FilePlus2}
          label="Recorded"
          value={summary.totalRecorded}
        />

        <SummaryCard
          icon={ShieldCheck}
          label="Valid"
          value={summary.validCount}
        />

        <SummaryCard
          icon={TriangleAlert}
          label="Action required"
          value={summary.actionRequiredCount}
        />

        <SummaryCard
          icon={ShieldAlert}
          label="Not recorded"
          value={summary.missingCount}
        />
      </View>

      <Card
        subtitle="Each client may have one record for each competency category."
        title="Competency categories"
      >
        <View style={styles.categoryList}>
          {summary.categories.map((category) => (
            <CompetencyCategoryCard
              category={category}
              deleting={
                deletingId === category.record?.id
              }
              key={category.category}
              onAdd={() =>
                navigation.navigate(
                  'CompetencyForm',
                  {
                    clientId: client.id,
                    initialCategory:
                      category.category,
                  }
                )
              }
              onDelete={() =>
                confirmDelete(category)
              }
              onEdit={() => {
                if (!category.record) {
                  return;
                }

                navigation.navigate(
                  'CompetencyForm',
                  {
                    clientId: client.id,
                    competencyId:
                      category.record.id,
                  }
                );
              }}
            />
          ))}
        </View>
      </Card>
    </Screen>
  );
}

function CompetencyCategoryCard({
  category,
  deleting,
  onAdd,
  onDelete,
  onEdit,
}: {
  category: CompetencyCategorySummary;
  deleting: boolean;
  onAdd: () => void;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const visual = getHealthVisual(category.health);
  const record = category.record;

  return (
    <View
      style={[
        styles.categoryCard,
        {
          borderColor: visual.borderColor,
        },
      ]}
    >
      <View style={styles.categoryTopRow}>
        <View style={styles.categoryIdentity}>
          <View
            style={[
              styles.categoryIcon,
              {
                backgroundColor:
                  visual.backgroundColor,
              },
            ]}
          >
            <visual.Icon
              color={visual.color}
              size={23}
            />
          </View>

          <View style={styles.categoryText}>
            <Text style={styles.categoryTitle}>
              {category.label}
            </Text>

            <Text
              style={[
                styles.healthLabel,
                {
                  color: visual.color,
                },
              ]}
            >
              {visual.label}
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
            {record ? 'Recorded' : 'Missing'}
          </Text>
        </View>
      </View>

      {record ? (
        <View style={styles.recordDetails}>
          <DetailRow
            label="Certificate number"
            value={
              record.certificate_number ??
              'Not recorded'
            }
          />

          <DetailRow
            label="Issue date"
            value={formatDate(record.issue_date)}
          />

          <DetailRow
            label="Expiry date"
            value={formatDate(record.expiry_date)}
          />

          <DetailRow
            label="Time remaining"
            value={formatDaysRemaining(
              record.daysUntilExpiry
            )}
          />

          <View style={styles.verifiedRow}>
            <BadgeCheck
              color={
                record.verified
                  ? Colors.success
                  : Colors.warning
              }
              size={18}
            />

            <Text style={styles.verifiedText}>
              {record.verified
                ? 'Certificate verified'
                : 'Certificate not verified'}
            </Text>
          </View>

          {record.notes ? (
            <View style={styles.notesBlock}>
              <Text style={styles.detailLabel}>
                Notes
              </Text>

              <Text style={styles.notesText}>
                {record.notes}
              </Text>
            </View>
          ) : null}

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
              title="Edit"
              variant="secondary"
            />

            <Button
              leftIcon={
                <Trash2
                  color={Colors.white}
                  size={17}
                />
              }
              loading={deleting}
              onPress={onDelete}
              size="small"
              title="Delete"
              variant="danger"
            />
          </View>
        </View>
      ) : (
        <View style={styles.missingContent}>
          <Text style={styles.nextAction}>
            {category.nextAction}
          </Text>

          <Button
            leftIcon={
              <Plus
                color={Colors.white}
                size={17}
              />
            }
            onPress={onAdd}
            size="small"
            title="Capture competency"
          />
        </View>
      )}
    </View>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof ShieldCheck;
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

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>
        {label}
      </Text>

      <Text style={styles.detailValue}>
        {value}
      </Text>
    </View>
  );
}

function getHealthVisual(
  health: CompetencyHealth
) {
  switch (health) {
    case 'VALID':
      return {
        label: 'Valid',
        color: Colors.success,
        borderColor: Colors.success,
        backgroundColor:
          'rgba(40, 199, 111, 0.1)',
        Icon: ShieldCheck,
      };

    case 'RENEWAL_DUE':
      return {
        label: 'Renewal due',
        color: Colors.warning,
        borderColor: Colors.warning,
        backgroundColor:
          'rgba(255, 193, 7, 0.1)',
        Icon: CalendarClock,
      };

    case 'URGENT':
      return {
        label: 'Urgent',
        color: Colors.warning,
        borderColor: Colors.warning,
        backgroundColor:
          'rgba(255, 193, 7, 0.1)',
        Icon: TriangleAlert,
      };

    case 'EXPIRED':
      return {
        label: 'Expired',
        color: Colors.danger,
        borderColor: Colors.danger,
        backgroundColor:
          'rgba(229, 57, 53, 0.1)',
        Icon: ShieldAlert,
      };

    default:
      return {
        label: 'Incomplete',
        color: Colors.silver,
        borderColor: Colors.borderStrong,
        backgroundColor: Colors.surfaceSoft,
        Icon: FilePlus2,
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
    return 'Expiry date not recorded';
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
  categoryList: {
    gap: Spacing.lg,
  },
  categoryCard: {
    backgroundColor: Colors.surfaceRaised,
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.lg,
  },
  categoryTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  categoryIdentity: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    marginRight: Spacing.md,
  },
  categoryIcon: {
    alignItems: 'center',
    borderRadius: Radius.md,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  categoryText: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  categoryTitle: {
    ...Typography.cardTitle,
    color: Colors.white,
  },
  healthLabel: {
    ...Typography.caption,
    fontWeight: '800',
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
  recordDetails: {
    marginTop: Spacing.lg,
  },
  detailRow: {
    borderTopColor: Colors.border,
    borderTopWidth: 1,
    paddingVertical: Spacing.md,
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
  verifiedRow: {
    alignItems: 'center',
    borderTopColor: Colors.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    paddingVertical: Spacing.md,
  },
  verifiedText: {
    ...Typography.body,
    color: Colors.text,
    marginLeft: Spacing.sm,
  },
  notesBlock: {
    borderTopColor: Colors.border,
    borderTopWidth: 1,
    paddingVertical: Spacing.md,
  },
  notesText: {
    ...Typography.body,
    color: Colors.text,
    marginTop: Spacing.xxs,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
    marginTop: Spacing.md,
  },
  missingContent: {
    alignItems: 'flex-start',
    borderTopColor: Colors.border,
    borderTopWidth: 1,
    marginTop: Spacing.lg,
    paddingTop: Spacing.lg,
  },
  nextAction: {
    ...Typography.body,
    color: Colors.textMuted,
    marginBottom: Spacing.md,
  },
});