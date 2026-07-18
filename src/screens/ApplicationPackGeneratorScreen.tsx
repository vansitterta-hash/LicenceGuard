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
  BookOpen,
  CheckCircle2,
  CircleAlert,
  ClipboardCheck,
  Edit3,
  FileCheck2,
  FileText,
  FolderOpen,
  RefreshCw,
  ShieldCheck,
  Target,
  TriangleAlert,
  Upload,
  UserRound,
} from 'lucide-react-native';

import Button from '../components/Button';
import Card from '../components/Card';
import Screen from '../components/Screen';
import { getApplicationCase } from '../services/applicationCaseService';
import { getClientApplicationReadiness } from '../services/applicationReadinessService';
import { getClient } from '../services/clientService';
import { listClientFirearms } from '../services/firearmService';
import { Colors } from '../theme/colors';
import { Radius } from '../theme/radius';
import { Spacing } from '../theme/spacing';
import { Typography } from '../theme/typography';
import {
  getApplicationCaseStatusLabel,
  getApplicationCaseTypeLabel,
  isCompetencyApplicationType,
  type ApplicationCaseListItem,
} from '../types/applicationCase';
import type { ClientRecord } from '../types/client';
import type { DocumentType } from '../types/document';
import type { FirearmListItem } from '../types/firearm';
import type { RootStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<
  RootStackParamList,
  'ApplicationPackGenerator'
>;

type RequirementItem = {
  key: string;
  label: string;
  detail: string;
  required: boolean;
  state:
    | 'PRESENT'
    | 'MISSING'
    | 'EXPIRED'
    | 'UNVERIFIED'
    | 'NOT_APPLICABLE';
  documentType: DocumentType | null;
};

type CaseReadiness = {
  caseId: string;
  state:
    | 'READY'
    | 'ACTION_REQUIRED'
    | 'BLOCKED'
    | 'NOT_STARTED';
  readinessPercent: number;
  requirements: RequirementItem[];
};

type WorkspaceData = {
  client: ClientRecord;
  applicationCase: ApplicationCaseListItem;
  firearm: FirearmListItem | null;
  readiness: CaseReadiness | null;
};

export default function ApplicationPackGeneratorScreen({
  navigation,
  route,
}: Props) {
  const { width } = useWindowDimensions();
  const [data, setData] = useState<WorkspaceData | null>(
    null
  );
  const [loading, setLoading] = useState(true);

  const isCompact = width < 820;

  const loadData = useCallback(async () => {
    setLoading(true);

    try {
      const [
        client,
        applicationCase,
        firearms,
        readinessResult,
      ] = await Promise.all([
        getClient(route.params.clientId),
        getApplicationCase(
          route.params.applicationCaseId
        ),
        listClientFirearms(route.params.clientId),
        getClientApplicationReadiness(
          route.params.clientId
        ),
      ]);

      const readiness =
        (
          readinessResult as unknown as {
            cases?: CaseReadiness[];
          }
        ).cases?.find(
          (item) =>
            item.caseId ===
            route.params.applicationCaseId
        ) ?? null;

      const firearm =
        firearms.find(
          (item) =>
            item.id === applicationCase.firearm_id
        ) ?? null;

      setData({
        client,
        applicationCase,
        firearm,
        readiness,
      });
    } catch (error) {
      Alert.alert(
        'Unable to load application workspace',
        error instanceof Error
          ? error.message
          : 'An unknown error occurred.'
      );
    } finally {
      setLoading(false);
    }
  }, [
    route.params.applicationCaseId,
    route.params.clientId,
  ]);

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

  const counts = useMemo(() => {
    const requirements =
      data?.readiness?.requirements ?? [];

    return {
      total: requirements.length,
      complete: requirements.filter(
        (item) => item.state === 'PRESENT'
      ).length,
      missing: requirements.filter(
        (item) =>
          item.state === 'MISSING' ||
          item.state === 'EXPIRED'
      ).length,
      unverified: requirements.filter(
        (item) => item.state === 'UNVERIFIED'
      ).length,
    };
  }, [data?.readiness?.requirements]);

  if (loading || !data) {
    return (
      <Screen scroll={false}>
        <View style={styles.loadingState}>
          <ActivityIndicator
            color={Colors.primary}
            size="large"
          />

          <Text style={styles.loadingText}>
            Building application workspace...
          </Text>
        </View>
      </Screen>
    );
  }

  const visual = getReadinessVisual(
    data.readiness?.state ?? 'NOT_STARTED'
  );

  const competencyApplication =
    isCompetencyApplicationType(
      data.applicationCase.application_type
    );

  const subjectTitle = competencyApplication
    ? data.applicationCase.subjectDescription
    : data.firearm
      ? [data.firearm.make, data.firearm.model]
          .filter(Boolean)
          .join(' ')
      : data.applicationCase.subjectDescription;

  const secondarySubject = competencyApplication
    ? 'Competency application'
    : data.firearm
      ? `${data.firearm.calibre} • ${data.firearm.serial_number}`
      : 'Firearm details unavailable';

  return (
    <Screen maxWidth={1180}>
      <View
        style={[
          styles.header,
          isCompact ? styles.headerCompact : null,
        ]}
      >
        <View style={styles.headerContent}>
          <Text style={styles.eyebrow}>
            APPLICATION PACK WORKSPACE
          </Text>

          <Text style={styles.title}>
            {subjectTitle}
          </Text>

          <Text style={styles.subtitle}>
            {data.client.first_name}{' '}
            {data.client.surname} •{' '}
            {getApplicationCaseTypeLabel(
              data.applicationCase.application_type
            )}
          </Text>
        </View>

        <View style={styles.headerActions}>
          <Button
            leftIcon={
              <RefreshCw
                color={Colors.silver}
                size={18}
              />
            }
            onPress={() => void loadData()}
            title="Refresh"
            variant="secondary"
          />

          <Button
            leftIcon={
              <Edit3
                color={Colors.white}
                size={18}
              />
            }
            onPress={() =>
              navigation.navigate(
                'ApplicationCaseForm',
                {
                  clientId: data.client.id,
                  applicationCaseId:
                    data.applicationCase.id,
                }
              )
            }
            title="Edit application"
          />
        </View>
      </View>

      <Card
        padding="large"
        style={[
          styles.heroCard,
          {
            borderColor: visual.borderColor,
          },
        ]}
      >
        <View
          style={[
            styles.heroRow,
            isCompact ? styles.heroRowCompact : null,
          ]}
        >
          <View
            style={[
              styles.heroIcon,
              {
                backgroundColor:
                  visual.backgroundColor,
              },
            ]}
          >
            <visual.Icon
              color={visual.color}
              size={34}
            />
          </View>

          <View style={styles.heroContent}>
            <Text
              style={[
                styles.heroState,
                { color: visual.color },
              ]}
            >
              {visual.label}
            </Text>

            <Text style={styles.heroTitle}>
              {data.readiness
                ? `${data.readiness.readinessPercent}% pack readiness`
                : 'Readiness has not been calculated'}
            </Text>

            <Text style={styles.heroText}>
              {visual.description}
            </Text>
          </View>

          <View style={styles.statusColumn}>
            <Text style={styles.statusLabel}>
              CASE STATUS
            </Text>

            <Text style={styles.statusValue}>
              {getApplicationCaseStatusLabel(
                data.applicationCase.status
              )}
            </Text>

            <Text style={styles.statusProgress}>
              {data.applicationCase.progress_percent}%
              workflow progress
            </Text>
          </View>
        </View>
      </Card>

      <View style={styles.summaryGrid}>
        <MetricCard
          icon={ClipboardCheck}
          label="Pack items"
          value={counts.total}
        />

        <MetricCard
          icon={CheckCircle2}
          label="Complete"
          value={counts.complete}
        />

        <MetricCard
          icon={TriangleAlert}
          label="Missing or expired"
          value={counts.missing}
        />

        <MetricCard
          icon={CircleAlert}
          label="Awaiting verification"
          value={counts.unverified}
        />
      </View>

      <View
        style={[
          styles.workspaceGrid,
          isCompact
            ? styles.workspaceGridCompact
            : null,
        ]}
      >
        <View style={styles.mainColumn}>
          <Card
            subtitle="Everything connected to this application in one place."
            title="Application overview"
          >
            <View style={styles.detailGrid}>
              <Detail
                icon={UserRound}
                label="Applicant"
                value={`${data.client.first_name} ${data.client.surname}`}
              />

              <Detail
                icon={FileText}
                label="Application"
                value={getApplicationCaseTypeLabel(
                  data.applicationCase
                    .application_type
                )}
              />

              <Detail
                icon={
                  competencyApplication
                    ? ShieldCheck
                    : Target
                }
                label={
                  competencyApplication
                    ? 'Competency'
                    : 'Firearm'
                }
                value={secondarySubject}
              />

              <Detail
                icon={ClipboardCheck}
                label="Licence section"
                value={
                  data.applicationCase
                    .licence_section
                    ? `Section ${data.applicationCase.licence_section}`
                    : 'Not applicable'
                }
              />

              <Detail
                icon={FileCheck2}
                label="Acquisition source"
                value={formatSource(
                  data.applicationCase
                    .acquisition_source
                )}
              />

              <Detail
                icon={UserRound}
                label="Supplier"
                value={
                  data.applicationCase
                    .supplier_name ??
                  'Not applicable'
                }
              />
            </View>

            {data.applicationCase
              .motivation_summary ? (
              <View style={styles.notesBlock}>
                <Text style={styles.notesLabel}>
                  Motivation purpose
                </Text>

                <Text style={styles.notesText}>
                  {
                    data.applicationCase
                      .motivation_summary
                  }
                </Text>
              </View>
            ) : null}
          </Card>

          <Card
            subtitle="Required and recommended items are assembled in submission order."
            title="Pack checklist"
          >
            {!data.readiness ? (
              <View style={styles.emptyState}>
                <CircleAlert
                  color={Colors.warning}
                  size={36}
                />

                <Text style={styles.emptyTitle}>
                  No readiness result
                </Text>

                <Text style={styles.emptyText}>
                  Open the readiness engine to calculate
                  this application’s document
                  requirements.
                </Text>
              </View>
            ) : (
              <View style={styles.checklist}>
                {data.readiness.requirements.map(
                  (requirement, index) => (
                    <RequirementRow
                      index={index + 1}
                      key={requirement.key}
                      onPress={() => {
                        if (
                          requirement.documentType
                        ) {
                          navigation.navigate(
                            'DocumentLibrary',
                            {
                              clientId:
                                data.client.id,
                              applicationCaseId:
                                data.applicationCase.id,
                              documentType:
                                requirement.documentType,
                              openUpload:
                                requirement.state !==
                                'PRESENT',
                            }
                          );
                        }
                      }}
                      requirement={requirement}
                    />
                  )
                )}
              </View>
            )}
          </Card>
        </View>

        <View style={styles.sideColumn}>
          <Card
            subtitle="Move through the complete application workflow."
            title="Workspace actions"
          >
            <View style={styles.actionStack}>
              <WorkspaceAction
                description="Review every requirement and its current state."
                icon={ClipboardCheck}
                label="Open readiness"
                onPress={() =>
                  navigation.navigate(
                    'ApplicationReadiness',
                    {
                      clientId: data.client.id,
                    }
                  )
                }
              />

              <WorkspaceAction
                description="Upload and manage applicant and case documents."
                icon={FolderOpen}
                label="Document library"
                onPress={() =>
                  navigation.navigate(
                    'DocumentLibrary',
                    {
                      clientId: data.client.id,
                      applicationCaseId:
                        data.applicationCase.id,
                    }
                  )
                }
              />

              <WorkspaceAction
                description="Find motivations, research and supporting material."
                icon={BookOpen}
                label="Reference library"
                onPress={() =>
                  navigation.navigate(
                    'ReferenceLibrary'
                  )
                }
              />

              <WorkspaceAction
                description="Update application details, status and submission tracking."
                icon={Edit3}
                label="Edit application"
                onPress={() =>
                  navigation.navigate(
                    'ApplicationCaseForm',
                    {
                      clientId: data.client.id,
                      applicationCaseId:
                        data.applicationCase.id,
                    }
                  )
                }
              />
            </View>
          </Card>

          <Card
            subtitle="LicenceGuard will only mark the pack ready when all blocking items are complete."
            title="Pack decision"
          >
            <View
              style={[
                styles.decisionBox,
                {
                  borderColor:
                    visual.borderColor,
                  backgroundColor:
                    visual.backgroundColor,
                },
              ]}
            >
              <visual.Icon
                color={visual.color}
                size={28}
              />

              <Text
                style={[
                  styles.decisionTitle,
                  { color: visual.color },
                ]}
              >
                {visual.label}
              </Text>

              <Text style={styles.decisionText}>
                {visual.description}
              </Text>
            </View>

            {counts.missing > 0 ? (
              <Button
                leftIcon={
                  <Upload
                    color={Colors.white}
                    size={18}
                  />
                }
                onPress={() => {
                  const firstMissing =
                    data.readiness?.requirements.find(
                      (item) =>
                        (item.state ===
                          'MISSING' ||
                          item.state ===
                            'EXPIRED') &&
                        item.documentType
                    );

                  navigation.navigate(
                    'DocumentLibrary',
                    {
                      clientId: data.client.id,
                      applicationCaseId:
                        data.applicationCase.id,
                      documentType:
                        firstMissing?.documentType ??
                        undefined,
                      openUpload: true,
                    }
                  );
                }}
                style={styles.decisionButton}
                title="Add missing document"
              />
            ) : null}
          </Card>
        </View>
      </View>
    </Screen>
  );
}

function RequirementRow({
  index,
  onPress,
  requirement,
}: {
  index: number;
  onPress: () => void;
  requirement: RequirementItem;
}) {
  const visual = getRequirementVisual(
    requirement.state
  );

  return (
    <Pressable
      disabled={!requirement.documentType}
      onPress={onPress}
      style={({ pressed }) => [
        styles.requirementRow,
        pressed
          ? styles.requirementRowPressed
          : null,
      ]}
    >
      <View style={styles.requirementOrder}>
        <Text style={styles.requirementOrderText}>
          {index}
        </Text>
      </View>

      <View style={styles.requirementContent}>
        <View style={styles.requirementTitleRow}>
          <Text style={styles.requirementTitle}>
            {requirement.label}
          </Text>

          <Text
            style={[
              styles.requirementType,
              requirement.required
                ? styles.requiredText
                : null,
            ]}
          >
            {requirement.required
              ? 'Required'
              : 'Recommended'}
          </Text>
        </View>

        <Text style={styles.requirementDetail}>
          {requirement.detail}
        </Text>
      </View>

      <View
        style={[
          styles.requirementState,
          {
            borderColor: visual.color,
            backgroundColor:
              visual.backgroundColor,
          },
        ]}
      >
        <visual.Icon
          color={visual.color}
          size={16}
        />

        <Text
          style={[
            styles.requirementStateText,
            { color: visual.color },
          ]}
        >
          {visual.label}
        </Text>
      </View>
    </Pressable>
  );
}

function WorkspaceAction({
  description,
  icon: Icon,
  label,
  onPress,
}: {
  description: string;
  icon: typeof FileText;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.workspaceAction,
        pressed
          ? styles.workspaceActionPressed
          : null,
      ]}
    >
      <View style={styles.workspaceActionIcon}>
        <Icon
          color={Colors.primary}
          size={21}
        />
      </View>

      <View style={styles.workspaceActionContent}>
        <Text style={styles.workspaceActionTitle}>
          {label}
        </Text>

        <Text style={styles.workspaceActionText}>
          {description}
        </Text>
      </View>
    </Pressable>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof FileText;
  label: string;
  value: number;
}) {
  return (
    <Card style={styles.metricCard}>
      <Icon
        color={Colors.primary}
        size={22}
      />

      <Text style={styles.metricValue}>
        {value}
      </Text>

      <Text style={styles.metricLabel}>
        {label}
      </Text>
    </Card>
  );
}

function Detail({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof FileText;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.detail}>
      <Icon
        color={Colors.primary}
        size={19}
      />

      <View style={styles.detailContent}>
        <Text style={styles.detailLabel}>
          {label}
        </Text>

        <Text style={styles.detailValue}>
          {value}
        </Text>
      </View>
    </View>
  );
}

function getReadinessVisual(
  state:
    | 'READY'
    | 'ACTION_REQUIRED'
    | 'BLOCKED'
    | 'NOT_STARTED'
) {
  switch (state) {
    case 'READY':
      return {
        label: 'Pack ready',
        description:
          'All blocking requirements are complete. The application pack can proceed to final review and submission preparation.',
        color: Colors.success,
        borderColor: Colors.success,
        backgroundColor:
          'rgba(40, 199, 111, 0.10)',
        Icon: CheckCircle2,
      };

    case 'ACTION_REQUIRED':
      return {
        label: 'Verification required',
        description:
          'The documents are present, but one or more items still require verification before the pack is submission-ready.',
        color: Colors.warning,
        borderColor: Colors.warning,
        backgroundColor:
          'rgba(255, 193, 7, 0.10)',
        Icon: CircleAlert,
      };

    case 'BLOCKED':
      return {
        label: 'Pack blocked',
        description:
          'One or more required documents are missing or expired. Resolve the blocking items before generating the final pack.',
        color: Colors.danger,
        borderColor: Colors.danger,
        backgroundColor:
          'rgba(229, 57, 53, 0.10)',
        Icon: TriangleAlert,
      };

    default:
      return {
        label: 'Not yet assessed',
        description:
          'Run the readiness engine to determine the complete application pack requirements.',
        color: Colors.silver,
        borderColor: Colors.borderStrong,
        backgroundColor: Colors.surfaceSoft,
        Icon: ClipboardCheck,
      };
  }
}

function getRequirementVisual(
  state: RequirementItem['state']
) {
  switch (state) {
    case 'PRESENT':
      return {
        label: 'Complete',
        color: Colors.success,
        backgroundColor:
          'rgba(40, 199, 111, 0.10)',
        Icon: CheckCircle2,
      };

    case 'UNVERIFIED':
      return {
        label: 'Verify',
        color: Colors.warning,
        backgroundColor:
          'rgba(255, 193, 7, 0.10)',
        Icon: CircleAlert,
      };

    case 'EXPIRED':
      return {
        label: 'Expired',
        color: Colors.danger,
        backgroundColor:
          'rgba(229, 57, 53, 0.10)',
        Icon: TriangleAlert,
      };

    case 'NOT_APPLICABLE':
      return {
        label: 'N/A',
        color: Colors.silverDark,
        backgroundColor: Colors.surfaceSoft,
        Icon: FileText,
      };

    default:
      return {
        label: 'Missing',
        color: Colors.danger,
        backgroundColor:
          'rgba(229, 57, 53, 0.10)',
        Icon: TriangleAlert,
      };
  }
}

function formatSource(
  value:
    | 'DEALER'
    | 'PRIVATE_SELLER'
    | 'EXISTING_FIREARM'
    | 'NOT_APPLICABLE'
): string {
  switch (value) {
    case 'DEALER':
      return 'Dealer purchase';
    case 'PRIVATE_SELLER':
      return 'Private sale';
    case 'EXISTING_FIREARM':
      return 'Existing firearm';
    default:
      return 'Not applicable';
  }
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
  },
  headerActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
  },
  heroCard: {
    borderWidth: 1,
    marginBottom: Spacing.lg,
  },
  heroRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.lg,
  },
  heroRowCompact: {
    alignItems: 'stretch',
    flexDirection: 'column',
  },
  heroIcon: {
    alignItems: 'center',
    borderRadius: Radius.lg,
    height: 68,
    justifyContent: 'center',
    width: 68,
  },
  heroContent: {
    flex: 1,
  },
  heroState: {
    ...Typography.eyebrow,
  },
  heroTitle: {
    ...Typography.sectionTitle,
    color: Colors.white,
    marginTop: Spacing.xxs,
  },
  heroText: {
    ...Typography.body,
    color: Colors.textMuted,
    marginTop: Spacing.xs,
  },
  statusColumn: {
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    borderWidth: 1,
    minWidth: 220,
    padding: Spacing.md,
  },
  statusLabel: {
    ...Typography.label,
    color: Colors.textMuted,
  },
  statusValue: {
    ...Typography.bodyStrong,
    color: Colors.white,
    marginTop: Spacing.xxs,
  },
  statusProgress: {
    ...Typography.caption,
    color: Colors.textMuted,
    marginTop: Spacing.xxs,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  metricCard: {
    flexGrow: 1,
    minWidth: 170,
  },
  metricValue: {
    ...Typography.metric,
    color: Colors.white,
    marginTop: Spacing.md,
  },
  metricLabel: {
    ...Typography.caption,
    color: Colors.textMuted,
    marginTop: Spacing.xxs,
  },
  workspaceGrid: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: Spacing.lg,
  },
  workspaceGridCompact: {
    flexDirection: 'column',
  },
  mainColumn: {
    flex: 1.7,
    gap: Spacing.lg,
    minWidth: 0,
  },
  sideColumn: {
    flex: 1,
    gap: Spacing.lg,
    minWidth: 300,
  },
  detailGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
  },
  detail: {
    alignItems: 'flex-start',
    backgroundColor: Colors.surfaceRaised,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    flexGrow: 1,
    gap: Spacing.sm,
    minWidth: 220,
    padding: Spacing.md,
  },
  detailContent: {
    flex: 1,
  },
  detailLabel: {
    ...Typography.label,
    color: Colors.textMuted,
  },
  detailValue: {
    ...Typography.bodyStrong,
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
    marginTop: Spacing.xs,
  },
  checklist: {
    gap: Spacing.sm,
  },
  requirementRow: {
    alignItems: 'center',
    backgroundColor: Colors.surfaceRaised,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: Spacing.md,
    padding: Spacing.md,
  },
  requirementRowPressed: {
    opacity: 0.82,
  },
  requirementOrder: {
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.pill,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  requirementOrderText: {
    ...Typography.caption,
    color: Colors.silver,
    fontWeight: '800',
  },
  requirementContent: {
    flex: 1,
  },
  requirementTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  requirementTitle: {
    ...Typography.bodyStrong,
    color: Colors.white,
  },
  requirementType: {
    ...Typography.caption,
    color: Colors.textMuted,
  },
  requiredText: {
    color: Colors.primary,
  },
  requirementDetail: {
    ...Typography.caption,
    color: Colors.textMuted,
    marginTop: Spacing.xxs,
  },
  requirementState: {
    alignItems: 'center',
    borderRadius: Radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  requirementStateText: {
    ...Typography.caption,
    fontWeight: '800',
  },
  actionStack: {
    gap: Spacing.sm,
  },
  workspaceAction: {
    alignItems: 'center',
    backgroundColor: Colors.surfaceRaised,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: Spacing.md,
    padding: Spacing.md,
  },
  workspaceActionPressed: {
    opacity: 0.82,
  },
  workspaceActionIcon: {
    alignItems: 'center',
    backgroundColor: Colors.primarySoft,
    borderRadius: Radius.md,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  workspaceActionContent: {
    flex: 1,
  },
  workspaceActionTitle: {
    ...Typography.bodyStrong,
    color: Colors.white,
  },
  workspaceActionText: {
    ...Typography.caption,
    color: Colors.textMuted,
    marginTop: Spacing.xxs,
  },
  decisionBox: {
    alignItems: 'center',
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.lg,
  },
  decisionTitle: {
    ...Typography.cardTitle,
    marginTop: Spacing.sm,
  },
  decisionText: {
    ...Typography.body,
    color: Colors.textMuted,
    marginTop: Spacing.xs,
    textAlign: 'center',
  },
  decisionButton: {
    marginTop: Spacing.md,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: Spacing.xxl,
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
});