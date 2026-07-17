import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  FileCheck2,
  FolderOpen,
  ShieldCheck,
} from 'lucide-react-native';

import Button from '../components/Button';
import Card from '../components/Card';
import Screen from '../components/Screen';
import { getClientApplicationReadiness } from '../services/applicationReadinessService';
import { Colors } from '../theme/colors';
import { Radius } from '../theme/radius';
import { Spacing } from '../theme/spacing';
import { Typography } from '../theme/typography';
import type {
  ApplicationCaseReadiness,
  ApplicationReadinessState,
  ClientApplicationReadiness,
  RequirementState,
} from '../types/applicationReadiness';
import { getApplicationCaseTypeLabel } from '../types/applicationCase';
import type { RootStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<
  RootStackParamList,
  'ApplicationReadiness'
>;

export default function ApplicationReadinessScreen({
  navigation,
  route,
}: Props) {
  const [data, setData] =
    useState<ClientApplicationReadiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedCaseId, setExpandedCaseId] =
    useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);

    try {
      const result = await getClientApplicationReadiness(
        route.params.clientId
      );
      setData(result);
      setExpandedCaseId((current) =>
        current ?? result.cases[0]?.caseId ?? null
      );
    } catch (error) {
      Alert.alert(
        'Unable to calculate readiness',
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

  if (loading || !data) {
    return (
      <Screen scroll={false}>
        <View style={styles.loadingState}>
          <ActivityIndicator
            color={Colors.primary}
            size="large"
          />
          <Text style={styles.loadingText}>
            Calculating application readiness...
          </Text>
        </View>
      </Screen>
    );
  }

  const visual = getStateVisual(data.state);

  return (
    <Screen maxWidth={1120}>
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <Text style={styles.eyebrow}>
            APPLICATION READINESS ENGINE
          </Text>
          <Text style={styles.title}>
            {data.clientName}
          </Text>
          <Text style={styles.subtitle}>
            LicenceGuard checks every open application
            against the client, competency, firearm,
            licence and document records already stored.
          </Text>
        </View>

        <View style={styles.headerActions}>
          <Button
            leftIcon={
              <FolderOpen
                color={Colors.silver}
                size={18}
              />
            }
            onPress={() =>
              navigation.navigate('DocumentLibrary', {
                clientId: data.clientId,
              })
            }
            title="Documents"
            variant="secondary"
          />

          <Button
            leftIcon={
              <FileCheck2
                color={Colors.white}
                size={18}
              />
            }
            onPress={() =>
              navigation.navigate('ApplicationCases', {
                clientId: data.clientId,
              })
            }
            title="Application cases"
          />
        </View>
      </View>

      <Card
        padding="large"
        style={[
          styles.overviewCard,
          { borderColor: visual.borderColor },
        ]}
      >
        <View style={styles.overviewRow}>
          <View style={styles.overviewIdentity}>
            <View
              style={[
                styles.overviewIcon,
                { backgroundColor: visual.backgroundColor },
              ]}
            >
              <visual.Icon
                color={visual.color}
                size={32}
              />
            </View>

            <View style={styles.overviewText}>
              <Text style={styles.overviewEyebrow}>
                OVERALL STATUS
              </Text>
              <Text
                style={[
                  styles.overviewTitle,
                  { color: visual.color },
                ]}
              >
                {visual.label}
              </Text>
              <Text style={styles.overviewDetail}>
                {getOverallMessage(data)}
              </Text>
            </View>
          </View>

          <View style={styles.scoreBlock}>
            <Text
              style={[
                styles.score,
                { color: visual.color },
              ]}
            >
              {data.score}%
            </Text>
            <Text style={styles.scoreLabel}>
              readiness
            </Text>
          </View>
        </View>

        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              {
                width: `${data.score}%`,
                backgroundColor: visual.color,
              },
            ]}
          />
        </View>
      </Card>

      <View style={styles.summaryGrid}>
        <SummaryTile
          label="Ready"
          value={data.readyCases}
          tone="success"
        />
        <SummaryTile
          label="Action required"
          value={data.actionRequiredCases}
          tone="warning"
        />
        <SummaryTile
          label="Blocked"
          value={data.blockedCases}
          tone="danger"
        />
        <SummaryTile
          label="Open cases"
          value={data.cases.length}
          tone="neutral"
        />
      </View>

      {data.cases.length === 0 ? (
        <Card style={styles.emptyCard}>
          <FileCheck2
            color={Colors.silverDark}
            size={42}
          />
          <Text style={styles.emptyTitle}>
            No open application cases
          </Text>
          <Text style={styles.emptyText}>
            Open an application case first. The readiness
            engine will then calculate the required records
            and documents for that specific application.
          </Text>
          <Button
            onPress={() =>
              navigation.navigate('ApplicationCaseForm', {
                clientId: data.clientId,
              })
            }
            title="Open application case"
          />
        </Card>
      ) : (
        <View style={styles.caseList}>
          {data.cases.map((applicationCase) => (
            <CaseReadinessCard
              applicationCase={applicationCase}
              expanded={
                expandedCaseId === applicationCase.caseId
              }
              key={applicationCase.caseId}
              onEdit={() =>
                navigation.navigate('ApplicationCaseForm', {
                  clientId: data.clientId,
                  applicationCaseId:
                    applicationCase.caseId,
                })
              }
              onToggle={() =>
                setExpandedCaseId((current) =>
                  current === applicationCase.caseId
                    ? null
                    : applicationCase.caseId
                )
              }
            />
          ))}
        </View>
      )}
    </Screen>
  );
}

function CaseReadinessCard({
  applicationCase,
  expanded,
  onToggle,
  onEdit,
}: {
  applicationCase: ApplicationCaseReadiness;
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
}) {
  const visual = getStateVisual(applicationCase.state);

  return (
    <Card style={styles.caseCard}>
      <Pressable
        onPress={onToggle}
        style={({ pressed }) => [
          styles.caseHeader,
          pressed ? styles.pressed : null,
        ]}
      >
        <View style={styles.caseHeaderMain}>
          <View
            style={[
              styles.caseStatusIcon,
              { backgroundColor: visual.backgroundColor },
            ]}
          >
            <visual.Icon
              color={visual.color}
              size={22}
            />
          </View>

          <View style={styles.caseIdentity}>
            <Text style={styles.caseType}>
              {getApplicationCaseTypeLabel(
                applicationCase.applicationType
              )}
            </Text>
            <Text style={styles.caseSubject}>
              {applicationCase.subject}
            </Text>
            <Text style={styles.caseMeta}>
              {applicationCase.missingCount} missing ·{' '}
              {applicationCase.warningCount} awaiting
              verification
            </Text>
          </View>
        </View>

        <View style={styles.caseHeaderRight}>
          <View
            style={[
              styles.stateBadge,
              {
                borderColor: visual.borderColor,
                backgroundColor: visual.backgroundColor,
              },
            ]}
          >
            <Text
              style={[
                styles.stateBadgeText,
                { color: visual.color },
              ]}
            >
              {visual.label}
            </Text>
          </View>
          <Text style={styles.caseScore}>
            {applicationCase.score}%
          </Text>
          <ChevronRight
            color={Colors.silverDark}
            size={20}
            style={
              expanded
                ? styles.chevronExpanded
                : undefined
            }
          />
        </View>
      </Pressable>

      {expanded ? (
        <View style={styles.requirementSection}>
          <View style={styles.requirementHeader}>
            <View>
              <Text style={styles.requirementTitle}>
                Required application items
              </Text>
              <Text style={styles.requirementSubtitle}>
                Proof of address is not treated as a default
                requirement.
              </Text>
            </View>

            <Button
              onPress={onEdit}
              title="Edit case"
              variant="secondary"
            />
          </View>

          <View style={styles.requirementList}>
            {applicationCase.requirements.map(
              (requirement) => (
                <RequirementRow
                  key={requirement.key}
                  label={requirement.label}
                  detail={requirement.detail}
                  required={requirement.required}
                  state={requirement.state}
                />
              )
            )}
          </View>

          <View
            style={[
              styles.generateState,
              applicationCase.readyToGenerate
                ? styles.generateReady
                : styles.generateBlocked,
            ]}
          >
            {applicationCase.readyToGenerate ? (
              <CheckCircle2
                color={Colors.success}
                size={23}
              />
            ) : (
              <CircleAlert
                color={Colors.warning}
                size={23}
              />
            )}
            <View style={styles.generateContent}>
              <Text style={styles.generateTitle}>
                {applicationCase.readyToGenerate
                  ? 'Ready for pack generation'
                  : 'Not ready for pack generation'}
              </Text>
              <Text style={styles.generateText}>
                {applicationCase.readyToGenerate
                  ? 'All required items are present and verified.'
                  : 'Resolve the missing, expired or unverified required items first.'}
              </Text>
            </View>
          </View>
        </View>
      ) : null}
    </Card>
  );
}

function RequirementRow({
  label,
  detail,
  state,
  required,
}: {
  label: string;
  detail: string;
  state: RequirementState;
  required: boolean;
}) {
  const visual = getRequirementVisual(state);

  return (
    <View style={styles.requirementRow}>
      <visual.Icon
        color={visual.color}
        size={20}
      />
      <View style={styles.requirementContent}>
        <View style={styles.requirementLabelRow}>
          <Text style={styles.requirementLabel}>
            {label}
          </Text>
          {!required ? (
            <Text style={styles.optionalLabel}>
              Optional
            </Text>
          ) : null}
        </View>
        <Text style={styles.requirementDetail}>
          {detail}
        </Text>
      </View>
      <Text
        style={[
          styles.requirementState,
          { color: visual.color },
        ]}
      >
        {visual.label}
      </Text>
    </View>
  );
}

function SummaryTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'success' | 'warning' | 'danger' | 'neutral';
}) {
  const color =
    tone === 'success'
      ? Colors.success
      : tone === 'warning'
        ? Colors.warning
        : tone === 'danger'
          ? Colors.danger
          : Colors.silver;

  return (
    <Card style={styles.summaryTile}>
      <Text style={[styles.summaryValue, { color }]}> 
        {value}
      </Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </Card>
  );
}

function getOverallMessage(
  data: ClientApplicationReadiness
): string {
  switch (data.state) {
    case 'READY':
      return 'Every open application case is ready for document-pack generation.';
    case 'ACTION_REQUIRED':
      return 'Required records are present, but one or more items still require verification.';
    case 'BLOCKED':
      return 'One or more open cases are missing required records or documents.';
    case 'NO_CASES':
      return 'Open an application case to calculate its readiness.';
  }
}

function getStateVisual(state: ApplicationReadinessState) {
  switch (state) {
    case 'READY':
      return {
        label: 'READY',
        color: Colors.success,
        borderColor: Colors.success,
        backgroundColor: 'rgba(40, 199, 111, 0.12)',
        Icon: ShieldCheck,
      };
    case 'ACTION_REQUIRED':
      return {
        label: 'ACTION REQUIRED',
        color: Colors.warning,
        borderColor: Colors.warning,
        backgroundColor: 'rgba(255, 193, 7, 0.12)',
        Icon: AlertTriangle,
      };
    case 'BLOCKED':
      return {
        label: 'BLOCKED',
        color: Colors.danger,
        borderColor: Colors.danger,
        backgroundColor: 'rgba(229, 57, 53, 0.12)',
        Icon: CircleAlert,
      };
    case 'NO_CASES':
      return {
        label: 'NO OPEN CASES',
        color: Colors.silver,
        borderColor: Colors.borderStrong,
        backgroundColor: Colors.surfaceSoft,
        Icon: FileCheck2,
      };
  }
}

function getRequirementVisual(state: RequirementState) {
  switch (state) {
    case 'SATISFIED':
      return { label: 'Complete', color: Colors.success, Icon: CheckCircle2 };
    case 'UNVERIFIED':
      return { label: 'Verify', color: Colors.warning, Icon: AlertTriangle };
    case 'EXPIRED':
      return { label: 'Expired', color: Colors.danger, Icon: CircleAlert };
    case 'MISSING':
      return { label: 'Missing', color: Colors.danger, Icon: CircleAlert };
    case 'NOT_APPLICABLE':
      return { label: 'N/A', color: Colors.silverDark, Icon: FileCheck2 };
  }
}

const styles = StyleSheet.create({
  loadingState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.lg },
  loadingText: { ...Typography.body, color: Colors.textMuted },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: Spacing.xl, marginBottom: Spacing.xl, flexWrap: 'wrap' },
  headerContent: { flex: 1, minWidth: 280 },
  eyebrow: { ...Typography.caption, color: Colors.primary, fontWeight: '900', letterSpacing: 1.2 },
  title: { ...Typography.pageTitle, color: Colors.white, marginTop: Spacing.xs },
  subtitle: { ...Typography.body, color: Colors.textMuted, marginTop: Spacing.sm, maxWidth: 720 },
  headerActions: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
  overviewCard: { marginBottom: Spacing.lg, borderWidth: 1 },
  overviewRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.xl, flexWrap: 'wrap' },
  overviewIdentity: { flexDirection: 'row', alignItems: 'center', gap: Spacing.lg, flex: 1, minWidth: 280 },
  overviewIcon: { width: 64, height: 64, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center' },
  overviewText: { flex: 1 },
  overviewEyebrow: { ...Typography.caption, color: Colors.textMuted, fontWeight: '800' },
  overviewTitle: { ...Typography.sectionTitle, marginTop: 2 },
  overviewDetail: { ...Typography.body, color: Colors.textMuted, marginTop: Spacing.xs },
  scoreBlock: { alignItems: 'flex-end' },
  score: { ...Typography.pageTitle, fontSize: 42 },
  scoreLabel: { ...Typography.caption, color: Colors.textMuted },
  progressTrack: { height: 8, backgroundColor: Colors.surfaceSoft, borderRadius: Radius.pill, overflow: 'hidden', marginTop: Spacing.lg },
  progressFill: { height: '100%', borderRadius: Radius.pill },
  summaryGrid: { flexDirection: 'row', gap: Spacing.md, flexWrap: 'wrap', marginBottom: Spacing.lg },
  summaryTile: { minWidth: 150, flex: 1 },
  summaryValue: { ...Typography.sectionTitle, fontWeight: '900' },
  summaryLabel: { ...Typography.caption, color: Colors.textMuted, marginTop: Spacing.xs },
  emptyCard: { alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.xxl },
  emptyTitle: { ...Typography.cardTitle, color: Colors.white },
  emptyText: { ...Typography.body, color: Colors.textMuted, textAlign: 'center', maxWidth: 620 },
  caseList: { gap: Spacing.lg },
  caseCard: { padding: 0, overflow: 'hidden' },
  caseHeader: { padding: Spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.lg },
  pressed: { opacity: 0.8 },
  caseHeaderMain: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, flex: 1 },
  caseStatusIcon: { width: 44, height: 44, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center' },
  caseIdentity: { flex: 1 },
  caseType: { ...Typography.cardTitle, color: Colors.white },
  caseSubject: { ...Typography.body, color: Colors.silver, marginTop: 2 },
  caseMeta: { ...Typography.caption, color: Colors.textMuted, marginTop: Spacing.xs },
  caseHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  stateBadge: { borderWidth: 1, borderRadius: Radius.pill, paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs },
  stateBadgeText: { ...Typography.caption, fontWeight: '900' },
  caseScore: { ...Typography.cardTitle, color: Colors.white, minWidth: 48, textAlign: 'right' },
  chevronExpanded: { transform: [{ rotate: '90deg' }] },
  requirementSection: { borderTopWidth: 1, borderTopColor: Colors.border, padding: Spacing.lg, backgroundColor: Colors.surfaceRaised },
  requirementHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.lg, marginBottom: Spacing.lg, flexWrap: 'wrap' },
  requirementTitle: { ...Typography.cardTitle, color: Colors.white },
  requirementSubtitle: { ...Typography.caption, color: Colors.textMuted, marginTop: 2 },
  requirementList: { gap: Spacing.sm },
  requirementRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, padding: Spacing.md, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.lg },
  requirementContent: { flex: 1 },
  requirementLabelRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap' },
  requirementLabel: { ...Typography.body, color: Colors.white, fontWeight: '800' },
  optionalLabel: { ...Typography.caption, color: Colors.info, borderWidth: 1, borderColor: Colors.info, borderRadius: Radius.pill, paddingHorizontal: Spacing.sm, paddingVertical: 1 },
  requirementDetail: { ...Typography.caption, color: Colors.textMuted, marginTop: 3 },
  requirementState: { ...Typography.caption, fontWeight: '900' },
  generateState: { marginTop: Spacing.lg, borderWidth: 1, borderRadius: Radius.lg, padding: Spacing.md, flexDirection: 'row', gap: Spacing.md, alignItems: 'center' },
  generateReady: { borderColor: Colors.success, backgroundColor: 'rgba(40, 199, 111, 0.08)' },
  generateBlocked: { borderColor: Colors.warning, backgroundColor: 'rgba(255, 193, 7, 0.08)' },
  generateContent: { flex: 1 },
  generateTitle: { ...Typography.body, color: Colors.white, fontWeight: '800' },
  generateText: { ...Typography.caption, color: Colors.textMuted, marginTop: 2 },
});
