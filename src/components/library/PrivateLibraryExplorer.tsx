import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ChevronDown, ChevronRight, ExternalLink, FolderTree } from 'lucide-react-native';

import Button from '../Button';
import Card from '../Card';
import { getLocalIntelligenceFeatureFlags } from '../../intelligence/featureFlags';
import { createDocumentSignedUrl } from '../../services/documentService';
import { getClientPrivateLibrary } from '../../services/privateLibraryService';
import { Colors } from '../../theme/colors';
import { Radius } from '../../theme/radius';
import { Spacing } from '../../theme/spacing';
import { Typography } from '../../theme/typography';
import type { PrivateLibraryDocumentItem, PrivateLibraryFolder, PrivateLibraryModel } from '../../types/privateLibrary';
import { openExternalDocument } from '../../utils/openExternalDocument';

type Props = { clientId: string; applicationCaseId?: string };
const PRIVATE_LIBRARY_ENABLED = getLocalIntelligenceFeatureFlags().PRIVATE_LIBRARY_INTEGRATION;

export default function PrivateLibraryExplorer({ clientId, applicationCaseId }: Props) {
  const [model, setModel] = useState<PrivateLibraryModel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [documentType, setDocumentType] = useState('');
  const [firearmFilter, setFirearmFilter] = useState('');
  const [applicationFilter, setApplicationFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [openingId, setOpeningId] = useState<string | null>(null);

  useEffect(() => {
    if (!PRIVATE_LIBRARY_ENABLED) return;
    let active = true;
    void getClientPrivateLibrary(clientId)
      .then((result) => {
        if (active) setModel(result);
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : 'The private-library preview could not be loaded.');
      });
    return () => { active = false; };
  }, [clientId]);

  const visibleIds = useMemo(() => {
    if (!model) return new Set<string>();
    const typeNeedle = documentType.trim().toLowerCase();
    const firearmNeedle = firearmFilter.trim().toLowerCase();
    const applicationNeedle = applicationFilter.trim().toLowerCase();
    const statusNeedle = statusFilter.trim().toLowerCase();
    return new Set(model.items.filter((item) =>
      (!typeNeedle || item.documentType.toLowerCase().includes(typeNeedle))
      && (!firearmNeedle || `${item.firearm?.id ?? ''} ${item.firearm?.make ?? ''} ${item.firearm?.model ?? ''} ${item.firearm?.calibre ?? ''}`.toLowerCase().includes(firearmNeedle))
      && (!applicationNeedle || `${item.applicationCase?.id ?? ''} ${item.applicationCase?.application_type ?? ''}`.toLowerCase().includes(applicationNeedle))
      && (!statusNeedle || `${item.lifecycleState} ${item.verificationState}`.toLowerCase().includes(statusNeedle))
    ).map((item) => item.id));
  }, [applicationFilter, documentType, firearmFilter, model, statusFilter]);

  if (!PRIVATE_LIBRARY_ENABLED) return null;

  const openDocument = async (item: PrivateLibraryDocumentItem) => {
    setOpeningId(item.id);
    try {
      await openExternalDocument(
        () => createDocumentSignedUrl(item.document.storage_path),
        { clientId, applicationCaseId, originatingRoute: 'DocumentLibrary', workflowStep: 'private-library-preview' }
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The document could not be opened.');
    } finally {
      setOpeningId(null);
    }
  };

  return (
    <Card title="Private library preview">
      <Text style={styles.notice}>Metadata-driven preview — no files or records are moved or reclassified.</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {!model && !error ? <View style={styles.loading}><ActivityIndicator color={Colors.primary} /><Text style={styles.muted}>Building virtual folders...</Text></View> : null}
      {model ? (
        <>
          <View style={styles.summary}>
            <FolderTree color={Colors.primaryLight} size={18} />
            <Text style={styles.line}>{model.items.length} records · {model.unclassifiedItems.length} need review · {model.qualityIssues.length} metadata warnings</Text>
          </View>
          <View style={styles.filters}>
            <Filter value={documentType} onChange={setDocumentType} placeholder="Document type" />
            <Filter value={firearmFilter} onChange={setFirearmFilter} placeholder="Firearm" />
            <Filter value={applicationFilter} onChange={setApplicationFilter} placeholder="Application" />
            <Filter value={statusFilter} onChange={setStatusFilter} placeholder="Status" />
          </View>
          <View style={styles.folders}>
            {model.folders.map((folder) => (
              <FolderView
                expanded={expanded}
                folder={folder}
                key={folder.id}
                onOpen={(item) => void openDocument(item)}
                openingId={openingId}
                setExpanded={setExpanded}
                visibleIds={visibleIds}
              />
            ))}
          </View>
        </>
      ) : null}
    </Card>
  );
}

function Filter({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return <TextInput onChangeText={onChange} placeholder={placeholder} placeholderTextColor={Colors.silverDark} style={styles.filter} value={value} />;
}

function FolderView({ folder, expanded, setExpanded, visibleIds, onOpen, openingId }: {
  folder: PrivateLibraryFolder;
  expanded: Set<string>;
  setExpanded: React.Dispatch<React.SetStateAction<Set<string>>>;
  visibleIds: Set<string>;
  onOpen: (item: PrivateLibraryDocumentItem) => void;
  openingId: string | null;
}) {
  const visibleItems = folder.items.filter((item) => visibleIds.has(item.id));
  const childCount = folder.children.reduce((sum, child) => sum + countVisible(child, visibleIds), 0);
  const visibleCount = visibleItems.length + childCount;
  if (visibleCount === 0) return null;
  const isExpanded = expanded.has(folder.id);
  return (
    <View style={styles.folder}>
      <Pressable
        onPress={() => setExpanded((current) => {
          const next = new Set(current);
          if (next.has(folder.id)) next.delete(folder.id); else next.add(folder.id);
          return next;
        })}
        style={styles.folderHeader}
      >
        {isExpanded ? <ChevronDown color={Colors.primaryLight} size={18} /> : <ChevronRight color={Colors.primaryLight} size={18} />}
        <Text style={styles.folderTitle}>{folder.label}</Text>
        <Text style={styles.count}>{visibleCount}</Text>
      </Pressable>
      {isExpanded ? (
        <View style={styles.folderContents}>
          {folder.children.map((child) => (
            <FolderView expanded={expanded} folder={child} key={child.id} onOpen={onOpen} openingId={openingId} setExpanded={setExpanded} visibleIds={visibleIds} />
          ))}
          {visibleItems.map((item) => (
            <View key={item.id} style={styles.document}>
              <View style={styles.documentText}>
                <Text style={styles.documentTitle}>{item.documentName}</Text>
                <Text style={styles.line}>{item.documentType} · {item.provenance.kind} · {item.verificationState} · {item.lifecycleState}</Text>
                <Text style={styles.muted}>
                  Client: {item.clientId} · Firearm: {item.firearm ? `${item.firearm.make} ${item.firearm.model ?? item.firearm.calibre}` : 'None'} · Competency: {item.competency?.category ?? 'None'}
                </Text>
                <Text style={styles.muted}>
                  Application: {item.applicationCase?.application_type ?? 'None'} · Expiry: {item.expiryDate ?? 'Not recorded'}
                </Text>
                <Text style={styles.muted}>{item.classificationReason.explanation} ({item.classificationReason.confidence})</Text>
                <Text style={styles.muted}>Original: {item.originalFileName ?? 'Not recorded'} · Parent: {item.parentDocumentId ?? 'None'}</Text>
                {item.warnings.map((warning) => <Text key={warning.code} style={styles.warning}>{warning.detail}</Text>)}
              </View>
              <Button leftIcon={<ExternalLink color={Colors.silver} size={15} />} loading={openingId === item.id} onPress={() => onOpen(item)} size="small" title="Open" variant="secondary" />
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function countVisible(folder: PrivateLibraryFolder, visibleIds: Set<string>): number {
  return folder.items.filter((item) => visibleIds.has(item.id)).length
    + folder.children.reduce((sum, child) => sum + countVisible(child, visibleIds), 0);
}

const styles = StyleSheet.create({
  notice: { ...Typography.bodyStrong, color: Colors.primaryLight },
  error: { ...Typography.body, color: Colors.danger, marginTop: Spacing.sm },
  loading: { alignItems: 'center', flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
  muted: { ...Typography.caption, color: Colors.textMuted },
  line: { ...Typography.caption, color: Colors.silver },
  summary: { alignItems: 'center', flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.md },
  filter: { ...Typography.caption, backgroundColor: Colors.surfaceRaised, borderColor: Colors.border, borderRadius: Radius.md, borderWidth: 1, color: Colors.text, flexBasis: 150, flexGrow: 1, minHeight: 40, paddingHorizontal: Spacing.sm },
  folders: { gap: Spacing.sm, marginTop: Spacing.md },
  folder: { borderColor: Colors.border, borderRadius: Radius.md, borderWidth: 1, overflow: 'hidden' },
  folderHeader: { alignItems: 'center', backgroundColor: Colors.surfaceRaised, flexDirection: 'row', gap: Spacing.sm, padding: Spacing.sm },
  folderTitle: { ...Typography.bodyStrong, color: Colors.silver, flex: 1 },
  count: { ...Typography.caption, color: Colors.primaryLight, fontWeight: '800' },
  folderContents: { gap: Spacing.sm, padding: Spacing.sm },
  document: { alignItems: 'center', backgroundColor: Colors.surfaceSoft, borderRadius: Radius.md, flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md, padding: Spacing.sm },
  documentText: { flex: 1, minWidth: 250 },
  documentTitle: { ...Typography.bodyStrong, color: Colors.text },
  warning: { ...Typography.caption, color: Colors.warning },
});
