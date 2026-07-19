import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Linking, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Archive, CheckCircle2, Printer, RefreshCw, TriangleAlert } from 'lucide-react-native';

import Button from '../components/Button';
import Card from '../components/Card';
import Screen from '../components/Screen';
import TextField from '../components/TextField';
import { useAuth } from '../context/AuthContext';
import { buildApplicationAutofillPackage } from '../services/applicationAutofillService';
import {
  archiveCompletedApplication,
  buildCompletedApplicationHtml,
  createReviewValues,
  printCompletedApplication,
  type ApplicationReviewValues,
} from '../services/generatedApplicationDocumentService';
import { Colors } from '../theme/colors';
import { Radius } from '../theme/radius';
import { Spacing } from '../theme/spacing';
import { Typography } from '../theme/typography';
import type { ApplicationAutofillPackage } from '../types/applicationAutofill';
import { mapApplicationToSapsTemplate } from '../engines/sapsFieldMappingEngine';
import type { RootStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'ApplicationAutofill'>;
type ReviewKey = keyof ApplicationReviewValues;

export default function ApplicationAutofillScreen({ navigation, route }: Props) {
  const { dealerProfile, user } = useAuth();
  const [data, setData] = useState<ApplicationAutofillPackage | null>(null);
  const [values, setValues] = useState<ApplicationReviewValues | null>(null);
  const [loading, setLoading] = useState(true);
  const [archiving, setArchiving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await buildApplicationAutofillPackage(route.params.clientId, route.params.applicationCaseId);
      setData(next);
      setValues(createReviewValues(next));
    } catch (error) {
      Alert.alert('Unable to build AutoFill data', error instanceof Error ? error.message : 'An unknown error occurred.');
    } finally {
      setLoading(false);
    }
  }, [route.params.applicationCaseId, route.params.clientId]);

  useEffect(() => {
    void load();
    return navigation.addListener('focus', () => void load());
  }, [load, navigation]);

  const setField = (key: ReviewKey, value: string) => {
    setValues((current) => current ? { ...current, [key]: value } : current);
  };

  const mappedDocument = useMemo(() => data && values ? mapApplicationToSapsTemplate(data, values) : null, [data, values]);
  const canFinalise = useMemo(() => Boolean(data?.canGenerate && values && mappedDocument?.missingRequiredFieldCount === 0), [data, mappedDocument, values]);

  const print = () => {
    if (!data || !values) return;
    try {
      printCompletedApplication(buildCompletedApplicationHtml(data, values));
    } catch (error) {
      Alert.alert('Unable to print completed application', error instanceof Error ? error.message : 'An unknown error occurred.');
    }
  };

  const archive = async () => {
    if (!data || !values || !dealerProfile || !user) return;
    setArchiving(true);
    try {
      await archiveCompletedApplication({
        dealerId: dealerProfile.dealerId,
        clientId: route.params.clientId,
        userId: user.id,
        data,
        values,
      });
      Alert.alert('Application archived', 'The completed review copy has been saved against this application case. The original template remains unchanged.');
    } catch (error) {
      Alert.alert('Unable to archive application', error instanceof Error ? error.message : 'An unknown error occurred.');
    } finally {
      setArchiving(false);
    }
  };

  if (loading || !data || !values) {
    return <Screen scroll={false}><View style={styles.loading}><ActivityIndicator color={Colors.primary} size="large" /><Text style={styles.muted}>Mapping application data...</Text></View></Screen>;
  }

  return (
    <Screen maxWidth={1080}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.eyebrow}>SAPS DOCUMENT AUTO-COMPLETION</Text>
          <Text style={styles.title}>{data.application.formLabel}</Text>
          <Text style={styles.muted}>{data.applicant.fullName} • {data.application.applicationTypeLabel}</Text>
        </View>
        <Button leftIcon={<RefreshCw color={Colors.silver} size={18} />} onPress={() => void load()} title="Reload captured data" variant="secondary" />
      </View>

      {mappedDocument ? <Card subtitle={`${mappedDocument.mappedFieldCount} fields mapped • ${mappedDocument.missingRequiredFieldCount} required fields missing`} title="Official SAPS template"><View style={styles.templateRow}><View style={styles.templateText}><Text style={styles.templateName}>{mappedDocument.template.name}</Text><Text style={styles.muted}>{mappedDocument.template.sourceAuthority} • {mappedDocument.template.versionLabel}</Text></View><Button onPress={() => void Linking.openURL(mappedDocument.template.sourceUrl)} title="Open official blank form" variant="secondary" /></View></Card> : null}

      <Card padding="large" style={[styles.statusCard, { borderColor: data.canGenerate ? Colors.success : Colors.danger }]}>
        <View style={styles.statusRow}>
          {data.canGenerate ? <CheckCircle2 color={Colors.success} size={34} /> : <TriangleAlert color={Colors.danger} size={34} />}
          <View style={styles.statusText}>
            <Text style={[styles.statusTitle, { color: data.canGenerate ? Colors.success : Colors.danger }]}>{data.canGenerate ? 'Review copy ready' : 'Auto-completion blocked'}</Text>
            <Text style={styles.muted}>{data.canGenerate ? 'Review and correct the mapped fields below, then print and archive the completed copy.' : `${data.blockingIssueCount} mandatory field${data.blockingIssueCount === 1 ? '' : 's'} must be completed first.`}</Text>
          </View>
          <View style={styles.actions}>
            <Button disabled={!canFinalise} leftIcon={<Printer color={Colors.white} size={18} />} onPress={print} title="Print / Save PDF" />
            <Button disabled={!canFinalise || !dealerProfile || !user} leftIcon={<Archive color={Colors.silver} size={18} />} loading={archiving} onPress={() => void archive()} title="Archive completed copy" variant="secondary" />
          </View>
        </View>
      </Card>

      {data.issues.length > 0 ? <Card subtitle="Blocking items must be corrected in the source record. Warnings should be checked before finalisation." title="Validation results"><View style={styles.issueList}>{data.issues.map((issue) => <View key={issue.key} style={[styles.issue, { borderColor: issue.severity === 'BLOCKING' ? Colors.danger : Colors.warning }]}><TriangleAlert color={issue.severity === 'BLOCKING' ? Colors.danger : Colors.warning} size={18} /><View style={styles.issueText}><Text style={styles.issueLabel}>{issue.label}</Text><Text style={styles.muted}>{issue.message}</Text></View><Text style={{ color: issue.severity === 'BLOCKING' ? Colors.danger : Colors.warning }}>{issue.severity}</Text></View>)}</View><Button onPress={() => navigation.navigate('ApplicationCaseForm', { clientId: route.params.clientId, applicationCaseId: route.params.applicationCaseId })} style={styles.editButton} title="Edit source application data" /></Card> : null}

      <EditSection title="Application" fields={[
        ['Police station / DFO', 'policeStation'], ['Application reference', 'applicationReference'], ['Motivation summary', 'motivationSummary', true],
      ]} values={values} setField={setField} />
      <EditSection title="Applicant" fields={[
        ['First names', 'firstName'], ['Surname', 'surname'], ['ID number', 'idNumber'], ['Cellphone', 'cellphone'], ['Alternate cellphone', 'alternateCellphone'], ['Email', 'email'], ['Residential address', 'residentialAddress'], ['Suburb', 'suburb'], ['Town / city', 'city'], ['Province', 'province'], ['Postal code', 'postalCode'],
      ]} values={values} setField={setField} />
      {data.firearm ? <EditSection title="Firearm and licence" fields={[
        ['Make', 'firearmMake'], ['Model', 'firearmModel'], ['Calibre', 'calibre'], ['Serial number', 'serialNumber'], ['Licence section', 'licenceSection'], ['Existing licence number', 'licenceNumber'],
      ]} values={values} setField={setField} /> : null}
      {data.competency ? <EditSection title="Competency" fields={[
        ['Category', 'competencyCategory'], ['Certificate number', 'competencyCertificateNumber'],
      ]} values={values} setField={setField} /> : null}
      {data.supplier ? <EditSection title="Dealer or private seller" fields={[
        ['Name', 'supplierName'], ['ID / registration', 'supplierIdOrRegistration'], ['Contact', 'supplierContact'], ['Dealer / seller licence number', 'supplierLicenceNumber'], ['Sale / invoice reference', 'saleOrInvoiceReference'],
      ]} values={values} setField={setField} /> : null}
    </Screen>
  );
}

function EditSection({ title, fields, values, setField }: {
  title: string;
  fields: Array<[string, ReviewKey, boolean?]>;
  values: ApplicationReviewValues;
  setField: (key: ReviewKey, value: string) => void;
}) {
  return <Card title={title}><View style={styles.grid}>{fields.map(([label, key, multiline]) => <TextField key={key} containerStyle={multiline ? styles.fullWidth : styles.field} label={label} multiline={multiline} onChangeText={(value) => setField(key, value)} value={values[key]} />)}</View></Card>;
}

const styles = StyleSheet.create({
  loading: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  header: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.lg, justifyContent: 'space-between', marginBottom: Spacing.xxl },
  headerText: { flex: 1, minWidth: 260 },
  eyebrow: { ...Typography.eyebrow, color: Colors.primary },
  title: { ...Typography.pageTitle, color: Colors.white, marginBottom: Spacing.xs, marginTop: Spacing.xxs },
  muted: { ...Typography.body, color: Colors.textMuted },
  statusCard: { borderWidth: 1, marginBottom: Spacing.lg },
  statusRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.lg },
  statusText: { flex: 1, minWidth: 240 },
  statusTitle: { ...Typography.sectionTitle, marginBottom: Spacing.xs },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  templateRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.lg },
  templateText: { flex: 1, minWidth: 260 },
  templateName: { ...Typography.bodyStrong, color: Colors.white, marginBottom: Spacing.xs },
  issueList: { gap: Spacing.sm },
  issue: { alignItems: 'center', backgroundColor: Colors.surfaceRaised, borderRadius: Radius.md, borderWidth: 1, flexDirection: 'row', gap: Spacing.md, padding: Spacing.md },
  issueText: { flex: 1 },
  issueLabel: { ...Typography.bodyStrong, color: Colors.white },
  editButton: { marginTop: Spacing.lg },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.lg },
  field: { flexBasis: 320, flexGrow: 1 },
  fullWidth: { flexBasis: '100%' },
});
