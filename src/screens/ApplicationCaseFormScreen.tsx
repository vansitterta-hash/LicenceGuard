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
  Edit3,
  FileCheck2,
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
  getApplicationCaseTypeLabel,
  isCompetencyApplicationType,
  isFirearmApplicationType,
  isNewFirearmLicenceApplication,
  type ApplicationCaseFormValues,
  type ApplicationCaseType,
  type FirearmAcquisitionSource,
} from '../types/applicationCase';
import type { ClientRecord } from '../types/client';
import { COMPETENCY_CATEGORIES, type CompetencyListItem } from '../types/competency';
import type { FirearmListItem } from '../types/firearm';
import type { RootStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'ApplicationCaseForm'>;
type WorkflowAction = NonNullable<RootStackParamList['ApplicationCaseForm']['workflowAction']>;

type FormData = {
  client: ClientRecord;
  competencies: CompetencyListItem[];
  firearms: FirearmListItem[];
};

const WORKFLOW_ACTION_CONFIG: Record<WorkflowAction, {
  applicationType: ApplicationCaseType;
  title: string;
  subtitle: string;
}> = {
  NEW_FIREARM_APPLICATION: {
    applicationType: 'FIREARM_LICENCE_ADDITIONAL_APPLICATION',
    title: 'New Firearm Application',
    subtitle: 'Choose the firearm and confirm the few details LicenceGuard cannot determine automatically.',
  },
  NEW_COMPETENCY: {
    applicationType: 'COMPETENCY_FIRST_APPLICATION',
    title: 'New Competency',
    subtitle: 'Choose the competency category. LicenceGuard will determine the documents and forms.',
  },
  FURTHER_COMPETENCY: {
    applicationType: 'COMPETENCY_ADDITIONAL_CATEGORY',
    title: 'Further Competency',
    subtitle: 'Choose the additional competency category required.',
  },
  FIREARM_RENEWAL: {
    applicationType: 'FIREARM_LICENCE_RENEWAL',
    title: 'Firearm Renewal',
    subtitle: 'Choose the licensed firearm. Existing licence information will be reused automatically.',
  },
  COMPETENCY_RENEWAL: {
    applicationType: 'COMPETENCY_RENEWAL',
    title: 'Competency Renewal',
    subtitle: 'Choose the competency being renewed. Existing certificate and date information will be reused.',
  },
};

const LICENCE_SECTIONS = [
  { value: '13', label: 'Section 13', description: 'Self-defence.' },
  { value: '15', label: 'Section 15', description: 'Occasional hunting or sport shooting.' },
  { value: '16', label: 'Section 16', description: 'Dedicated hunting or sport shooting.' },
];

const PURPOSE_SUGGESTIONS = [
  'Self-defence',
  'Occasional hunting',
  'Occasional sport shooting',
  'Dedicated hunting',
  'Dedicated sport shooting',
];

function today(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
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
  openedDate: today(),
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

export default function ApplicationCaseFormScreen({ navigation, route }: Props) {
  const { dealerProfile, user } = useAuth();
  const [data, setData] = useState<FormData | null>(null);
  const [values, setValues] = useState<ApplicationCaseFormValues>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const isEditing = Boolean(route.params.applicationCaseId);
  const workflowConfig = route.params.workflowAction
    ? WORKFLOW_ACTION_CONFIG[route.params.workflowAction]
    : null;
  const competencyApplication = isCompetencyApplicationType(values.applicationType);
  const firearmApplication = isFirearmApplicationType(values.applicationType);
  const newFirearmApplication = isNewFirearmLicenceApplication(values.applicationType);

  const loadData = useCallback(async () => {
    setLoading(true);
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
      } else if (workflowConfig) {
        const applicationType = route.params.workflowAction === 'NEW_FIREARM_APPLICATION'
          ? firearms.some((item) => Boolean(item.licence))
            ? 'FIREARM_LICENCE_ADDITIONAL_APPLICATION'
            : 'FIREARM_LICENCE_FIRST_APPLICATION'
          : workflowConfig.applicationType;
        setValues({
          ...EMPTY_FORM,
          applicationType,
          acquisitionSource: isCompetencyApplicationType(applicationType)
            ? 'NOT_APPLICABLE'
            : isNewFirearmLicenceApplication(applicationType)
              ? 'DEALER'
              : 'EXISTING_FIREARM',
        });
      }
    } catch (error) {
      Alert.alert('Unable to prepare application', error instanceof Error ? error.message : 'An unknown error occurred.');
    } finally {
      setLoading(false);
    }
  }, [route.params.applicationCaseId, route.params.clientId, route.params.workflowAction, workflowConfig]);

  useEffect(() => {
    void loadData();
    return navigation.addListener('focus', () => void loadData());
  }, [loadData, navigation]);

  const selectedFirearm = useMemo(
    () => data?.firearms.find((item) => item.id === values.firearmId) ?? null,
    [data?.firearms, values.firearmId]
  );

  const selectedCompetency = useMemo(
    () => data?.competencies.find((item) => item.id === values.competencyId) ?? null,
    [data?.competencies, values.competencyId]
  );

  const canContinue = competencyApplication
    ? Boolean(values.competencyCategory)
    : Boolean(values.firearmId && (!newFirearmApplication || values.licenceSection));

  const setField = <K extends keyof ApplicationCaseFormValues>(key: K, value: ApplicationCaseFormValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
  };

  const selectFirearm = (firearm: FirearmListItem) => {
    setValues((current) => ({
      ...current,
      firearmId: firearm.id,
      firearmLicenceId: firearm.licence?.id ?? '',
      licenceSection: current.applicationType === 'FIREARM_LICENCE_RENEWAL'
        ? firearm.licence?.licence_section ?? current.licenceSection
        : current.licenceSection,
      competencyCategory: firearm.required_competency,
    }));
  };

  const selectCompetency = (competency: CompetencyListItem) => {
    setValues((current) => ({
      ...current,
      competencyId: competency.id,
      competencyCategory: competency.category,
    }));
  };

  const save = async () => {
    if (!dealerProfile?.dealerId || !user?.id || !data) return;
    if (!canContinue) {
      Alert.alert('One detail is still needed', competencyApplication
        ? 'Choose a competency category.'
        : 'Choose a firearm and licence section.');
      return;
    }

    setSaving(true);
    try {
      const saved = route.params.applicationCaseId
        ? await updateApplicationCase(route.params.applicationCaseId, dealerProfile.dealerId, route.params.clientId, user.id, values)
        : await createApplicationCase(dealerProfile.dealerId, route.params.clientId, user.id, values);

      navigation.replace('ApplicationReadiness', {
        clientId: route.params.clientId,
        applicationCaseId: saved.id,
      });
    } catch (error) {
      Alert.alert('Unable to save application', error instanceof Error ? error.message : 'An unknown error occurred.');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !data) {
    return (
      <Screen scroll={false}>
        <View style={styles.loading}>
          <ActivityIndicator color={Colors.primary} size="large" />
          <Text style={styles.muted}>Preparing the client application...</Text>
        </View>
      </Screen>
    );
  }

  const title = workflowConfig?.title ?? getApplicationCaseTypeLabel(values.applicationType);
  const subtitle = workflowConfig?.subtitle ?? 'Update only the details that changed. LicenceGuard will reuse everything else.';

  return (
    <Screen maxWidth={960}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>APPLICATION ASSISTANT</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>

      <Card title={`${data.client.first_name} ${data.client.surname}`} subtitle="Client details are already loaded and will be used throughout the application.">
        <View style={styles.summaryRow}>
          <View style={styles.summaryIcon}><UserRound color={Colors.silver} size={20} /></View>
          <View style={styles.summaryText}>
            <Text style={styles.summaryPrimary}>ID {data.client.id_number}</Text>
            <Text style={styles.summarySecondary}>{data.client.email || data.client.cellphone || 'Contact details available in client record'}</Text>
          </View>
          <Button title="Edit" variant="secondary" size="small" leftIcon={<Edit3 color={Colors.silver} size={15} />} onPress={() => navigation.navigate('ClientForm', { clientId: data.client.id })} />
        </View>
      </Card>

      {firearmApplication ? (
        <Card title="Which firearm?" subtitle="Select an existing firearm, or add it now without losing this application.">
          <View style={styles.optionList}>
            {data.firearms.map((firearm) => {
              const selected = firearm.id === values.firearmId;
              return (
                <Pressable key={firearm.id} onPress={() => selectFirearm(firearm)} style={({ pressed }) => [styles.option, selected ? styles.optionSelected : null, pressed ? styles.pressed : null]}>
                  <View style={styles.optionIcon}><Target color={selected ? Colors.primaryLight : Colors.silverDark} size={20} /></View>
                  <View style={styles.optionText}>
                    <Text style={styles.optionTitle}>{[firearm.make, firearm.model, firearm.calibre].filter(Boolean).join(' · ')}</Text>
                    <Text style={styles.optionDetail}>Serial {firearm.serial_number}{firearm.licence?.licence_number ? ` · Licence ${firearm.licence.licence_number}` : ''}</Text>
                  </View>
                  {selected ? <CheckCircle2 color={Colors.success} size={21} /> : null}
                </Pressable>
              );
            })}
          </View>
          <View style={styles.inlineActions}>
            <Button title="Add firearm" variant="secondary" leftIcon={<Plus color={Colors.silver} size={17} />} onPress={() => navigation.navigate('FirearmForm', { clientId: route.params.clientId })} />
            {selectedFirearm ? <Button title="Edit selected firearm" variant="secondary" leftIcon={<Edit3 color={Colors.silver} size={17} />} onPress={() => navigation.navigate('FirearmForm', { clientId: route.params.clientId, firearmId: selectedFirearm.id })} /> : null}
          </View>
        </Card>
      ) : null}

      {competencyApplication ? (
        <Card title="Which competency?" subtitle={values.applicationType === 'COMPETENCY_RENEWAL' ? 'Select the existing competency being renewed.' : 'Choose the category required.'}>
          {values.applicationType === 'COMPETENCY_RENEWAL' ? (
            <View style={styles.optionList}>
              {data.competencies.map((competency) => {
                const selected = competency.id === values.competencyId;
                return (
                  <Pressable key={competency.id} onPress={() => selectCompetency(competency)} style={({ pressed }) => [styles.option, selected ? styles.optionSelected : null, pressed ? styles.pressed : null]}>
                    <View style={styles.optionIcon}><ShieldCheck color={selected ? Colors.primaryLight : Colors.silverDark} size={20} /></View>
                    <View style={styles.optionText}>
                      <Text style={styles.optionTitle}>{COMPETENCY_CATEGORIES.find((item) => item.value === competency.category)?.label ?? competency.category}</Text>
                      <Text style={styles.optionDetail}>{competency.certificate_number ? `Certificate ${competency.certificate_number}` : 'Certificate number not recorded'}{competency.issue_date ? ` · Issued ${competency.issue_date}` : ''}</Text>
                    </View>
                    {selected ? <CheckCircle2 color={Colors.success} size={21} /> : null}
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <View style={styles.optionList}>
              {COMPETENCY_CATEGORIES.map((category) => {
                const selected = category.value === values.competencyCategory;
                return (
                  <Pressable key={category.value} onPress={() => setValues((current) => ({ ...current, competencyCategory: category.value, competencyId: '' }))} style={({ pressed }) => [styles.option, selected ? styles.optionSelected : null, pressed ? styles.pressed : null]}>
                    <View style={styles.optionIcon}><ShieldCheck color={selected ? Colors.primaryLight : Colors.silverDark} size={20} /></View>
                    <View style={styles.optionText}><Text style={styles.optionTitle}>{category.label}</Text><Text style={styles.optionDetail}>{category.description}</Text></View>
                    {selected ? <CheckCircle2 color={Colors.success} size={21} /> : null}
                  </Pressable>
                );
              })}
            </View>
          )}
          <View style={styles.inlineActions}>
            <Button title="Add competency record" variant="secondary" leftIcon={<Plus color={Colors.silver} size={17} />} onPress={() => navigation.navigate('CompetencyForm', { clientId: route.params.clientId, initialCategory: values.competencyCategory })} />
            {selectedCompetency ? <Button title="Edit selected competency" variant="secondary" leftIcon={<Edit3 color={Colors.silver} size={17} />} onPress={() => navigation.navigate('CompetencyForm', { clientId: route.params.clientId, competencyId: selectedCompetency.id })} /> : null}
          </View>
        </Card>
      ) : null}

      {newFirearmApplication ? (
        <Card title="Application details" subtitle="These are the only application-specific details LicenceGuard cannot safely infer.">
          <Text style={styles.fieldLabel}>Purchase source</Text>
          <View style={styles.choiceRow}>
            <Choice label="Dealer" icon={<Building2 color={values.acquisitionSource === 'DEALER' ? Colors.white : Colors.silver} size={17} />} selected={values.acquisitionSource === 'DEALER'} onPress={() => setField('acquisitionSource', 'DEALER')} />
            <Choice label="Private sale" icon={<UserRound color={values.acquisitionSource === 'PRIVATE_SELLER' ? Colors.white : Colors.silver} size={17} />} selected={values.acquisitionSource === 'PRIVATE_SELLER'} onPress={() => setField('acquisitionSource', 'PRIVATE_SELLER')} />
          </View>

          <Text style={styles.fieldLabel}>Licence section</Text>
          <View style={styles.optionList}>
            {LICENCE_SECTIONS.map((section) => (
              <Pressable key={section.value} onPress={() => setField('licenceSection', section.value)} style={({ pressed }) => [styles.compactOption, values.licenceSection === section.value ? styles.optionSelected : null, pressed ? styles.pressed : null]}>
                <View><Text style={styles.optionTitle}>{section.label}</Text><Text style={styles.optionDetail}>{section.description}</Text></View>
                {values.licenceSection === section.value ? <CheckCircle2 color={Colors.success} size={20} /> : null}
              </Pressable>
            ))}
          </View>

          <Text style={styles.fieldLabel}>Purpose</Text>
          <View style={styles.purposeWrap}>
            {PURPOSE_SUGGESTIONS.map((purpose) => (
              <Pressable key={purpose} onPress={() => setField('motivationSummary', purpose)} style={({ pressed }) => [styles.purposeChip, values.motivationSummary === purpose ? styles.purposeChipSelected : null, pressed ? styles.pressed : null]}>
                <Text style={[styles.purposeText, values.motivationSummary === purpose ? styles.purposeTextSelected : null]}>{purpose}</Text>
              </Pressable>
            ))}
          </View>

          <TextField label={values.acquisitionSource === 'PRIVATE_SELLER' ? 'Seller name' : 'Dealer name'} value={values.supplierName} onChangeText={(value) => setField('supplierName', value)} placeholder="Optional if already contained in the uploaded sale document" />
          <TextField label="Invoice or sale reference" value={values.saleOrInvoiceReference} onChangeText={(value) => setField('saleOrInvoiceReference', value)} placeholder="Optional" />
        </Card>
      ) : null}

      {isEditing ? (
        <Card title="Application tracking" subtitle="Only update these fields when the application progresses.">
          <TextField label="Police station / DFO" value={values.policeStation} onChangeText={(value) => setField('policeStation', value)} />
          <TextField label="Application reference" value={values.applicationReference} onChangeText={(value) => setField('applicationReference', value)} />
          <TextField label="Notes" value={values.dealerNotes} onChangeText={(value) => setField('dealerNotes', value)} multiline />
        </Card>
      ) : null}

      <Card title="LicenceGuard will do the rest" subtitle="After you continue, the background engines will check competencies, reuse uploaded documents, select suitable motivations and firearm information, complete the SAPS forms, and show only what is missing.">
        <View style={styles.engineList}>
          <EngineLine text="Client and firearm details reused" />
          <EngineLine text="Correct forms and requirements selected" />
          <EngineLine text="Suitable motivation and firearm information matched" />
          <EngineLine text="Application readiness checked" />
        </View>
      </Card>

      <Button
        title={isEditing ? 'Save and Check Readiness' : 'Prepare Application'}
        size="large"
        fullWidth
        loading={saving}
        disabled={!canContinue}
        leftIcon={<Save color={Colors.white} size={19} />}
        onPress={() => void save()}
      />
    </Screen>
  );
}

function Choice({ label, selected, onPress, icon }: { label: string; selected: boolean; onPress: () => void; icon: React.ReactNode }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.choice, selected ? styles.choiceSelected : null, pressed ? styles.pressed : null]}>
      {icon}<Text style={[styles.choiceText, selected ? styles.choiceTextSelected : null]}>{label}</Text>
    </Pressable>
  );
}

function EngineLine({ text }: { text: string }) {
  return <View style={styles.engineLine}><FileCheck2 color={Colors.success} size={17} /><Text style={styles.engineText}>{text}</Text></View>;
}

const styles = StyleSheet.create({
  loading: { alignItems: 'center', flex: 1, gap: Spacing.md, justifyContent: 'center' },
  muted: { ...Typography.body, color: Colors.textMuted },
  header: { marginBottom: Spacing.xl },
  eyebrow: { ...Typography.eyebrow, color: Colors.primaryLight, marginBottom: Spacing.xs },
  title: { ...Typography.pageTitle, color: Colors.text },
  subtitle: { ...Typography.body, color: Colors.textMuted, marginTop: Spacing.sm, maxWidth: 760 },
  summaryRow: { alignItems: 'center', flexDirection: 'row', gap: Spacing.md },
  summaryIcon: { alignItems: 'center', backgroundColor: Colors.surfaceRaised, borderRadius: Radius.lg, height: 46, justifyContent: 'center', width: 46 },
  summaryText: { flex: 1 },
  summaryPrimary: { ...Typography.bodyStrong, color: Colors.text },
  summarySecondary: { ...Typography.caption, color: Colors.textMuted, marginTop: Spacing.xxs },
  optionList: { gap: Spacing.sm },
  option: { alignItems: 'center', backgroundColor: Colors.surfaceRaised, borderColor: Colors.border, borderRadius: Radius.lg, borderWidth: 1, flexDirection: 'row', gap: Spacing.md, padding: Spacing.md },
  compactOption: { alignItems: 'center', backgroundColor: Colors.surfaceRaised, borderColor: Colors.border, borderRadius: Radius.lg, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', padding: Spacing.md },
  optionSelected: { borderColor: Colors.primaryLight, backgroundColor: Colors.primarySoft },
  optionIcon: { alignItems: 'center', backgroundColor: Colors.surfaceSoft, borderRadius: Radius.md, height: 40, justifyContent: 'center', width: 40 },
  optionText: { flex: 1 },
  optionTitle: { ...Typography.bodyStrong, color: Colors.text },
  optionDetail: { ...Typography.caption, color: Colors.textMuted, marginTop: Spacing.xxs },
  inlineActions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.md },
  fieldLabel: { ...Typography.label, color: Colors.silver, marginBottom: Spacing.sm, marginTop: Spacing.md },
  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  choice: { alignItems: 'center', backgroundColor: Colors.surfaceRaised, borderColor: Colors.border, borderRadius: Radius.lg, borderWidth: 1, flexDirection: 'row', gap: Spacing.sm, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
  choiceSelected: { backgroundColor: Colors.primary, borderColor: Colors.primaryLight },
  choiceText: { ...Typography.bodyStrong, color: Colors.silver },
  choiceTextSelected: { color: Colors.white },
  purposeWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.md },
  purposeChip: { backgroundColor: Colors.surfaceRaised, borderColor: Colors.border, borderRadius: Radius.xl, borderWidth: 1, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  purposeChipSelected: { backgroundColor: Colors.primarySoft, borderColor: Colors.primaryLight },
  purposeText: { ...Typography.caption, color: Colors.silver },
  purposeTextSelected: { color: Colors.primaryLight, fontWeight: '700' },
  engineList: { gap: Spacing.sm },
  engineLine: { alignItems: 'center', flexDirection: 'row', gap: Spacing.sm },
  engineText: { ...Typography.body, color: Colors.textMuted },
  pressed: { opacity: 0.75 },
});
