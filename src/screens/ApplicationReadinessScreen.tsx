import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  AlertTriangle,
  BookOpenCheck,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Eye,
  ExternalLink,
  FileCheck2,
  FileOutput,
  FileText,
  FolderOpen,
  RefreshCw,
  Pencil,
  Save,
  Sparkles,
  Clock3,
  History,
  Upload,
} from 'lucide-react-native';

import Button from '../components/Button';
import Card from '../components/Card';
import Screen from '../components/Screen';
import { useAuth } from '../context/AuthContext';
import {
  suggestApplicationDocuments,
  type ApplicationDocumentSuggestion,
} from '../services/applicationDocumentSuggestionService';
import { orchestrateApplicationPack } from '../services/applicationOrchestratorService';
import {
  getApplicationWorkspaceMeta,
  listApplicationWorkspaceEvents,
  recordApplicationWorkspaceEvent,
  saveApplicationDraft,
  type ApplicationWorkspaceEvent,
  type ApplicationWorkspaceMeta,
} from '../services/applicationWorkspaceService';
import {
  createDocumentSignedUrl,
  listClientDocuments,
} from '../services/documentService';
import { buildReferenceLibraryUrl } from '../services/referenceLibraryService';
import { getClientApplicationReadiness } from '../services/applicationReadinessService';
import { Colors } from '../theme/colors';
import { Radius } from '../theme/radius';
import { Spacing } from '../theme/spacing';
import { Typography } from '../theme/typography';
import type { ReadinessRequirement } from '../types/applicationReadiness';
import { getDocumentTypeLabel, type DocumentRecord } from '../types/document';
import { getApplicationCaseTypeLabel } from '../types/applicationCase';
import type { RootStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'ApplicationReadiness'>;
type SuggestionResult = Awaited<ReturnType<typeof suggestApplicationDocuments>>;

type WorkflowStep = {
  key: string;
  number: number;
  title: string;
  detail: string;
  complete: boolean;
  current: boolean;
  actionLabel?: string;
  onPress?: () => void;
};

export default function ApplicationReadinessScreen({ navigation, route }: Props) {
  const { dealerProfile, user } = useAuth();
  const [data, setData] = useState<Awaited<ReturnType<typeof getClientApplicationReadiness>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCompleted, setShowCompleted] = useState(false);
  const [suggestionResult, setSuggestionResult] = useState<SuggestionResult | null>(null);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [compiling, setCompiling] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [workspaceMeta, setWorkspaceMeta] = useState<ApplicationWorkspaceMeta | null>(null);
  const [timeline, setTimeline] = useState<ApplicationWorkspaceEvent[]>([]);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [openingDocumentId, setOpeningDocumentId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [readiness, clientDocuments] = await Promise.all([
        getClientApplicationReadiness(route.params.clientId),
        listClientDocuments(route.params.clientId),
      ]);
      setData(readiness);
      setDocuments(clientDocuments);
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

  const applicationDocuments = useMemo(() => {
    if (!applicationCase) return [];

    return documents.filter(
      (document) =>
        document.lifecycle_status === 'ACTIVE' &&
        (document.application_case_id === applicationCase.caseId ||
          document.document_scope === 'CLIENT')
    );
  }, [applicationCase, documents]);

  const generatedDocuments = useMemo(
    () => applicationDocuments.filter((document) => document.is_generated),
    [applicationDocuments]
  );

  const findRequirementDocument = useCallback(
    (requirement: ReadinessRequirement) => {
      if (!applicationCase || !requirement.documentType) return undefined;

      const candidates = applicationDocuments.filter(
        (document) => document.document_type === requirement.documentType
      );

      return (
        candidates.find(
          (document) => document.application_case_id === applicationCase.caseId
        ) ?? candidates[0]
      );
    },
    [applicationCase, applicationDocuments]
  );

  const loadSuggestions = useCallback(async () => {
    if (!applicationCase?.caseId || !applicationCase.firearmId) {
      setSuggestionResult(null);
      return;
    }

    setLoadingSuggestions(true);
    try {
      setSuggestionResult(await suggestApplicationDocuments(applicationCase.caseId));
    } catch (error) {
      Alert.alert(
        'Unable to find application documents',
        error instanceof Error ? error.message : 'An unknown error occurred.'
      );
    } finally {
      setLoadingSuggestions(false);
    }
  }, [applicationCase?.caseId, applicationCase?.firearmId]);

  useEffect(() => {
    void loadSuggestions();
  }, [loadSuggestions]);

  const loadWorkspace = useCallback(async () => {
    if (!applicationCase?.caseId) return;
    try {
      const meta = await getApplicationWorkspaceMeta(applicationCase.caseId);
      setWorkspaceMeta(meta);
      setLastSavedAt(meta.updatedAt);
      setTimeline(await listApplicationWorkspaceEvents(applicationCase.caseId, meta));
    } catch (error) {
      Alert.alert('Unable to load application workspace', error instanceof Error ? error.message : 'An unknown error occurred.');
    }
  }, [applicationCase?.caseId]);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  const compileApplicationPack = async () => {
    if (!dealerProfile?.dealerId || !user?.id || !applicationCase) {
      Alert.alert('Unable to compile application', 'The signed-in dealer or application context is missing.');
      return;
    }

    setCompiling(true);
    try {
      const result = await orchestrateApplicationPack({
        dealerId: dealerProfile.dealerId,
        userId: user.id,
        clientId: route.params.clientId,
        applicationCaseId: applicationCase.caseId,
      });

      if (result.packGenerated) {
        Alert.alert(
          'Application pack ready',
          'LicenceGuard selected the matching documents, completed the SAPS form, assembled the pack, archived it and downloaded the printable PDF.'
        );
      } else {
        Alert.alert(
          'Application almost ready',
          result.blockingReasons.length > 0
            ? result.blockingReasons.join('\n\n')
            : 'Complete the outstanding items shown below, then compile again.'
        );
      }

      await recordApplicationWorkspaceEvent(applicationCase.caseId, user.id, result.packGenerated ? 'PACK_COMPILED' : 'PACK_CHECKED', result.packGenerated ? 'Application pack compiled' : 'Application pack checked', result.blockingReasons.join(' | ') || null);
      await loadData();
      await loadSuggestions();
      await loadWorkspace();
    } catch (error) {
      Alert.alert(
        'Unable to compile application',
        error instanceof Error ? error.message : 'An unknown error occurred.'
      );
    } finally {
      setCompiling(false);
    }
  };

  const saveDraft = useCallback(async () => {
    if (!applicationCase?.caseId || !user?.id) return;
    setSaving(true);
    try {
      const savedAt = await saveApplicationDraft(applicationCase.caseId, user.id);
      setLastSavedAt(savedAt);
      Alert.alert('Application saved', 'This application is saved and can be continued from the client profile.');
    } catch (error) {
      Alert.alert('Unable to save application', error instanceof Error ? error.message : 'An unknown error occurred.');
    } finally {
      setSaving(false);
    }
      await loadWorkspace();
  }, [applicationCase?.caseId, user?.id, loadWorkspace]);

  const openReferenceDocument = useCallback(async (suggestion: ApplicationDocumentSuggestion) => {
    try {
      const url = buildReferenceLibraryUrl(suggestion.item.relativePath);
      const supported = await Linking.canOpenURL(url);
      if (!supported) throw new Error('This device cannot open the selected document.');
      await Linking.openURL(url);
    } catch (error) {
      Alert.alert('Unable to open document', error instanceof Error ? error.message : 'An unknown error occurred.');
    }
  }, []);


  const openStoredDocument = useCallback(async (document: DocumentRecord) => {
    setOpeningDocumentId(document.id);

    try {
      const signedUrl = await createDocumentSignedUrl(document.storage_path);
      const supported = await Linking.canOpenURL(signedUrl);
      if (!supported) throw new Error('This device cannot open the secure document link.');
      await Linking.openURL(signedUrl);
    } catch (error) {
      Alert.alert(
        'Unable to open document',
        error instanceof Error ? error.message : 'An unknown error occurred.'
      );
    } finally {
      setOpeningDocumentId(null);
    }
  }, []);

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
  const completed = applicationCase.requirements.filter((item) => item.state === 'SATISFIED');
  const ready = applicationCase.readyToGenerate;
  const motivationSuggestions = suggestionResult?.suggestions.filter((item) => item.kind === 'MOTIVATION') ?? [];
  const informationSuggestions = suggestionResult?.suggestions.filter((item) => item.kind === 'FIREARM_INFORMATION') ?? [];
  const hasSuggestions = motivationSuggestions.length > 0 || informationSuggestions.length > 0;
  const firstOutstanding = outstanding[0];
  const progressPercent = Math.max(
    workspaceMeta?.progressPercent ?? applicationCase.score,
    applicationCase.score
  );

  const openRequirement = (requirement: ReadinessRequirement) => {
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
  };

  const motivationRequirement = applicationCase.requirements.find(
    (requirement) => requirement.documentType === 'MOTIVATION'
  );
  const sapsFormRequirement = applicationCase.requirements.find(
    (requirement) =>
      requirement.documentType === 'FIREARM_LICENCE_APPLICATION_FORM' ||
      requirement.documentType === 'FIREARM_LICENCE_RENEWAL_FORM' ||
      requirement.documentType === 'COMPETENCY_APPLICATION' ||
      requirement.documentType === 'COMPETENCY_RENEWAL_FORM'
  );
  const competencyRequirements = applicationCase.requirements.filter(
    (requirement) =>
      requirement.key === 'MATCHING_COMPETENCY' ||
      requirement.documentType === 'COMPETENCY_CERTIFICATE'
  );
  const supportingRequirements = applicationCase.requirements.filter(
    (requirement) =>
      requirement.required &&
      requirement.documentType &&
      requirement.documentType !== 'MOTIVATION' &&
      requirement.documentType !== 'FIREARM_LICENCE_APPLICATION_FORM' &&
      requirement.documentType !== 'FIREARM_LICENCE_RENEWAL_FORM' &&
      requirement.documentType !== 'COMPETENCY_APPLICATION' &&
      requirement.documentType !== 'COMPETENCY_RENEWAL_FORM' &&
      requirement.documentType !== 'COMPETENCY_CERTIFICATE'
  );

  const competencyComplete =
    competencyRequirements.length === 0 ||
    competencyRequirements.every(
      (requirement) => requirement.state === 'SATISFIED'
    );
  const supportingComplete =
    supportingRequirements.length === 0 ||
    supportingRequirements.every(
      (requirement) => requirement.state === 'SATISFIED'
    );
  const motivationComplete =
    !motivationRequirement ||
    motivationRequirement.state === 'SATISFIED';
  const sapsFormComplete =
    !sapsFormRequirement ||
    sapsFormRequirement.state === 'SATISFIED' ||
    generatedDocuments.some(
      (document) =>
        document.document_type === sapsFormRequirement.documentType
    );
  const reviewComplete = ready;
  const packComplete = generatedDocuments.some((document) =>
    document.document_name.toLowerCase().includes('pack')
  );

  const workflowCompletion = [
    true,
    Boolean(applicationCase.firearmId) ||
      !applicationCase.applicationType.startsWith('FIREARM_'),
    competencyComplete,
    supportingComplete,
    motivationComplete,
    sapsFormComplete,
    reviewComplete,
    packComplete,
  ];
  const currentWorkflowIndex = workflowCompletion.findIndex(
    (complete) => !complete
  );
  const activeWorkflowIndex =
    currentWorkflowIndex === -1
      ? workflowCompletion.length - 1
      : currentWorkflowIndex;
  const firstSupportingOutstanding = supportingRequirements.find(
    (requirement) => requirement.state !== 'SATISFIED'
  );

  const workflowSteps: WorkflowStep[] = [
    {
      key: 'client',
      number: 1,
      title: 'Client',
      detail: 'Client details are linked to this application.',
      complete: workflowCompletion[0],
      current: activeWorkflowIndex === 0,
      actionLabel: 'Edit application',
      onPress: () =>
        navigation.navigate('ApplicationCaseForm', {
          clientId: route.params.clientId,
          applicationCaseId: applicationCase.caseId,
        }),
    },
    {
      key: 'firearm',
      number: 2,
      title: 'Firearm',
      detail: applicationCase.firearmId
        ? 'The firearm is linked and ready for this application.'
        : 'Link or confirm the firearm for this application.',
      complete: workflowCompletion[1],
      current: activeWorkflowIndex === 1,
      actionLabel: 'Update firearm details',
      onPress: () =>
        navigation.navigate('ApplicationCaseForm', {
          clientId: route.params.clientId,
          applicationCaseId: applicationCase.caseId,
        }),
    },
    {
      key: 'competency',
      number: 3,
      title: 'Competency',
      detail: competencyComplete
        ? 'The matching competency requirement is satisfied.'
        : 'Add or confirm the matching competency.',
      complete: workflowCompletion[2],
      current: activeWorkflowIndex === 2,
      actionLabel: competencyRequirements[0]
        ? 'Resolve competency'
        : undefined,
      onPress: competencyRequirements[0]
        ? () => openRequirement(competencyRequirements[0])
        : undefined,
    },
    {
      key: 'supporting',
      number: 4,
      title: 'Supporting documents',
      detail: supportingComplete
        ? 'All required supporting documents are attached.'
        : 'Upload the remaining supporting documents.',
      complete: workflowCompletion[3],
      current: activeWorkflowIndex === 3,
      actionLabel: firstSupportingOutstanding
        ? 'Upload next document'
        : undefined,
      onPress: firstSupportingOutstanding
        ? () => openRequirement(firstSupportingOutstanding)
        : undefined,
    },
    {
      key: 'motivation',
      number: 5,
      title: 'Motivation',
      detail: motivationComplete
        ? 'The motivation is attached and ready.'
        : 'Add, generate or confirm the application motivation.',
      complete: workflowCompletion[4],
      current: activeWorkflowIndex === 4,
      actionLabel: motivationRequirement
        ? 'Resolve motivation'
        : undefined,
      onPress: motivationRequirement
        ? () => openRequirement(motivationRequirement)
        : undefined,
    },
    {
      key: 'forms',
      number: 6,
      title: 'SAPS forms',
      detail: sapsFormComplete
        ? 'The required SAPS form is available.'
        : 'Complete or generate the required SAPS form.',
      complete: workflowCompletion[5],
      current: activeWorkflowIndex === 5,
      actionLabel: sapsFormRequirement
        ? 'Prepare SAPS form'
        : undefined,
      onPress: sapsFormRequirement
        ? () => openRequirement(sapsFormRequirement)
        : undefined,
    },
    {
      key: 'review',
      number: 7,
      title: 'Review',
      detail: reviewComplete
        ? 'The application passed the readiness review.'
        : 'Resolve any remaining warnings before compilation.',
      complete: workflowCompletion[6],
      current: activeWorkflowIndex === 6,
      actionLabel: firstOutstanding
        ? 'Resolve next item'
        : undefined,
      onPress: firstOutstanding
        ? () => openRequirement(firstOutstanding)
        : undefined,
    },
    {
      key: 'compile',
      number: 8,
      title: 'Compile',
      detail: packComplete
        ? 'The completed application pack has been generated.'
        : 'Compile and download the printable application pack.',
      complete: workflowCompletion[7],
      current: activeWorkflowIndex === 7,
      actionLabel: packComplete ? undefined : 'Compile pack',
      onPress: packComplete
        ? undefined
        : () => void compileApplicationPack(),
    },
  ];

  return (
    <Screen maxWidth={920}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>APPLICATION WORKSPACE</Text>
        <Text style={styles.title}>{getApplicationCaseTypeLabel(applicationCase.applicationType)}</Text>
        <Text style={styles.subject}>{applicationCase.subject}</Text>
        <Text style={styles.subtitle}>
          Everything for this application is saved here. Continue, upload, review, compile and return later without recreating the application.
        </Text>
      </View>

      <Card
        title="Guided application workflow"
        subtitle="Completed steps stay compact. LicenceGuard keeps the current step open so the next action is always clear."
      >
        <View style={styles.workflowList}>
          {workflowSteps.map((step, index) => (
            <View key={step.key}>
              <Pressable
                disabled={!step.onPress}
                onPress={step.onPress}
                style={({ pressed }) => [
                  styles.workflowStep,
                  step.current ? styles.workflowStepCurrent : null,
                  step.complete ? styles.workflowStepComplete : null,
                  pressed ? styles.pressed : null,
                ]}
              >
                <View
                  style={[
                    styles.workflowNumber,
                    step.complete
                      ? styles.workflowNumberComplete
                      : step.current
                        ? styles.workflowNumberCurrent
                        : null,
                  ]}
                >
                  {step.complete ? (
                    <CheckCircle2 color={Colors.success} size={19} />
                  ) : (
                    <Text
                      style={[
                        styles.workflowNumberText,
                        step.current
                          ? styles.workflowNumberTextCurrent
                          : null,
                      ]}
                    >
                      {step.number}
                    </Text>
                  )}
                </View>

                <View style={styles.workflowText}>
                  <View style={styles.workflowTitleRow}>
                    <Text
                      style={[
                        styles.workflowTitle,
                        step.current
                          ? styles.workflowTitleCurrent
                          : null,
                      ]}
                    >
                      {step.title}
                    </Text>

                    <Text
                      style={[
                        styles.workflowState,
                        step.complete
                          ? styles.workflowStateComplete
                          : step.current
                            ? styles.workflowStateCurrent
                            : null,
                      ]}
                    >
                      {step.complete
                        ? 'Complete'
                        : step.current
                          ? 'Current step'
                          : 'Waiting'}
                    </Text>
                  </View>

                  {step.current ? (
                    <>
                      <Text style={styles.workflowDetail}>
                        {step.detail}
                      </Text>

                      {step.actionLabel && step.onPress ? (
                        <View style={styles.workflowActionRow}>
                          <Text style={styles.workflowActionText}>
                            {step.actionLabel}
                          </Text>
                          <ChevronDown
                            color={Colors.primaryLight}
                            size={17}
                          />
                        </View>
                      ) : null}
                    </>
                  ) : null}
                </View>
              </Pressable>

              {index < workflowSteps.length - 1 ? (
                <View
                  style={[
                    styles.workflowConnector,
                    step.complete
                      ? styles.workflowConnectorComplete
                      : null,
                  ]}
                />
              ) : null}
            </View>
          ))}
        </View>
      </Card>

      <Card
        padding="large"
        style={[
          styles.nextActionCard,
          ready ? styles.nextActionReady : styles.nextActionRequired,
        ]}
      >
        <View style={styles.nextActionRow}>
          <View style={styles.nextActionContent}>
            <Text style={styles.nextActionEyebrow}>NEXT ACTION</Text>
            <Text style={styles.nextActionTitle}>
              {firstOutstanding
                ? firstOutstanding.label
                : 'Compile the application pack'}
            </Text>
            <Text style={styles.nextActionDetail}>
              {firstOutstanding
                ? firstOutstanding.detail
                : 'All required items are present. Generate the SAPS form and printable application pack.'}
            </Text>
          </View>

          <Button
            disabled={compiling}
            loading={!firstOutstanding && compiling}
            leftIcon={
              firstOutstanding
                ? <Upload color={Colors.white} size={18} />
                : <FileOutput color={Colors.white} size={18} />
            }
            onPress={() => {
              if (firstOutstanding) {
                openRequirement(firstOutstanding);
                return;
              }
              void compileApplicationPack();
            }}
            title={
              firstOutstanding
                ? firstOutstanding.documentType
                  ? 'Upload or replace'
                  : 'Update application'
                : 'Compile now'
            }
          />
        </View>
      </Card>

      <Card title="Application progress" subtitle={workspaceMeta ? `Last updated ${new Date(workspaceMeta.updatedAt).toLocaleString()}` : 'Loading saved application status...'}>
        <View style={styles.progressHeader}>
          <View>
            <Text style={styles.progressLabel}>{workspaceMeta?.status.replace(/_/g, ' ') ?? applicationCase.status.replace(/_/g, ' ')}</Text>
            <Text style={styles.progressHint}>This is a persistent working application.</Text>
          </View>
          <Text style={styles.progressPercent}>{progressPercent}%</Text>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
        </View>
      </Card>

      <Card padding="large" style={[styles.statusCard, ready ? styles.readyBorder : styles.actionBorder]}>
        <View style={styles.statusRow}>
          <View style={[styles.statusIcon, ready ? styles.readyBackground : styles.actionBackground]}>
            {ready ? <CheckCircle2 color={Colors.success} size={34} /> : <AlertTriangle color={Colors.warning} size={34} />}
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

      <Card title="Application workspace" subtitle="Your work is stored against this application. Continue it from the client profile at any time.">
        <View style={styles.workspaceStatus}>
          <View style={styles.workspaceSaved}>
            <Save color={Colors.success} size={20} />
            <View style={styles.workspaceSavedText}>
              <Text style={styles.workspaceSavedTitle}>Saved application</Text>
              <Text style={styles.workspaceSavedDetail}>{lastSavedAt ? `Last saved ${new Date(lastSavedAt).toLocaleString()}` : 'Changes are stored when application details and documents are added.'}</Text>
            </View>
          </View>
          <Button title={saving ? 'Saving...' : 'Save Draft'} variant="secondary" disabled={saving} onPress={() => void saveDraft()} leftIcon={<Save color={Colors.silver} size={18} />} />
        </View>
        <View style={styles.workspaceButtons}>
          <Button title="Upload Documents" onPress={() => navigation.navigate('DocumentLibrary', { clientId: route.params.clientId, applicationCaseId: applicationCase.caseId, openUpload: true })} leftIcon={<Upload color={Colors.white} size={18} />} />
          <Button title="View Application Documents" variant="secondary" onPress={() => navigation.navigate('DocumentLibrary', { clientId: route.params.clientId, applicationCaseId: applicationCase.caseId })} leftIcon={<FolderOpen color={Colors.silver} size={18} />} />
        </View>
      </Card>

      <Card
        title="Application documents"
        subtitle="Review, preview or replace the required documents without searching through the full client library."
      >
        <View style={styles.documentCentreList}>
          {applicationCase.requirements
            .filter((requirement) => requirement.required && requirement.documentType)
            .map((requirement) => {
              const document = findRequirementDocument(requirement);

              return (
                <View key={requirement.key} style={styles.documentCentreRow}>
                  <View style={styles.documentCentreIdentity}>
                    <View
                      style={[
                        styles.documentCentreIcon,
                        requirement.state === 'SATISFIED'
                          ? styles.documentCentreIconReady
                          : styles.documentCentreIconRequired,
                      ]}
                    >
                      {requirement.state === 'SATISFIED' ? (
                        <CheckCircle2 color={Colors.success} size={20} />
                      ) : (
                        <FileText
                          color={
                            requirement.state === 'EXPIRED'
                              ? Colors.danger
                              : Colors.warning
                          }
                          size={20}
                        />
                      )}
                    </View>

                    <View style={styles.documentCentreText}>
                      <Text style={styles.documentCentreTitle}>
                        {requirement.label}
                      </Text>
                      <Text
                        style={[
                          styles.documentCentreStatus,
                          {
                            color:
                              requirement.state === 'SATISFIED'
                                ? Colors.success
                                : requirement.state === 'EXPIRED'
                                  ? Colors.danger
                                  : Colors.warning,
                          },
                        ]}
                      >
                        {requirement.state === 'SATISFIED'
                          ? 'Attached and verified'
                          : requirement.state === 'UNVERIFIED'
                            ? 'Awaiting verification'
                            : requirement.state === 'EXPIRED'
                              ? 'Expired'
                              : 'Missing'}
                      </Text>
                      {document ? (
                        <Text style={styles.documentCentreFile}>
                          {document.document_name}
                        </Text>
                      ) : null}
                    </View>
                  </View>

                  <View style={styles.documentCentreActions}>
                    {document ? (
                      <Button
                        leftIcon={<Eye color={Colors.silver} size={16} />}
                        loading={openingDocumentId === document.id}
                        onPress={() => void openStoredDocument(document)}
                        size="small"
                        title="Preview"
                        variant="secondary"
                      />
                    ) : null}

                    <Button
                      leftIcon={
                        document
                          ? <RefreshCw color={Colors.silver} size={16} />
                          : <Upload color={Colors.silver} size={16} />
                      }
                      onPress={() => openRequirement(requirement)}
                      size="small"
                      title={document ? 'Replace' : 'Upload'}
                      variant="ghost"
                    />
                  </View>
                </View>
              );
            })}
        </View>
      </Card>

      <Card
        title="Generated documents"
        subtitle="SAPS forms and completed packs created by LicenceGuard for this application."
      >
        {generatedDocuments.length === 0 ? (
          <View style={styles.generatedEmpty}>
            <FileOutput color={Colors.silverDark} size={30} />
            <Text style={styles.generatedEmptyTitle}>No generated documents yet</Text>
            <Text style={styles.generatedEmptyText}>
              Generated SAPS forms and completed application packs will appear here after compilation.
            </Text>
          </View>
        ) : (
          <View style={styles.generatedList}>
            {generatedDocuments.map((document) => (
              <View key={document.id} style={styles.generatedRow}>
                <View style={styles.generatedIdentity}>
                  <View style={styles.generatedIcon}>
                    <FileCheck2 color={Colors.success} size={20} />
                  </View>
                  <View style={styles.generatedText}>
                    <Text style={styles.generatedTitle}>{document.document_name}</Text>
                    <Text style={styles.generatedMeta}>
                      {getDocumentTypeLabel(document.document_type)}
                    </Text>
                  </View>
                </View>

                <Button
                  leftIcon={<ExternalLink color={Colors.silver} size={17} />}
                  loading={openingDocumentId === document.id}
                  onPress={() => void openStoredDocument(document)}
                  size="small"
                  title="Open"
                  variant="secondary"
                />
              </View>
            ))}
          </View>
        )}
      </Card>

      {applicationCase.firearmId ? (
        <Card
          title="Suggested application documents"
          subtitle="LicenceGuard matches the calibre first, then checks firearm category, make, model and application purpose. Conflicting calibres are rejected."
        >
          {loadingSuggestions ? (
            <View style={styles.suggestionLoading}>
              <ActivityIndicator color={Colors.primary} />
              <Text style={styles.mutedLeft}>Finding the strongest matching motivation and firearm information...</Text>
            </View>
          ) : hasSuggestions ? (
            <View style={styles.suggestionContent}>
              {motivationSuggestions.length > 0 ? (
                <SuggestionGroup title="Motivations" items={motivationSuggestions} onView={openReferenceDocument} />
              ) : (
                <View style={styles.noMatch}>
                  <AlertTriangle color={Colors.warning} size={18} />
                  <Text style={styles.noMatchText}>No calibre-compatible motivation was found. LicenceGuard will not use a document for another calibre.</Text>
                </View>
              )}

              {informationSuggestions.length > 0 ? (
                <SuggestionGroup title="Firearm and calibre information" items={informationSuggestions} onView={openReferenceDocument} />
              ) : null}

              <Text style={styles.helperText}>
                LicenceGuard will use the strongest safe matches automatically when you compile. Working copies are linked to this application while the source documents remain unchanged.
              </Text>
            </View>
          ) : (
            <View style={styles.noMatch}>
              <AlertTriangle color={Colors.warning} size={18} />
              <Text style={styles.noMatchText}>No safe match was found. Add a suitable motivation or firearm-information document rather than reusing an incompatible one.</Text>
            </View>
          )}
        </Card>
      ) : null}

      {!ready ? (
        <Card title="Do this next" subtitle="Only the outstanding items are shown. Tap an item to upload or replace it.">
          <View style={styles.list}>
            {outstanding.map((requirement) => (
              <RequirementRow
                key={requirement.key}
                requirement={requirement}
                onPress={() => openRequirement(requirement)}
              />
            ))}
          </View>
        </Card>
      ) : null}

      <Card title="Application timeline" subtitle="A simple history of work completed on this application.">
        <View style={styles.timelineList}>
          {timeline.length > 0 ? timeline.map((event) => (
            <View key={event.id} style={styles.timelineRow}>
              <View style={styles.timelineIcon}><History color={Colors.primaryLight} size={16} /></View>
              <View style={styles.timelineText}>
                <Text style={styles.timelineTitle}>{event.title}</Text>
                {event.detail ? <Text style={styles.timelineDetail}>{event.detail}</Text> : null}
                <Text style={styles.timelineDate}>{new Date(event.createdAt).toLocaleString()}</Text>
              </View>
            </View>
          )) : (
            <View style={styles.timelineRow}>
              <View style={styles.timelineIcon}><Clock3 color={Colors.silverDark} size={16} /></View>
              <Text style={styles.mutedLeft}>Activity will appear here as the application is worked on.</Text>
            </View>
          )}
        </View>
      </Card>

      <View style={styles.actions}>
        <Button
          leftIcon={<FileOutput color={Colors.white} size={19} />}
          size="large"
          fullWidth
          disabled={compiling}
          title={compiling ? 'Preparing Application...' : 'Compile Application Pack'}
          onPress={() => void compileApplicationPack()}
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
          <Pressable onPress={() => setShowCompleted((current) => !current)} style={({ pressed }) => [styles.completedHeader, pressed ? styles.pressed : null]}>
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

function SuggestionGroup({ title, items, onView }: { title: string; items: ApplicationDocumentSuggestion[]; onView: (item: ApplicationDocumentSuggestion) => void }) {
  return (
    <View style={styles.suggestionGroup}>
      <View style={styles.suggestionGroupTitleRow}>
        <BookOpenCheck color={Colors.primaryLight} size={18} />
        <Text style={styles.suggestionGroupTitle}>{title}</Text>
      </View>
      {items.map((suggestion, index) => (
        <View key={suggestion.item.id} style={styles.suggestionRow}>
          <View style={styles.suggestionRank}><Text style={styles.suggestionRankText}>{index + 1}</Text></View>
          <View style={styles.suggestionText}>
            <Text style={styles.suggestionTitle}>{suggestion.item.title}</Text>
            <Text style={styles.suggestionReason}>{suggestion.reason}</Text>
          </View>
          <Pressable onPress={() => onView(suggestion)} style={({ pressed }) => [styles.viewDocumentButton, pressed ? styles.pressed : null]}>
            <Eye color={Colors.primaryLight} size={17} />
            <Text style={styles.viewDocumentText}>View</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

function RequirementRow({ requirement, onPress }: { requirement: ReadinessRequirement; onPress: () => void }) {
  const stateLabel = requirement.state === 'EXPIRED' ? 'Expired' : requirement.state === 'UNVERIFIED' ? 'Confirm' : 'Missing';

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.requirement, pressed ? styles.pressed : null]}>
      <View style={styles.requirementMain}>
        <View style={styles.requirementIcon}><Upload color={Colors.warning} size={19} /></View>
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
  workflowList: { gap: 0 },
  workflowStep: {
    alignItems: 'flex-start',
    backgroundColor: Colors.surfaceRaised,
    borderColor: Colors.border,
    borderRadius: Radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: Spacing.md,
    padding: Spacing.md,
  },
  workflowStepCurrent: {
    backgroundColor: Colors.primarySoft,
    borderColor: Colors.primary,
  },
  workflowStepComplete: {
    borderColor: 'rgba(40,199,111,0.34)',
  },
  workflowNumber: {
    alignItems: 'center',
    backgroundColor: Colors.surfaceSoft,
    borderColor: Colors.borderStrong,
    borderRadius: Radius.pill,
    borderWidth: 1,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  workflowNumberCurrent: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  workflowNumberComplete: {
    backgroundColor: 'rgba(40,199,111,0.12)',
    borderColor: 'rgba(40,199,111,0.34)',
  },
  workflowNumberText: {
    ...Typography.caption,
    color: Colors.silver,
    fontWeight: '800',
  },
  workflowNumberTextCurrent: { color: Colors.white },
  workflowText: { flex: 1 },
  workflowTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    justifyContent: 'space-between',
  },
  workflowTitle: {
    ...Typography.bodyStrong,
    color: Colors.silver,
  },
  workflowTitleCurrent: { color: Colors.text },
  workflowState: {
    ...Typography.caption,
    color: Colors.silverDark,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  workflowStateComplete: { color: Colors.success },
  workflowStateCurrent: { color: Colors.primaryLight },
  workflowDetail: {
    ...Typography.body,
    color: Colors.textMuted,
    marginTop: Spacing.xs,
  },
  workflowActionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.xs,
    marginTop: Spacing.sm,
  },
  workflowActionText: {
    ...Typography.caption,
    color: Colors.primaryLight,
    fontWeight: '800',
  },
  workflowConnector: {
    backgroundColor: Colors.border,
    height: Spacing.sm,
    marginLeft: 16,
    width: 2,
  },
  workflowConnectorComplete: { backgroundColor: Colors.success },
  nextActionCard: { marginBottom: Spacing.lg },
  nextActionReady: { borderColor: Colors.success },
  nextActionRequired: { borderColor: Colors.primary },
  nextActionRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.lg, justifyContent: 'space-between' },
  nextActionContent: { flex: 1, minWidth: 260 },
  nextActionEyebrow: { ...Typography.eyebrow, color: Colors.primaryLight },
  nextActionTitle: { ...Typography.sectionTitle, color: Colors.text, marginTop: Spacing.xs },
  nextActionDetail: { ...Typography.body, color: Colors.textMuted, marginTop: Spacing.xs },
  documentCentreList: { gap: Spacing.sm },
  documentCentreRow: { alignItems: 'center', backgroundColor: Colors.surfaceRaised, borderColor: Colors.border, borderRadius: Radius.lg, borderWidth: 1, flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md, justifyContent: 'space-between', padding: Spacing.md },
  documentCentreIdentity: { alignItems: 'center', flex: 1, flexDirection: 'row', minWidth: 260 },
  documentCentreIcon: { alignItems: 'center', borderRadius: Radius.md, height: 42, justifyContent: 'center', width: 42 },
  documentCentreIconReady: { backgroundColor: 'rgba(40,199,111,0.12)' },
  documentCentreIconRequired: { backgroundColor: Colors.surfaceSoft },
  documentCentreText: { flex: 1, marginLeft: Spacing.md },
  documentCentreTitle: { ...Typography.bodyStrong, color: Colors.text },
  documentCentreStatus: { ...Typography.caption, fontWeight: '800', marginTop: Spacing.xxs },
  documentCentreFile: { ...Typography.caption, color: Colors.textMuted, marginTop: Spacing.xxs },
  documentCentreActions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  generatedEmpty: { alignItems: 'center', paddingVertical: Spacing.xl },
  generatedEmptyTitle: { ...Typography.bodyStrong, color: Colors.silver, marginTop: Spacing.sm },
  generatedEmptyText: { ...Typography.body, color: Colors.textMuted, marginTop: Spacing.xs, maxWidth: 620, textAlign: 'center' },
  generatedList: { gap: Spacing.sm },
  generatedRow: { alignItems: 'center', backgroundColor: Colors.surfaceRaised, borderColor: Colors.border, borderRadius: Radius.lg, borderWidth: 1, flexDirection: 'row', gap: Spacing.md, justifyContent: 'space-between', padding: Spacing.md },
  generatedIdentity: { alignItems: 'center', flex: 1, flexDirection: 'row' },
  generatedIcon: { alignItems: 'center', backgroundColor: 'rgba(40,199,111,0.12)', borderRadius: Radius.md, height: 42, justifyContent: 'center', width: 42 },
  generatedText: { flex: 1, marginLeft: Spacing.md },
  generatedTitle: { ...Typography.bodyStrong, color: Colors.text },
  generatedMeta: { ...Typography.caption, color: Colors.textMuted, marginTop: Spacing.xxs },
  loading: { alignItems: 'center', flex: 1, justifyContent: 'center', gap: Spacing.md },
  muted: { ...Typography.body, color: Colors.textMuted, textAlign: 'center' },
  mutedLeft: { ...Typography.body, color: Colors.textMuted, flex: 1 },
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
  workspaceStatus: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md, justifyContent: 'space-between' },
  workspaceSaved: { alignItems: 'center', flexDirection: 'row', flex: 1, gap: Spacing.sm, minWidth: 260 },
  workspaceSavedText: { flex: 1 },
  workspaceSavedTitle: { ...Typography.bodyStrong, color: Colors.success },
  workspaceSavedDetail: { ...Typography.caption, color: Colors.textMuted, marginTop: Spacing.xxs },
  workspaceButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md, marginTop: Spacing.lg },
  suggestionLoading: { alignItems: 'center', flexDirection: 'row', gap: Spacing.md, paddingVertical: Spacing.md },
  suggestionContent: { gap: Spacing.lg },
  suggestionGroup: { gap: Spacing.sm },
  suggestionGroupTitleRow: { alignItems: 'center', flexDirection: 'row', gap: Spacing.sm },
  suggestionGroupTitle: { ...Typography.bodyStrong, color: Colors.silver },
  suggestionRow: { alignItems: 'flex-start', backgroundColor: Colors.surfaceRaised, borderColor: Colors.border, borderRadius: Radius.lg, borderWidth: 1, flexDirection: 'row', gap: Spacing.md, padding: Spacing.md },
  suggestionRank: { alignItems: 'center', backgroundColor: Colors.primarySoft, borderRadius: Radius.md, height: 28, justifyContent: 'center', width: 28 },
  suggestionRankText: { ...Typography.caption, color: Colors.primaryLight, fontWeight: '800' },
  suggestionText: { flex: 1 },
  viewDocumentButton: { alignItems: 'center', borderColor: Colors.primaryDark, borderRadius: Radius.md, borderWidth: 1, flexDirection: 'row', gap: Spacing.xs, paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs },
  viewDocumentText: { ...Typography.caption, color: Colors.primaryLight, fontWeight: '800' },
  suggestionTitle: { ...Typography.bodyStrong, color: Colors.text },
  suggestionReason: { ...Typography.caption, color: Colors.textMuted, marginTop: Spacing.xxs },
  noMatch: { alignItems: 'flex-start', backgroundColor: Colors.surfaceRaised, borderColor: Colors.warning, borderRadius: Radius.lg, borderWidth: 1, flexDirection: 'row', gap: Spacing.sm, padding: Spacing.md },
  noMatchText: { ...Typography.body, color: Colors.textMuted, flex: 1 },
  helperText: { ...Typography.caption, color: Colors.textMuted },
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
  progressHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.md },
  progressLabel: { ...Typography.bodyStrong, color: Colors.text, textTransform: 'capitalize' },
  progressHint: { ...Typography.caption, color: Colors.textMuted, marginTop: Spacing.xxs },
  progressPercent: { ...Typography.sectionTitle, color: Colors.primaryLight },
  progressTrack: { backgroundColor: Colors.surfaceSoft, borderRadius: Radius.xl, height: 10, marginTop: Spacing.md, overflow: 'hidden' },
  progressFill: { backgroundColor: Colors.primary, borderRadius: Radius.xl, height: '100%' },
  timelineList: { gap: Spacing.md },
  timelineRow: { alignItems: 'flex-start', flexDirection: 'row', gap: Spacing.md },
  timelineIcon: { alignItems: 'center', backgroundColor: Colors.primarySoft, borderRadius: Radius.xl, height: 34, justifyContent: 'center', width: 34 },
  timelineText: { flex: 1 },
  timelineTitle: { ...Typography.bodyStrong, color: Colors.text },
  timelineDetail: { ...Typography.caption, color: Colors.textMuted, marginTop: Spacing.xxs },
  timelineDate: { ...Typography.caption, color: Colors.silverDark, marginTop: Spacing.xxs },
  pressed: { opacity: 0.75 },
});