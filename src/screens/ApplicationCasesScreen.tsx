import {
  useCallback,
  useEffect,
  useMemo,
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
  CalendarClock,
  CheckCircle2,
  CircleDot,
  Edit3,
  FileCheck2,
  Plus,
  Trash2,
  TriangleAlert,
} from 'lucide-react-native';

import Button from '../components/Button';
import Card from '../components/Card';
import Screen from '../components/Screen';
import { useAuth } from '../context/AuthContext';
import {
  deleteApplicationCase,
  listClientApplicationCases,
} from '../services/applicationCaseService';
import { getClient } from '../services/clientService';
import { Colors } from '../theme/colors';
import { Radius } from '../theme/radius';
import { Spacing } from '../theme/spacing';
import { Typography } from '../theme/typography';
import {
  getApplicationCaseStatusLabel,
  getApplicationCaseTypeLabel,
  type ApplicationCaseListItem,
} from '../types/applicationCase';
import type { ClientRecord } from '../types/client';
import type { RootStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<
  RootStackParamList,
  'ApplicationCases'
>;

type ScreenData = {
  client: ClientRecord;
  cases: ApplicationCaseListItem[];
};

type CaseFilter =
  | 'ALL'
  | 'OPEN'
  | 'OVERDUE'
  | 'CLOSED';

export default function ApplicationCasesScreen({
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
  const [filter, setFilter] =
    useState<CaseFilter>('OPEN');

  const isCompact = width < 760;

  const loadData = useCallback(async () => {
    setLoading(true);

    try {
      const [client, cases] = await Promise.all([
        getClient(route.params.clientId),
        listClientApplicationCases(
          route.params.clientId
        ),
      ]);

      setData({
        client,
        cases,
      });
    } catch (error) {
      Alert.alert(
        'Unable to load application cases',
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

  const filteredCases = useMemo(() => {
    if (!data) {
      return [];
    }

    switch (filter) {
      case 'OPEN':
        return data.cases.filter(
          (applicationCase) =>
            applicationCase.isOpen
        );

      case 'OVERDUE':
        return data.cases.filter(
          (applicationCase) =>
            applicationCase.isOverdue
        );

      case 'CLOSED':
        return data.cases.filter(
          (applicationCase) =>
            !applicationCase.isOpen
        );

      default:
        return data.cases;
    }
  }, [data, filter]);

  const confirmDelete = (
    applicationCase: ApplicationCaseListItem
  ) => {
    if (!dealerProfile?.dealerId) {
      return;
    }

    Alert.alert(
      'Delete application case',
      `Delete the ${getApplicationCaseTypeLabel(
        applicationCase.application_type
      )} case for ${
        applicationCase.subjectDescription
      }? This action cannot be undone.`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeletingId(applicationCase.id);

            try {
              await deleteApplicationCase(
                applicationCase.id,
                dealerProfile.dealerId
              );

              await loadData();
            } catch (error) {
              Alert.alert(
                'Unable to delete application case',
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
            Loading application cases...
          </Text>
        </View>
      </Screen>
    );
  }

  const openCount = data.cases.filter(
    (applicationCase) =>
      applicationCase.isOpen
  ).length;

  const overdueCount = data.cases.filter(
    (applicationCase) =>
      applicationCase.isOverdue
  ).length;

  const submittedCount = data.cases.filter(
    (applicationCase) =>
      applicationCase.status === 'SUBMITTED'
  ).length;

  const completedCount = data.cases.filter(
    (applicationCase) =>
      !applicationCase.isOpen
  ).length;

  return (
    <Screen maxWidth={1120}>
      <View
        style={[
          styles.header,
          isCompact ? styles.headerCompact : null,
        ]}
      >
        <View style={styles.headerContent}>
          <Text style={styles.eyebrow}>
            APPLICATION CASES
          </Text>

          <Text style={styles.title}>
            {data.client.first_name}{' '}
            {data.client.surname}
          </Text>

          <Text style={styles.subtitle}>
            Track competency and firearm licence
            applications from preparation through
            submission and outcome.
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
            navigation.navigate(
              'ApplicationCaseForm',
              {
                clientId: data.client.id,
              }
            )
          }
          title="Open application case"
        />
      </View>

      <View style={styles.summaryGrid}>
        <SummaryCard
          icon={CircleDot}
          label="Open cases"
          value={openCount}
        />

        <SummaryCard
          icon={TriangleAlert}
          label="Overdue"
          value={overdueCount}
        />

        <SummaryCard
          icon={FileCheck2}
          label="Submitted"
          value={submittedCount}
        />

        <SummaryCard
          icon={CheckCircle2}
          label="Completed"
          value={completedCount}
        />
      </View>

      <View style={styles.filterRow}>
        <FilterButton
          active={filter === 'OPEN'}
          label="Open"
          onPress={() => setFilter('OPEN')}
        />

        <FilterButton
          active={filter === 'OVERDUE'}
          label="Overdue"
          onPress={() => setFilter('OVERDUE')}
        />

        <FilterButton
          active={filter === 'CLOSED'}
          label="Closed"
          onPress={() => setFilter('CLOSED')}
        />

        <FilterButton
          active={filter === 'ALL'}
          label="All"
          onPress={() => setFilter('ALL')}
        />
      </View>

      <Card
        subtitle={`${filteredCases.length} case${
          filteredCases.length === 1 ? '' : 's'
        } shown.`}
        title="Application work queue"
      >
        {filteredCases.length === 0 ? (
          <View style={styles.emptyState}>
            <FileCheck2
              color={Colors.silverDark}
              size={40}
            />

            <Text style={styles.emptyTitle}>
              No matching application cases
            </Text>

            <Text style={styles.emptyText}>
              Open a new competency or firearm licence
              application case for this client.
            </Text>

            <Button
              leftIcon={
                <Plus
                  color={Colors.white}
                  size={18}
                />
              }
              onPress={() =>
                navigation.navigate(
                  'ApplicationCaseForm',
                  {
                    clientId: data.client.id,
                  }
                )
              }
              style={styles.emptyButton}
              title="Open application case"
            />
          </View>
        ) : (
          <View style={styles.caseList}>
            {filteredCases.map(
              (applicationCase) => (
                <ApplicationCaseCard
                  applicationCase={
                    applicationCase
                  }
                  deleting={
                    deletingId ===
                    applicationCase.id
                  }
                  key={applicationCase.id}
                  onDelete={() =>
                    confirmDelete(applicationCase)
                  }
                  onEdit={() =>
                    navigation.navigate(
                      'ApplicationCaseForm',
                      {
                        clientId:
                          data.client.id,
                        applicationCaseId:
                          applicationCase.id,
                      }
                    )
                  }
                />
              )
            )}
          </View>
        )}
      </Card>
    </Screen>
  );
}

function ApplicationCaseCard({
  applicationCase,
  deleting,
  onDelete,
  onEdit,
}: {
  applicationCase: ApplicationCaseListItem;
  deleting: boolean;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const visual = getCaseVisual(applicationCase);

  return (
    <View
      style={[
        styles.caseCard,
        {
          borderColor: visual.borderColor,
        },
      ]}
    >
      <View style={styles.caseHeader}>
        <View style={styles.caseIdentity}>
          <View
            style={[
              styles.caseIcon,
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

          <View style={styles.caseTitleBlock}>
            <Text style={styles.caseTitle}>
              {applicationCase.subjectDescription}
            </Text>

            <Text style={styles.caseType}>
              {getApplicationCaseTypeLabel(
                applicationCase.application_type
              )}
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
            {getApplicationCaseStatusLabel(
              applicationCase.status
            )}
          </Text>
        </View>
      </View>

      <View style={styles.progressSection}>
        <View style={styles.progressHeader}>
          <Text style={styles.progressLabel}>
            Progress
          </Text>

          <Text style={styles.progressValue}>
            {applicationCase.progress_percent}%
          </Text>
        </View>

        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              {
                width: `${applicationCase.progress_percent}%`,
                backgroundColor: visual.color,
              },
            ]}
          />
        </View>
      </View>

      <View style={styles.detailsGrid}>
        <Detail
          label="Opened"
          value={formatDate(
            applicationCase.opened_date
          )}
        />

        <Detail
          label="Target submission"
          value={formatDate(
            applicationCase.target_submission_date
          )}
        />

        <Detail
          label="Time to target"
          value={formatTargetDays(
            applicationCase.daysUntilTarget
          )}
        />

        <Detail
          label="Reference"
          value={
            applicationCase.application_reference ??
            'Not recorded'
          }
        />

        <Detail
          label="Police station"
          value={
            applicationCase.police_station ??
            'Not recorded'
          }
        />

        <Detail
          label="Actual submission"
          value={formatDate(
            applicationCase.actual_submission_date
          )}
        />
      </View>

      {applicationCase.dealer_notes ? (
        <View style={styles.notesBlock}>
          <Text style={styles.notesLabel}>
            Dealer notes
          </Text>

          <Text style={styles.notesText}>
            {applicationCase.dealer_notes}
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
          title="Open case"
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
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof FileCheck2;
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

function FilterButton({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.filterButton,
        active ? styles.filterButtonActive : null,
        pressed ? styles.filterButtonPressed : null,
      ]}
    >
      <Text
        style={[
          styles.filterButtonText,
          active
            ? styles.filterButtonTextActive
            : null,
        ]}
      >
        {label}
      </Text>
    </Pressable>
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

function getCaseVisual(
  applicationCase: ApplicationCaseListItem
) {
  if (applicationCase.isOverdue) {
    return {
      color: Colors.danger,
      borderColor: Colors.danger,
      backgroundColor:
        'rgba(229, 57, 53, 0.1)',
      Icon: TriangleAlert,
    };
  }

  if (!applicationCase.isOpen) {
    return {
      color: Colors.success,
      borderColor: Colors.success,
      backgroundColor:
        'rgba(40, 199, 111, 0.1)',
      Icon: CheckCircle2,
    };
  }

  if (
    applicationCase.status === 'SUBMITTED' ||
    applicationCase.status ===
      'READY_FOR_SUBMISSION'
  ) {
    return {
      color: Colors.primary,
      borderColor: Colors.primary,
      backgroundColor: Colors.primarySoft,
      Icon: FileCheck2,
    };
  }

  return {
    color: Colors.warning,
    borderColor: Colors.warning,
    backgroundColor:
      'rgba(255, 193, 7, 0.1)',
    Icon: CalendarClock,
  };
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

function formatTargetDays(
  days: number | null
): string {
  if (days === null) {
    return 'No target date';
  }

  if (days < 0) {
    return `${Math.abs(days)} days overdue`;
  }

  if (days === 0) {
    return 'Due today';
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
    maxWidth: 720,
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
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  filterButton: {
    backgroundColor: Colors.surfaceRaised,
    borderColor: Colors.border,
    borderRadius: Radius.pill,
    borderWidth: 1,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  filterButtonActive: {
    backgroundColor: Colors.primarySoft,
    borderColor: Colors.primary,
  },
  filterButtonPressed: {
    opacity: 0.82,
  },
  filterButtonText: {
    ...Typography.caption,
    color: Colors.silver,
    fontWeight: '800',
  },
  filterButtonTextActive: {
    color: Colors.primary,
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
  caseList: {
    gap: Spacing.lg,
  },
  caseCard: {
    backgroundColor: Colors.surfaceRaised,
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.lg,
  },
  caseHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  caseIdentity: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    marginRight: Spacing.md,
  },
  caseIcon: {
    alignItems: 'center',
    borderRadius: Radius.md,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  caseTitleBlock: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  caseTitle: {
    ...Typography.cardTitle,
    color: Colors.white,
  },
  caseType: {
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
  progressSection: {
    marginTop: Spacing.lg,
  },
  progressHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  progressLabel: {
    ...Typography.label,
    color: Colors.textMuted,
  },
  progressValue: {
    ...Typography.bodyStrong,
    color: Colors.white,
  },
  progressTrack: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.pill,
    height: 8,
    marginTop: Spacing.sm,
    overflow: 'hidden',
  },
  progressFill: {
    borderRadius: Radius.pill,
    height: '100%',
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
  notesBlock: {
    borderTopColor: Colors.border,
    borderTopWidth: 1,
    marginTop: Spacing.lg,
    paddingTop: Spacing.lg,
  },
  notesLabel: {
    ...Typography.label,
    color: Colors.textMuted,
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
    marginTop: Spacing.lg,
  },
});