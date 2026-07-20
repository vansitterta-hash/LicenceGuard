import { useCallback, useEffect, useMemo, useState } from 'react';
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
  ChevronDown,
  ChevronUp,
  FileOutput,
  Pencil,
  Upload,
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
  ReadinessRequirement,
} from '../types/applicationReadiness';
import { getApplicationCaseTypeLabel } from '../types/applicationCase';
import type { RootStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'ApplicationReadiness'>;

export default function ApplicationReadinessScreen({ navigation, route }: Props) {
  const [data, setData] = useState<Awaited<ReturnType<typeof getClientApplicationReadiness>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCompleted, setShowCompleted] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      setData(await getClientApplicationReadiness(route.params.clientId));
    } catch (error) {
      Alert.alert(
        'Unable to check the application',
        error instanceof Error ? error.message : 'An unknown error occurred.'
      );
    } finally {
      setLoading(false);
    }
  }, [route.params.clientId]);

  useEffect(() => {
    void loadData();
    return navigation.addListener('focus', () => void loadData());
  }, [loadData, navigation]);

  const applicationCase = useMemo(() => {
    if (!data) return null;
    return data.cases.find((item) => item.caseId === route.params.applicationCaseId)
      ?? data.cases[0]
      ?? null;
  }, [data, route.params.applicationCaseId]);

  if (loading || !data) {
    return (
      <Screen scroll={false}>
        <View style={styles.loading}>
          <ActivityIndicator color={Colors.primary} size="large" />
          <Text style={styles.muted}>Checking what is ready and what is still needed...</Text>
        </View>
      </Screen>
    );
  }

  if (!applicationCase) {
    return (
      <Screen maxWidth={820}>
        <Card style={styles.emptyCard}>
          <Text style={styles.title}>No application found</Text>
          <Text style={styles.muted}>Return to the client and choose the task you want LicenceGuard to prepare.</Text>
          <Button title="Back to client" onPress={() => navigation.navigate('ClientProfile', { clientId: route.params.clientId })} />
        </Card>
      </Screen>
    );
  }

  const outstanding = applicationCase.requirements.filter(
    (item) => item.required && item.state !== 'SATISFIED' && item.state !== 'NOT_APPLICABLE'
  );
  const completed = applicationCase.requirements.filter(
    (item) => item.state === 'SATISFIED'
  );
  const ready = applicationCase.readyToGenerate;

  return (
    <Screen maxWidth={920}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>APPLICATION CHECK</Text>
        <Text style={styles.title}>{getApplicationCaseTypeLabel(applicationCase.applicationType)}</Text>
        <Text style={styles.subject}>{applicationCase.subject}</Text>
        <Text style={styles.subtitle}>
          LicenceGuard has checked the client, firearm, competency, licence and uploaded documents automatically.
        </Text>
      </View>

      <Card padding="large" style={[styles.statusCard, ready ? styles.readyBorder : styles.actionBorder]}>
        <View style={styles.statusRow}>
          <View style={[styles.statusIcon, ready ? styles.readyBackground : styles.actionBackground]}>
            {ready ? (
              <CheckCircle2 color={Colors.success} size={34} />
            ) : (
              <AlertTriangle color={Colors.warning} size={34} />
            )}
          </View>
          <View style={styles.statusText}>
            <Text style={[styles.statusTitle, { color: ready ? Colors.success : Colors.warning }]}>
              {ready ? 'Ready to compile' : 'A few items still need attention'}
            </Text>
            <Text style={styles.statusDetail}>
              {ready
                ? 'Everything required for this application is available.'
                : `${outstanding.length} required ${outstanding.length === 1 ? 'item is' : 'items are'} still missing, expired or awaiting confirmation.`}
            </Text>
          </View>
        </View>
      </Card>

      {!ready ? (
        <Card title="Do this next" subtitle="Only the outstanding items are shown. Tap an item to upload or replace it.">
          <View style={styles.list}>
            {outstanding.map((requirement) => (
              <RequirementRow
                key={requirement.key}
                requirement={requirement}
                onPress={() => {
                  if (requirement.documentType) {
                    navigation.navigate('DocumentLibrary', {
                      clientId: route.params.clientId,
                      applicationCaseId: applicationCase.caseId,
                      documentType: requirement.documentType,
                      openUpload: true,
                    });
                    return;
                  }

                  navigation.navigate('ApplicationCaseForm', {
                    clientId: route.params.clientId,
                    applicationCaseId: applicationCase.caseId,
                  });
                }}
              />
            ))}
          </View>
        </Card>
      ) : null}

      <View style={styles.actions}>
        <Button
          leftIcon={<FileOutput color={Colors.white} size={19} />}
          title="Compile Application Pack"
          size="large"
          fullWidth
          disabled={!ready}
          onPress={() => navigation.navigate('ApplicationPackGenerator', {
            clientId: route.params.clientId,
            applicationCaseId: applicationCase.caseId,
          })}
        />
        <Button
          leftIcon={<Pencil color={Colors.silver} size={18} />}
          title="Edit application details"
          variant="secondary"
          onPress={() => navigation.navigate('ApplicationCaseForm', {
            clientId: route.params.clientId,
            applicationCaseId: applicationCase.caseId,
          })}
        />
      </View>

      {completed.length > 0 ? (
        <Card padding="small">
          <Pressable
            onPress={() => setShowCompleted((current) => !current)}
            style={({ pressed }) => [styles.completedHeader, pressed ? styles.pressed : null]}
          >
            <View style={styles.completedTitleRow}>
              <CheckCircle2 color={Colors.success} size={18} />
              <Text style={styles.completedTitle}>{completed.length} completed items</Text>
            </View>
            {showCompleted ? <ChevronUp color={Colors.silverDark} size={18} /> : <ChevronDown color={Colors.silverDark} size={18} />}
          </Pressable>
          {showCompleted ? (
            <View style={styles.completedList}>
              {completed.map((item) => (
                <View key={item.key} style={styles.completedRow}>
                  <CheckCircle2 color={Colors.success} size={16} />
                  <Text style={styles.completedLabel}>{item.label}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </Card>
      ) : null}
    </Screen>
  );
}

function RequirementRow({ requirement, onPress }: { requirement: ReadinessRequirement; onPress: () => void }) {
  const stateLabel = requirement.state === 'EXPIRED'
    ? 'Expired'
    : requirement.state === 'UNVERIFIED'
      ? 'Confirm'
      : 'Missing';

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.requirement, pressed ? styles.pressed : null]}>
      <View style={styles.requirementMain}>
        <View style={styles.requirementIcon}>
          <Upload color={Colors.warning} size={19} />
        </View>
        <View style={styles.requirementText}>
          <Text style={styles.requirementLabel}>{requirement.label}</Text>
          <Text style={styles.requirementDetail}>{requirement.detail}</Text>
        </View>
      </View>
      <Text style={styles.requirementState}>{stateLabel}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  loading: { alignItems: 'center', flex: 1, justifyContent: 'center', gap: Spacing.md },
  muted: { ...Typography.body, color: Colors.textMuted, textAlign: 'center' },
  header: { marginBottom: Spacing.xl },
  eyebrow: { ...Typography.eyebrow, color: Colors.primaryLight, marginBottom: Spacing.xs },
  title: { ...Typography.pageTitle, color: Colors.text },
  subject: { ...Typography.cardTitle, color: Colors.silver, marginTop: Spacing.xs },
  subtitle: { ...Typography.body, color: Colors.textMuted, marginTop: Spacing.sm, maxWidth: 720 },
  emptyCard: { gap: Spacing.lg },
  statusCard: { marginBottom: Spacing.lg },
  readyBorder: { borderColor: Colors.success },
  actionBorder: { borderColor: Colors.warning },
  statusRow: { alignItems: 'center', flexDirection: 'row', gap: Spacing.lg },
  statusIcon: { alignItems: 'center', borderRadius: Radius.xl, height: 66, justifyContent: 'center', width: 66 },
  readyBackground: { backgroundColor: 'rgba(40,199,111,0.12)' },
  actionBackground: { backgroundColor: 'rgba(223,174,43,0.12)' },
  statusText: { flex: 1 },
  statusTitle: { ...Typography.sectionTitle },
  statusDetail: { ...Typography.body, color: Colors.textMuted, marginTop: Spacing.xs },
  list: { gap: Spacing.sm },
  requirement: { alignItems: 'center', backgroundColor: Colors.surfaceRaised, borderColor: Colors.border, borderRadius: Radius.lg, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', padding: Spacing.md },
  requirementMain: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: Spacing.md },
  requirementIcon: { alignItems: 'center', backgroundColor: Colors.surfaceSoft, borderRadius: Radius.md, height: 42, justifyContent: 'center', width: 42 },
  requirementText: { flex: 1 },
  requirementLabel: { ...Typography.bodyStrong, color: Colors.text },
  requirementDetail: { ...Typography.caption, color: Colors.textMuted, marginTop: Spacing.xxs },
  requirementState: { ...Typography.caption, color: Colors.warning, marginLeft: Spacing.md },
  actions: { gap: Spacing.md, marginVertical: Spacing.xl },
  completedHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', padding: Spacing.sm },
  completedTitleRow: { alignItems: 'center', flexDirection: 'row', gap: Spacing.sm },
  completedTitle: { ...Typography.bodyStrong, color: Colors.silver },
  completedList: { borderTopColor: Colors.border, borderTopWidth: 1, gap: Spacing.sm, marginTop: Spacing.sm, padding: Spacing.md },
  completedRow: { alignItems: 'center', flexDirection: 'row', gap: Spacing.sm },
  completedLabel: { ...Typography.body, color: Colors.textMuted },
  pressed: { opacity: 0.75 },
});
