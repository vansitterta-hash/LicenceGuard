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
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  FileText,
  FolderOpen,
  Plus,
  Save,
  ShieldCheck,
  Target,
  UserRound,
} from 'lucide-react-native';

import Button from '../components/Button';
import Card from '../components/Card';
import Screen from '../components/Screen';
import TextField from '../components/TextField';
import { useAuth } from '../context/AuthContext';
import { listClientCompetencies } from '../engines/competencyEngine';
import {
  createApplicationCase,
  getApplicationCase,
  updateApplicationCase,
} from '../services/applicationCaseService';
import { getClient } from '../services/clientService';
import { listClientFirearms } from '../services/firearmService';
import { Colors } from '../theme/colors';
import { Radius } from '../theme/radius';
import { Spacing } from '../theme/spacing';
import { Typography } from '../theme/typography';
import {
  APPLICATION_CASE_STATUSES,
  APPLICATION_CASE_TYPES,
  FIREARM_ACQUISITION_SOURCES,
  getApplicationCaseTypeLabel,
  getDefaultProgressForStatus,
  isCompetencyApplicationType,
  isFirearmApplicationType,
  isNewFirearmLicenceApplication,
  type ApplicationCaseFormValues,
  type ApplicationCaseStatus,
  type ApplicationCaseType,
  type FirearmAcquisitionSource,
} from '../types/applicationCase';
import type { ClientRecord } from '../types/client';
import {
  COMPETENCY_CATEGORIES,
  type CompetencyListItem,
} from '../types/competency';
import type { FirearmListItem } from '../types/firearm';
import type { RootStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'ApplicationCaseForm'>;

type FormData = {
  client: ClientRecord;
  competencies: CompetencyListItem[];
  firearms: FirearmListItem[];
};

type WizardStep = {
  key: string;
  label: string;
};

const LICENCE_SECTIONS = [
  { value: '13', label: 'Section 13', description: 'Self-defence firearm licence.' },
  { value: '15', label: 'Section 15', description: 'Occasional hunting or sport shooting.' },
  { value: '16', label: 'Section 16', description: 'Dedicated hunting or sport shooting.' },
];

function getTodayDate(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const EMPTY_FORM: ApplicationCaseFormValues = {
  applicationType: 'COMPETENCY_FIRST_APPLICATION',
  status: 'NOT_STARTED',
  competencyCategory: 'HANDGUN',
  competencyId: '',
  firearmId: '',
  firearmLicenceId: '',
  licenceSection: '',
  acquisitionSource: 'NOT_APPLICABLE',
  supplierName: '',
  supplierIdOrRegistration: '',
  supplierContact: '',
  supplierLicenceNumber: '',
  saleOrInvoiceReference: '',
  motivationSummary: '',
  openedDate: getTodayDate(),
  targetSubmissionDate: '',
  actualSubmissionDate: '',
  applicationReference: '',
  policeStation: '',
  outcomeDate: '',
  outcomeNotes: '',
  progressPercent: '0',
  dealerNotes: '',
  clientNotes: '',
};

function isValidDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00`).getTime());
}

export default function ApplicationCaseFormScreen({ navigation, route }: Props) {
  const { dealerProfile, user } = useAuth();
  const [data, setData] = useState<FormData | null>(null);
  const [values, setValues] = useState<ApplicationCaseFormValues>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [stepIndex, setStepIndex] = useState(0);

  const isEditing = Boolean(route.params.applicationCaseId);
  const competencyApplication = isCompetencyApplicationType(values.applicationType);
  const firearmApplication = isFirearmApplicationType(values.applicationType);
  const newFirearmApplication = isNewFirearmLicenceApplication(values.applicationType);

  const steps = useMemo<WizardStep[]>(() => {
    if (competencyApplication) {
      return [
        { key: 'type', label: 'Application' },
        { key: 'subject', label: 'Category' },
        { key: 'purpose', label: 'Purpose' },
        { key: 'tracking', label: 'Tracking' },
        { key: 'review', label: 'Review' },
      ];
    }

    return [
      { key: 'type', label: 'Application' },
      { key: 'subject', label: 'Firearm' },
      { key: 'source', label: 'Source' },
      { key: 'purpose', label: 'Purpose' },
      { key: 'tracking', label: 'Tracking' },
      { key: 'review', label: 'Review' },
    ];
  }, [competencyApplication]);

  const currentStep = steps[Math.min(stepIndex, steps.length - 1)];

  useEffect(() => {
    if (stepIndex >= steps.length) {
      setStepIndex(steps.length - 1);
    }
  }, [stepIndex, steps.length]);

  const loadData = useCallback(async (showLoading = true) => {
    if (showLoading) {
      setLoading(true);
    }

    try {
      const [client, competencies, firearms] = await Promise.all([
        getClient(route.params.clientId),
        listClientCompetencies(route.params.clientId),
        listClientFirearms(route.params.clientId),
      ]);

      setData({ client, competencies, firearms });

      if (route.params.applicationCaseId) {
        const item = await getApplicationCase(route.params.applicationCaseId);
        setValues({
          applicationType: item.application_type,
          status: item.status,
          competencyCategory: item.competency_category ?? 'HANDGUN',
          competencyId: item.competency_id ?? '',
          firearmId: item.firearm_id ?? '',
          firearmLicenceId: item.firearm_licence_id ?? '',
          licenceSection: item.licence_section ?? '',
          acquisitionSource: item.acquisition_source ?? 'NOT_APPLICABLE',
          supplierName: item.supplier_name ?? '',
          supplierIdOrRegistration: item.supplier_id_or_registration ?? '',
          supplierContact: item.supplier_contact ?? '',
          supplierLicenceNumber: item.supplier_licence_number ?? '',
          saleOrInvoiceReference: item.sale_or_invoice_reference ?? '',
          motivationSummary: item.motivation_summary ?? '',
          openedDate: item.opened_date,
          targetSubmissionDate: item.target_submission_date ?? '',
          actualSubmissionDate: item.actual_submission_date ?? '',
          applicationReference: item.application_reference ?? '',
          policeStation: item.police_station ?? '',
          outcomeDate: item.outcome_date ?? '',
          outcomeNotes: item.outcome_notes ?? '',
          progressPercent: String(item.progress_percent),
          dealerNotes: item.dealer_notes ?? '',
          clientNotes: item.client_notes ?? '',
        });
      }
    } catch (error) {
      Alert.alert('Unable to load application case', error instanceof Error ? error.message : 'An unknown error occurred.');
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  }, [route.params.applicationCaseId, route.params.clientId]);

  useEffect(() => {
    void loadData();

    const unsubscribe = navigation.addListener('focus', () => {
      void loadData(false);
    });

    return unsubscribe;
  }, [loadData, navigation]);

  const selectedFirearm = useMemo(
    () => data?.firearms.find((firearm) => firearm.id === values.firearmId) ?? null,
    [data?.firearms, values.firearmId]
  );

  const selectedCompetencyLabel = useMemo(
    () => COMPETENCY_CATEGORIES.find((item) => item.value === values.competencyCategory)?.label ?? values.competencyCategory,
    [values.competencyCategory]
  );

  const updateValue = <K extends keyof ApplicationCaseFormValues>(key: K, value: ApplicationCaseFormValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: '' }));
  };

  const selectApplicationType = (applicationType: ApplicationCaseType) => {
    const competency = isCompetencyApplicationType(applicationType);
    const firearm = isFirearmApplicationType(applicationType);
    const isNew = isNewFirearmLicenceApplication(applicationType);

    setValues((current) => ({
      ...current,
      applicationType,
      competencyId: competency ? current.competencyId : '',
      firearmId: firearm ? current.firearmId : '',
      firearmLicenceId: firearm ? current.firearmLicenceId : '',
      licenceSection: firearm ? current.licenceSection : '',
      acquisitionSource: competency
        ? 'NOT_APPLICABLE'
        : isNew
          ? (current.acquisitionSource === 'DEALER' || current.acquisitionSource === 'PRIVATE_SELLER' ? current.acquisitionSource : 'DEALER')
          : 'EXISTING_FIREARM',
    }));
    setStepIndex(0);
  };

  const selectFirearm = (firearm: FirearmListItem) => {
    setValues((current) => ({
      ...current,
      firearmId: firearm.id,
      firearmLicenceId: firearm.licence?.id ?? '',
      licenceSection: firearm.licence?.licence_section ?? current.licenceSection,
    }));
    setErrors((current) => ({ ...current, firearmId: '' }));
  };

  const selectStatus = (status: ApplicationCaseStatus) => {
    setValues((current) => ({
      ...current,
      status,
      progressPercent: String(getDefaultProgressForStatus(status)),
    }));
  };

  const selectSource = (source: FirearmAcquisitionSource) => {
    setValues((current) => ({
      ...current,
      acquisitionSource: source,
      supplierName: source === 'EXISTING_FIREARM' || source === 'NOT_APPLICABLE' ? '' : current.supplierName,
      supplierIdOrRegistration: source === 'EXISTING_FIREARM' || source === 'NOT_APPLICABLE' ? '' : current.supplierIdOrRegistration,
      supplierContact: source === 'EXISTING_FIREARM' || source === 'NOT_APPLICABLE' ? '' : current.supplierContact,
      supplierLicenceNumber: source === 'EXISTING_FIREARM' || source === 'NOT_APPLICABLE' ? '' : current.supplierLicenceNumber,
      saleOrInvoiceReference: source === 'EXISTING_FIREARM' || source === 'NOT_APPLICABLE' ? '' : current.saleOrInvoiceReference,
    }));
    setErrors((current) => ({ ...current, acquisitionSource: '', supplierName: '' }));
  };

  const validateStep = (stepKey: string): boolean => {
    const next: Record<string, string> = {};

    if (stepKey === 'subject' && firearmApplication && !values.firearmId) {
      next.firearmId = 'Select the firearm for this application.';
    }

    if (stepKey === 'source' && newFirearmApplication) {
      if (!['DEALER', 'PRIVATE_SELLER'].includes(values.acquisitionSource)) {
        next.acquisitionSource = 'Choose dealer purchase or private sale.';
      }
      if (['DEALER', 'PRIVATE_SELLER'].includes(values.acquisitionSource) && !values.supplierName.trim()) {
        next.supplierName = values.acquisitionSource === 'DEALER' ? 'Enter the dealer name.' : 'Enter the private seller name.';
      }
    }

    if (stepKey === 'purpose' && firearmApplication && !values.licenceSection.trim()) {
      next.licenceSection = 'Select or enter the firearm licence section.';
    }

    if (stepKey === 'tracking') {
      if (!isValidDate(values.openedDate)) next.openedDate = 'Enter a valid date using YYYY-MM-DD.';
      if (values.targetSubmissionDate && !isValidDate(values.targetSubmissionDate)) next.targetSubmissionDate = 'Use YYYY-MM-DD.';
      const progress = Number.parseInt(values.progressPercent, 10);
      if (Number.isNaN(progress) || progress < 0 || progress > 100) next.progressPercent = 'Progress must be between 0 and 100.';
    }

    setErrors((current) => ({ ...current, ...next }));
    return Object.keys(next).length === 0;
  };

  const validateAll = (): boolean => {
    const keys = steps.filter((step) => step.key !== 'review').map((step) => step.key);
    for (const key of keys) {
      if (!validateStep(key)) {
        setStepIndex(steps.findIndex((step) => step.key === key));
        return false;
      }
    }
    return true;
  };

  const goNext = () => {
    if (!validateStep(currentStep.key)) return;
    setStepIndex((current) => Math.min(current + 1, steps.length - 1));
  };

  const goBack = () => {
    if (stepIndex === 0) {
      navigation.goBack();
      return;
    }
    setStepIndex((current) => Math.max(current - 1, 0));
  };

  const save = async () => {
    if (!validateAll() || !dealerProfile?.dealerId || !user?.id) return;
    setSaving(true);
    try {
      if (route.params.applicationCaseId) {
        await updateApplicationCase(route.params.applicationCaseId, dealerProfile.dealerId, route.params.clientId, user.id, values);
      } else {
        await createApplicationCase(dealerProfile.dealerId, route.params.clientId, user.id, values);
      }
      navigation.replace('ApplicationReadiness', { clientId: route.params.clientId });
    } catch (error) {
      Alert.alert(isEditing ? 'Unable to update application' : 'Unable to create application', error instanceof Error ? error.message : 'An unknown error occurred.');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !data) {
    return (
      <Screen scroll={false}>
        <View style={styles.loading}>
          <ActivityIndicator color={Colors.primary} size="large" />
          <Text style={styles.muted}>Loading application builder...</Text>
        </View>
      </Screen>
    );
  }

  const renderStep = () => {
    switch (currentStep.key) {
      case 'type':
        return (
          <Card title="Choose the application" subtitle="Start with the exact SAPS process being prepared. This choice controls every later requirement.">
            <View style={styles.grid}>
              {APPLICATION_CASE_TYPES.map((item) => {
                const selected = values.applicationType === item.value;
                return (
                  <Pressable
                    key={item.value}
                    onPress={() => selectApplicationType(item.value)}
                    style={({ pressed }) => [styles.option, selected && styles.selected, pressed && styles.pressed]}
                  >
                    {isCompetencyApplicationType(item.value)
                      ? <ShieldCheck color={selected ? Colors.white : Colors.primary} size={20} />
                      : <Target color={selected ? Colors.white : Colors.primary} size={20} />}
                    <Text style={[styles.optionTitle, selected && styles.selectedText]}>{item.label}</Text>
                    <Text style={styles.optionDescription}>{item.description}</Text>
                  </Pressable>
                );
              })}
            </View>
          </Card>
        );

      case 'subject':
        if (competencyApplication) {
          return (
            <Card title="Choose the competency category" subtitle="Select the competency being applied for, renewed or regularised.">
              <View style={styles.grid}>
                {COMPETENCY_CATEGORIES.map((category) => {
                  const selected = values.competencyCategory === category.value;
                  return (
                    <Pressable
                      key={category.value}
                      onPress={() => updateValue('competencyCategory', category.value)}
                      style={({ pressed }) => [styles.option, selected && styles.selected, pressed && styles.pressed]}
                    >
                      <ShieldCheck color={selected ? Colors.white : Colors.primary} size={20} />
                      <Text style={[styles.optionTitle, selected && styles.selectedText]}>{category.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </Card>
          );
        }

        return (
          <Card title="Choose the firearm" subtitle="The firearm record supplies the make, model, calibre, serial number and competency link.">
            {data.firearms.length === 0 ? (
              <View style={styles.empty}>
                <Target color={Colors.warning} size={30} />
                <Text style={styles.optionTitle}>No firearm captured</Text>
                <Text style={styles.muted}>Add the firearm first, then return to this application.</Text>
                <Button title="Add firearm" onPress={() => navigation.navigate('FirearmForm', { clientId: route.params.clientId })} />
              </View>
            ) : (
              <View style={styles.grid}>
                {data.firearms.map((firearm) => {
                  const selected = values.firearmId === firearm.id;
                  return (
                    <Pressable
                      key={firearm.id}
                      onPress={() => selectFirearm(firearm)}
                      style={({ pressed }) => [styles.option, selected && styles.selected, pressed && styles.pressed]}
                    >
                      <Target color={selected ? Colors.white : Colors.primary} size={20} />
                      <Text style={[styles.optionTitle, selected && styles.selectedText]}>{[firearm.make, firearm.model].filter(Boolean).join(' ')}</Text>
                      <Text style={styles.optionDescription}>{firearm.calibre} • {firearm.serial_number}</Text>
                      <Text style={styles.optionDescription}>Competency: {firearm.required_competency ?? 'Not linked'}</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
            <View style={styles.inlineActions}>
              <Button
                leftIcon={<Plus color={Colors.silver} size={18} />}
                onPress={() => navigation.navigate('FirearmForm', { clientId: route.params.clientId })}
                title="Add another firearm"
                variant="secondary"
              />
              <Button
                leftIcon={<ShieldCheck color={Colors.silver} size={18} />}
                onPress={() => navigation.navigate('CompetencyForm', {
                  clientId: route.params.clientId,
                  initialCategory: selectedFirearm?.required_competency ?? values.competencyCategory,
                })}
                title="Capture competency"
                variant="secondary"
              />
              <Button
                leftIcon={<FolderOpen color={Colors.silver} size={18} />}
                onPress={() => navigation.navigate('DocumentLibrary', { clientId: route.params.clientId })}
                title="Upload documents"
                variant="secondary"
              />
            </View>
            {errors.firearmId ? <Text style={styles.error}>{errors.firearmId}</Text> : null}
          </Card>
        );

      case 'source':
        return (
          <Card
            title={newFirearmApplication ? 'Choose the firearm source' : 'Confirm the existing firearm'}
            subtitle={newFirearmApplication ? 'Dealer and private-sale applications require different supporting documents.' : 'Renewals and reapplications use the firearm already linked to the client.'}
          >
            <View style={styles.grid}>
              {FIREARM_ACQUISITION_SOURCES
                .filter((item) => newFirearmApplication ? ['DEALER', 'PRIVATE_SELLER'].includes(item.value) : item.value === 'EXISTING_FIREARM')
                .map((item) => {
                  const selected = values.acquisitionSource === item.value;
                  const Icon = item.value === 'DEALER' ? Building2 : item.value === 'PRIVATE_SELLER' ? UserRound : Target;
                  return (
                    <Pressable
                      key={item.value}
                      onPress={() => selectSource(item.value)}
                      style={({ pressed }) => [styles.option, selected && styles.selected, pressed && styles.pressed]}
                    >
                      <Icon color={selected ? Colors.white : Colors.primary} size={20} />
                      <Text style={[styles.optionTitle, selected && styles.selectedText]}>{item.label}</Text>
                      <Text style={styles.optionDescription}>{item.description}</Text>
                    </Pressable>
                  );
                })}
            </View>
            {errors.acquisitionSource ? <Text style={styles.error}>{errors.acquisitionSource}</Text> : null}

            {['DEALER', 'PRIVATE_SELLER'].includes(values.acquisitionSource) ? (
              <View style={styles.fields}>
                <TextField required label={values.acquisitionSource === 'DEALER' ? 'Dealer name' : 'Private seller full name'} value={values.supplierName} onChangeText={(text) => updateValue('supplierName', text)} error={errors.supplierName} />
                <TextField label={values.acquisitionSource === 'DEALER' ? 'Dealer registration or reference' : 'Seller ID number'} value={values.supplierIdOrRegistration} onChangeText={(text) => updateValue('supplierIdOrRegistration', text)} />
                <TextField label="Contact number or email" value={values.supplierContact} onChangeText={(text) => updateValue('supplierContact', text)} />
                <TextField label={values.acquisitionSource === 'DEALER' ? 'Dealer licence number' : 'Seller firearm licence number'} value={values.supplierLicenceNumber} onChangeText={(text) => updateValue('supplierLicenceNumber', text)} />
                <TextField label={values.acquisitionSource === 'DEALER' ? 'Invoice or stock reference' : 'Sale agreement reference'} value={values.saleOrInvoiceReference} onChangeText={(text) => updateValue('saleOrInvoiceReference', text)} />
              </View>
            ) : null}
          </Card>
        );

      case 'purpose':
        return (
          <View style={styles.stack}>
            {firearmApplication ? (
              <Card title="Choose the licence section" subtitle="The section determines the motivation and supporting-document checklist.">
                <View style={styles.grid}>
                  {LICENCE_SECTIONS.map((section) => {
                    const selected = values.licenceSection.replace(/\D/g, '') === section.value;
                    return (
                      <Pressable
                        key={section.value}
                        onPress={() => updateValue('licenceSection', section.value)}
                        style={({ pressed }) => [styles.option, selected && styles.selected, pressed && styles.pressed]}
                      >
                        <FileText color={selected ? Colors.white : Colors.primary} size={20} />
                        <Text style={[styles.optionTitle, selected && styles.selectedText]}>{section.label}</Text>
                        <Text style={styles.optionDescription}>{section.description}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <TextField
                  label="Other section or clarification"
                  placeholder="For example: Section 17 or temporary authorisation"
                  value={['13', '15', '16'].includes(values.licenceSection) ? '' : values.licenceSection}
                  onChangeText={(text) => updateValue('licenceSection', text)}
                  error={errors.licenceSection}
                />
              </Card>
            ) : null}

            <Card title="Capture the motivation brief" subtitle="Record the intended use and strongest supporting facts. The full motivation document can be attached from Documents or prepared from the Reference Library.">
              <TextField
                multiline
                label="Motivation summary"
                placeholder="Intended use, experience, dedicated status, hunting or sport activity, self-defence circumstances, firearm suitability and supporting evidence..."
                value={values.motivationSummary}
                onChangeText={(text) => updateValue('motivationSummary', text)}
                style={styles.textArea}
              />
              <View style={styles.inlineActions}>
                <Button variant="secondary" title="Open Reference Library" onPress={() => navigation.navigate('ReferenceLibrary')} />
                <Button variant="secondary" title="Open client documents" onPress={() => navigation.navigate('DocumentLibrary', { clientId: route.params.clientId })} />
              </View>
            </Card>
          </View>
        );

      case 'tracking':
        return (
          <Card title="Set the work status" subtitle="Track preparation and submission. Readiness remains calculated from actual records and documents.">
            <Text style={styles.label}>Application status</Text>
            <View style={styles.grid}>
              {APPLICATION_CASE_STATUSES.map((item) => {
                const selected = values.status === item.value;
                return (
                  <Pressable
                    key={item.value}
                    onPress={() => selectStatus(item.value)}
                    style={({ pressed }) => [styles.smallOption, selected && styles.selected, pressed && styles.pressed]}
                  >
                    <Text style={[styles.optionTitle, selected && styles.selectedText]}>{item.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.fields}>
              <TextField required label="Opened date" value={values.openedDate} onChangeText={(text) => updateValue('openedDate', text)} error={errors.openedDate} placeholder="YYYY-MM-DD" />
              <TextField label="Target submission date" value={values.targetSubmissionDate} onChangeText={(text) => updateValue('targetSubmissionDate', text)} error={errors.targetSubmissionDate} placeholder="YYYY-MM-DD" />
              <TextField label="Police station / DFO" value={values.policeStation} onChangeText={(text) => updateValue('policeStation', text)} />
              <TextField label="Application reference" value={values.applicationReference} onChangeText={(text) => updateValue('applicationReference', text)} />
              <TextField label="Progress percentage" keyboardType="numeric" value={values.progressPercent} onChangeText={(text) => updateValue('progressPercent', text)} error={errors.progressPercent} />
              <TextField multiline label="Facilitator notes" value={values.dealerNotes} onChangeText={(text) => updateValue('dealerNotes', text)} style={styles.textArea} />
              <TextField multiline label="Client notes" value={values.clientNotes} onChangeText={(text) => updateValue('clientNotes', text)} style={styles.textArea} />
            </View>
          </Card>
        );

      case 'review':
      default:
        return (
          <Card title="Review the application" subtitle="Confirm the core workflow before LicenceGuard creates the case and calculates the document checklist.">
            <View style={styles.reviewGrid}>
              <ReviewRow label="Applicant" value={`${data.client.first_name} ${data.client.surname}`} />
              <ReviewRow label="Application" value={getApplicationCaseTypeLabel(values.applicationType)} />
              <ReviewRow label={competencyApplication ? 'Competency category' : 'Firearm'} value={competencyApplication ? selectedCompetencyLabel : selectedFirearm ? [selectedFirearm.make, selectedFirearm.model, selectedFirearm.calibre, selectedFirearm.serial_number].filter(Boolean).join(' • ') : 'Not selected'} />
              {firearmApplication ? <ReviewRow label="Licence section" value={values.licenceSection ? `Section ${values.licenceSection.replace(/^Section\s*/i, '')}` : 'Not selected'} /> : null}
              {firearmApplication ? <ReviewRow label="Firearm source" value={FIREARM_ACQUISITION_SOURCES.find((item) => item.value === values.acquisitionSource)?.label ?? values.acquisitionSource} /> : null}
              {['DEALER', 'PRIVATE_SELLER'].includes(values.acquisitionSource) ? <ReviewRow label={values.acquisitionSource === 'DEALER' ? 'Dealer' : 'Private seller'} value={values.supplierName || 'Not captured'} /> : null}
              <ReviewRow label="Status" value={APPLICATION_CASE_STATUSES.find((item) => item.value === values.status)?.label ?? values.status} />
              <ReviewRow label="Target submission" value={values.targetSubmissionDate || 'Not set'} />
              <ReviewRow label="Motivation brief" value={values.motivationSummary.trim() || 'Not captured yet'} fullWidth />
            </View>
            <View style={styles.reviewCallout}>
              <ClipboardCheck color={Colors.success} size={24} />
              <View style={styles.reviewCalloutText}>
                <Text style={styles.optionTitle}>Next: document readiness</Text>
                <Text style={styles.optionDescription}>After saving, LicenceGuard opens the readiness engine and shows the exact missing records and documents for this case.</Text>
              </View>
            </View>
          </Card>
        );
    }
  };

  return (
    <Screen keyboardAvoiding maxWidth={1100}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>{isEditing ? 'EDIT APPLICATION BUILDER' : 'NEW APPLICATION BUILDER'}</Text>
        <Text style={styles.title}>{data.client.first_name} {data.client.surname}</Text>
        <Text style={styles.muted}>Build the application in the same order it will be prepared: process, subject, source, purpose, tracking and readiness.</Text>
      </View>

      <View style={styles.stepper}>
        {steps.map((step, index) => {
          const active = index === stepIndex;
          const complete = index < stepIndex;
          return (
            <Pressable
              key={step.key}
              onPress={() => setStepIndex(index)}
              style={({ pressed }) => [styles.step, active && styles.activeStep, pressed && styles.pressed]}
            >
              <View style={[styles.stepNumber, (active || complete) && styles.activeStepNumber]}>
                {complete ? <CheckCircle2 color={Colors.white} size={16} /> : <Text style={[styles.stepNumberText, (active || complete) && styles.activeStepNumberText]}>{index + 1}</Text>}
              </View>
              <Text style={[styles.stepLabel, active && styles.activeStepLabel]}>{step.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {renderStep()}

      <View style={styles.actions}>
        <Button variant="secondary" leftIcon={<ChevronLeft color={Colors.silver} size={18} />} title={stepIndex === 0 ? 'Cancel' : 'Back'} onPress={goBack} />
        {currentStep.key === 'review' ? (
          <Button loading={saving} leftIcon={<Save color={Colors.white} size={18} />} title={isEditing ? 'Save and check readiness' : 'Create and check readiness'} onPress={() => void save()} />
        ) : (
          <Button rightIcon={<ChevronRight color={Colors.white} size={18} />} title="Continue" onPress={goNext} />
        )}
      </View>
    </Screen>
  );
}

function ReviewRow({ label, value, fullWidth = false }: { label: string; value: string; fullWidth?: boolean }) {
  return (
    <View style={[styles.reviewRow, fullWidth && styles.reviewRowFull]}>
      <Text style={styles.reviewLabel}>{label}</Text>
      <Text style={styles.reviewValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { gap: Spacing.sm, marginBottom: Spacing.lg },
  eyebrow: { ...Typography.eyebrow, color: Colors.primaryLight },
  title: { ...Typography.pageTitle, color: Colors.white },
  muted: { ...Typography.body, color: Colors.textMuted },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md },
  stack: { gap: Spacing.lg },
  stepper: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.lg },
  step: { flexGrow: 1, flexBasis: 130, minWidth: 110, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, backgroundColor: Colors.surfaceRaised },
  activeStep: { borderColor: Colors.primary, backgroundColor: Colors.primarySoft },
  stepNumber: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surfaceSoft, borderWidth: 1, borderColor: Colors.border },
  activeStepNumber: { backgroundColor: Colors.primary, borderColor: Colors.primaryLight },
  stepNumberText: { ...Typography.label, color: Colors.textMuted },
  activeStepNumberText: { color: Colors.white },
  stepLabel: { ...Typography.label, color: Colors.textMuted },
  activeStepLabel: { color: Colors.white },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },
  option: { flexGrow: 1, flexBasis: 280, minWidth: 240, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.lg, padding: Spacing.lg, gap: Spacing.sm, backgroundColor: Colors.surfaceSoft },
  smallOption: { flexGrow: 1, flexBasis: 180, minWidth: 150, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, padding: Spacing.md, gap: Spacing.sm, backgroundColor: Colors.surfaceSoft },
  selected: { borderColor: Colors.primary, backgroundColor: Colors.primaryDark },
  pressed: { opacity: 0.78 },
  optionTitle: { ...Typography.bodyStrong, color: Colors.white },
  selectedText: { color: Colors.white },
  optionDescription: { ...Typography.caption, color: Colors.textMuted },
  fields: { gap: Spacing.md, marginTop: Spacing.lg },
  label: { ...Typography.label, color: Colors.silver, marginBottom: Spacing.sm },
  textArea: { minHeight: 120 },
  empty: { alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.xl },
  error: { ...Typography.caption, color: Colors.danger, marginTop: Spacing.sm },
  inlineActions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md, marginTop: Spacing.md },
  reviewGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },
  reviewRow: { flexGrow: 1, flexBasis: 280, minWidth: 240, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, padding: Spacing.md, gap: Spacing.xs, backgroundColor: Colors.surfaceSoft },
  reviewRowFull: { flexBasis: '100%' },
  reviewLabel: { ...Typography.label, color: Colors.textMuted },
  reviewValue: { ...Typography.bodyStrong, color: Colors.white },
  reviewCallout: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, marginTop: Spacing.lg, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.success, borderRadius: Radius.lg, backgroundColor: Colors.surfaceSoft },
  reviewCalloutText: { flex: 1, gap: Spacing.xs },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: Spacing.md, marginTop: Spacing.xl, paddingBottom: Spacing.xl },
});