import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { CheckCircle2, FileOutput, Printer, RefreshCw, TriangleAlert } from 'lucide-react-native';

import Button from '../components/Button';
import Card from '../components/Card';
import Screen from '../components/Screen';
import { buildApplicationAutofillPackage, printApplicationAutofillPackage } from '../services/applicationAutofillService';
import { Colors } from '../theme/colors';
import { Radius } from '../theme/radius';
import { Spacing } from '../theme/spacing';
import { Typography } from '../theme/typography';
import type { ApplicationAutofillPackage } from '../types/applicationAutofill';
import type { RootStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'ApplicationAutofill'>;

export default function ApplicationAutofillScreen({ navigation, route }: Props) {
  const [data, setData] = useState<ApplicationAutofillPackage | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await buildApplicationAutofillPackage(route.params.clientId, route.params.applicationCaseId));
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

  const print = () => {
    if (!data) return;
    try {
      printApplicationAutofillPackage(data);
    } catch (error) {
      Alert.alert('Unable to generate form worksheet', error instanceof Error ? error.message : 'An unknown error occurred.');
    }
  };

  if (loading || !data) {
    return <Screen scroll={false}><View style={styles.loading}><ActivityIndicator color={Colors.primary} size="large" /><Text style={styles.muted}>Mapping application data...</Text></View></Screen>;
  }

  return (
    <Screen maxWidth={1080}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.eyebrow}>APPLICATION AUTOFILL ENGINE</Text>
          <Text style={styles.title}>{data.application.formLabel}</Text>
          <Text style={styles.muted}>{data.applicant.fullName} • {data.application.applicationTypeLabel}</Text>
        </View>
        <Button leftIcon={<RefreshCw color={Colors.silver} size={18} />} onPress={() => void load()} title="Rebuild" variant="secondary" />
      </View>

      <Card padding="large" style={[styles.statusCard, { borderColor: data.canGenerate ? Colors.success : Colors.danger }]}>
        <View style={styles.statusRow}>
          {data.canGenerate ? <CheckCircle2 color={Colors.success} size={34} /> : <TriangleAlert color={Colors.danger} size={34} />}
          <View style={styles.statusText}>
            <Text style={[styles.statusTitle, { color: data.canGenerate ? Colors.success : Colors.danger }]}>{data.canGenerate ? 'AutoFill ready' : 'AutoFill blocked'}</Text>
            <Text style={styles.muted}>{data.canGenerate ? 'All mandatory mapped fields are present. Generate the printable checking worksheet.' : `${data.blockingIssueCount} mandatory field${data.blockingIssueCount === 1 ? '' : 's'} must be completed first.`}</Text>
          </View>
          <Button disabled={!data.canGenerate} leftIcon={<Printer color={Colors.white} size={18} />} onPress={print} title="Generate form worksheet" />
        </View>
      </Card>

      {data.issues.length > 0 ? (
        <Card subtitle="Blocking items must be resolved. Warnings should be checked before signature." title="Validation results">
          <View style={styles.issueList}>{data.issues.map((issue) => (
            <View key={issue.key} style={[styles.issue, { borderColor: issue.severity === 'BLOCKING' ? Colors.danger : Colors.warning }]}>
              <TriangleAlert color={issue.severity === 'BLOCKING' ? Colors.danger : Colors.warning} size={18} />
              <View style={styles.issueText}><Text style={styles.issueLabel}>{issue.label}</Text><Text style={styles.muted}>{issue.message}</Text></View>
              <Text style={{ color: issue.severity === 'BLOCKING' ? Colors.danger : Colors.warning }}>{issue.severity}</Text>
            </View>
          ))}</View>
          <Button leftIcon={<FileOutput color={Colors.white} size={18} />} onPress={() => navigation.navigate('ApplicationCaseForm', { clientId: route.params.clientId, applicationCaseId: route.params.applicationCaseId })} style={styles.editButton} title="Edit application data" />
        </Card>
      ) : null}

      <DataSection title="Applicant" rows={[
        ['Full name', data.applicant.fullName], ['ID number', data.applicant.idNumber], ['Cellphone', data.applicant.cellphone], ['Email', data.applicant.email], ['Address', [data.applicant.residentialAddress, data.applicant.suburb, data.applicant.city, data.applicant.province, data.applicant.postalCode].filter(Boolean).join(', ')],
      ]} />

      {data.firearm ? <DataSection title="Firearm and licence" rows={[
        ['Firearm', [data.firearm.make, data.firearm.model].filter(Boolean).join(' ')], ['Calibre', data.firearm.calibre], ['Serial number', data.firearm.serialNumber], ['Licence section', data.firearm.licenceSection], ['Existing licence', data.firearm.licenceNumber], ['Expiry date', data.firearm.licenceExpiryDate],
      ]} /> : null}

      {data.competency ? <DataSection title="Competency" rows={[
        ['Category', data.competency.category ?? ''], ['Certificate number', data.competency.certificateNumber], ['Issue date', data.competency.issueDate], ['Expiry date', data.competency.expiryDate],
      ]} /> : null}

      {data.supplier ? <DataSection title="Supplier or seller" rows={[
        ['Source', data.supplier.acquisitionSource], ['Name', data.supplier.name], ['ID / registration', data.supplier.idOrRegistration], ['Contact', data.supplier.contact], ['Dealer licence', data.supplier.dealerLicenceNumber], ['Sale / invoice reference', data.supplier.saleOrInvoiceReference],
      ]} /> : null}
    </Screen>
  );
}

function DataSection({ title, rows }: { title: string; rows: Array<[string, string]> }) {
  return <Card title={title}><View style={styles.rows}>{rows.map(([label, value]) => <View key={label} style={styles.row}><Text style={styles.rowLabel}>{label}</Text><Text style={styles.rowValue}>{value || 'Not recorded'}</Text></View>)}</View></Card>;
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
  issueList: { gap: Spacing.sm },
  issue: { alignItems: 'center', backgroundColor: Colors.surfaceRaised, borderRadius: Radius.md, borderWidth: 1, flexDirection: 'row', gap: Spacing.md, padding: Spacing.md },
  issueText: { flex: 1 },
  issueLabel: { ...Typography.bodyStrong, color: Colors.white },
  editButton: { marginTop: Spacing.lg },
  rows: { gap: Spacing.xs },
  row: { borderBottomColor: Colors.border, borderBottomWidth: 1, flexDirection: 'row', gap: Spacing.lg, paddingVertical: Spacing.sm },
  rowLabel: { ...Typography.bodyStrong, color: Colors.silver, width: 180 },
  rowValue: { ...Typography.body, color: Colors.text, flex: 1 },
});