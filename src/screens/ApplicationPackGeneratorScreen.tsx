import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AlertTriangle, CheckCircle2, FileOutput, FolderOpen, Printer, RefreshCw } from 'lucide-react-native';

import Button from '../components/Button';
import Card from '../components/Card';
import Screen from '../components/Screen';
import { useAuth } from '../context/AuthContext';
import { buildApplicationPackHtml, getApplicationPackData, openApplicationPackHtml } from '../services/applicationPackService';
import { Colors } from '../theme/colors';
import { Radius } from '../theme/radius';
import { Spacing } from '../theme/spacing';
import { Typography } from '../theme/typography';
import type { ApplicationPackData } from '../types/applicationPack';
import type { RootStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'ApplicationPackGenerator'>;

export default function ApplicationPackGeneratorScreen({ navigation, route }: Props) {
  const { dealerProfile } = useAuth();
  const [data, setData] = useState<ApplicationPackData | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await getApplicationPackData(route.params.clientId, route.params.applicationCaseId));
    } catch (error) {
      Alert.alert('Unable to prepare application pack', error instanceof Error ? error.message : 'An unknown error occurred.');
    } finally {
      setLoading(false);
    }
  }, [route.params.applicationCaseId, route.params.clientId]);

  useEffect(() => {
    void load();
    return navigation.addListener('focus', () => void load());
  }, [load, navigation]);

  const readyDocuments = data?.documents.length ?? 0;
  const statusColor = data?.readyToGenerate ? Colors.success : Colors.warning;
  const generationMessage = useMemo(() => {
    if (!data) return '';
    if (data.readyToGenerate) return 'All mandatory readiness checks have passed. The pack can be printed or saved as PDF.';
    return 'A draft pack can still be reviewed, but missing, expired or unverified items must be resolved before submission.';
  }, [data]);

  const generate = async () => {
    if (!data) return;
    setGenerating(true);
    try {
      const html = buildApplicationPackHtml(data, dealerProfile?.dealerName ?? 'LicenceGuard');
      openApplicationPackHtml(html);
    } catch (error) {
      Alert.alert('Unable to open application pack', error instanceof Error ? error.message : 'An unknown error occurred.');
    } finally {
      setGenerating(false);
    }
  };

  if (loading || !data) {
    return <Screen scroll={false}><View style={styles.loading}><ActivityIndicator color={Colors.primary} size="large"/><Text style={styles.muted}>Preparing application pack...</Text></View></Screen>;
  }

  return (
    <Screen maxWidth={1120}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>APPLICATION PACK GENERATOR</Text>
          <Text style={styles.title}>{data.client.fullName}</Text>
          <Text style={styles.subtitle}>{data.applicationTypeLabel}</Text>
        </View>
        <Button leftIcon={<RefreshCw color={Colors.silver} size={18}/>} onPress={() => void load()} title="Refresh" variant="secondary"/>
      </View>

      <Card padding="large" style={[styles.statusCard, { borderColor: statusColor }]}> 
        <View style={styles.statusRow}>
          <View style={[styles.iconCircle, { backgroundColor: data.readyToGenerate ? 'rgba(40,199,111,0.12)' : 'rgba(255,193,7,0.12)' }]}>
            {data.readyToGenerate ? <CheckCircle2 color={Colors.success} size={30}/> : <AlertTriangle color={Colors.warning} size={30}/>} 
          </View>
          <View style={styles.statusCopy}>
            <Text style={[styles.statusTitle, { color: statusColor }]}>{data.readyToGenerate ? 'READY TO GENERATE' : 'DRAFT PACK - ACTION REQUIRED'}</Text>
            <Text style={styles.muted}>{generationMessage}</Text>
          </View>
          <View style={styles.scoreBlock}><Text style={[styles.score, { color: statusColor }]}>{data.readinessScore}%</Text><Text style={styles.caption}>readiness</Text></View>
        </View>
      </Card>

      <View style={styles.metrics}>
        <Metric label="Pack documents" value={String(readyDocuments)}/>
        <Metric label="Missing required" value={String(data.missingRequiredItems.length)}/>
        <Metric label="Warnings" value={String(data.warnings.length)}/>
      </View>

      {data.missingRequiredItems.length > 0 ? <Card style={styles.warningCard}><Text style={styles.cardTitle}>Missing required items</Text>{data.missingRequiredItems.map((item) => <Text key={item} style={styles.warningText}>• {item}</Text>)}</Card> : null}

      <Card padding="large">
        <View style={styles.sectionHeader}><View><Text style={styles.cardTitle}>Pack contents</Text><Text style={styles.muted}>Documents are ordered according to the readiness checklist.</Text></View><Button leftIcon={<FolderOpen color={Colors.silver} size={18}/>} onPress={() => navigation.navigate('DocumentLibrary', { clientId: data.clientId })} title="Manage documents" variant="secondary"/></View>
        {data.documents.length === 0 ? <Text style={styles.empty}>No eligible documents are currently linked to this client or application case.</Text> : data.documents.map((document) => <View key={document.documentId} style={styles.documentRow}><View style={styles.order}><Text style={styles.orderText}>{document.order}</Text></View><View style={styles.documentCopy}><Text style={styles.documentTitle}>{document.requirementLabel}</Text><Text style={styles.muted}>{document.documentName}</Text></View><Text style={[styles.badge, { color: document.isVerified ? Colors.success : Colors.warning }]}>{document.isVerified ? 'VERIFIED' : 'UNVERIFIED'}</Text></View>)}
      </Card>

      <Card padding="large">
        <Text style={styles.cardTitle}>Output</Text>
        <Text style={styles.muted}>LicenceGuard creates a print-ready cover page, client particulars, readiness checklist and indexed secure links to the supporting documents. In the browser, choose Print and then Save as PDF.</Text>
        <View style={styles.actions}>
          <Button leftIcon={<Printer color={Colors.white} size={18}/>} loading={generating} onPress={() => void generate()} title={data.readyToGenerate ? 'Generate application pack' : 'Generate draft pack'}/>
          <Button leftIcon={<FileOutput color={Colors.silver} size={18}/>} onPress={() => navigation.navigate('ApplicationReadiness', { clientId: data.clientId })} title="Return to readiness" variant="secondary"/>
        </View>
      </Card>
    </Screen>
  );
}

function Metric({ label, value }: { label: string; value: string }) { return <Card style={styles.metric}><Text style={styles.metricValue}>{value}</Text><Text style={styles.caption}>{label}</Text></Card>; }

const styles = StyleSheet.create({
  loading:{flex:1,alignItems:'center',justifyContent:'center',gap:Spacing.md}, muted:{...Typography.body,color:Colors.textMuted}, header:{flexDirection:'row',justifyContent:'space-between',alignItems:'flex-start',gap:Spacing.lg,marginBottom:Spacing.lg,flexWrap:'wrap'}, headerCopy:{flex:1,minWidth:280}, eyebrow:{...Typography.eyebrow,color:Colors.primary}, title:{...Typography.pageTitle,color:Colors.white,marginTop:Spacing.xs}, subtitle:{...Typography.body,color:Colors.textMuted,marginTop:Spacing.xs}, statusCard:{borderWidth:1}, statusRow:{flexDirection:'row',alignItems:'center',gap:Spacing.lg,flexWrap:'wrap'}, iconCircle:{width:58,height:58,borderRadius:Radius.pill,alignItems:'center',justifyContent:'center'}, statusCopy:{flex:1,minWidth:240}, statusTitle:{...Typography.sectionTitle}, scoreBlock:{alignItems:'flex-end'}, score:{...Typography.metric,fontSize:40}, caption:{...Typography.caption,color:Colors.textMuted}, metrics:{flexDirection:'row',gap:Spacing.md,flexWrap:'wrap',marginVertical:Spacing.lg}, metric:{flex:1,minWidth:160}, metricValue:{...Typography.metric,color:Colors.white}, warningCard:{borderColor:Colors.warning,borderWidth:1,marginBottom:Spacing.lg}, warningText:{...Typography.body,color:Colors.warning,marginTop:Spacing.xs}, cardTitle:{...Typography.cardTitle,color:Colors.white}, sectionHeader:{flexDirection:'row',justifyContent:'space-between',gap:Spacing.md,alignItems:'center',flexWrap:'wrap',marginBottom:Spacing.md}, empty:{...Typography.body,color:Colors.textMuted,paddingVertical:Spacing.xl,textAlign:'center'}, documentRow:{flexDirection:'row',alignItems:'center',gap:Spacing.md,borderTopColor:Colors.border,borderTopWidth:1,paddingVertical:Spacing.md}, order:{width:34,height:34,borderRadius:Radius.pill,backgroundColor:Colors.primarySoft,alignItems:'center',justifyContent:'center'}, orderText:{...Typography.caption,color:Colors.primary,fontWeight:'900'}, documentCopy:{flex:1}, documentTitle:{...Typography.body,color:Colors.white,fontWeight:'800'}, badge:{...Typography.caption,fontWeight:'900'}, actions:{flexDirection:'row',gap:Spacing.md,flexWrap:'wrap',marginTop:Spacing.lg},
});
