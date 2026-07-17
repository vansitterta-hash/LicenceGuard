import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as DocumentPicker from 'expo-document-picker';
import {
  Archive,
  BadgeCheck,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Clock3,
  ExternalLink,
  FileCheck2,
  FilePlus2,
  FileText,
  FolderOpen,
  ShieldAlert,
  Upload,
  X,
} from 'lucide-react-native';

import Button from '../components/Button';
import Card from '../components/Card';
import Screen from '../components/Screen';
import { useAuth } from '../context/AuthContext';
import { getClient } from '../services/clientService';
import {
  archiveDocument,
  createDocumentSignedUrl,
  listClientDocuments,
  setDocumentVerified,
  summariseClientDocuments,
  uploadClientDocument,
  type DocumentUploadFile,
} from '../services/documentService';
import { Colors } from '../theme/colors';
import { Radius } from '../theme/radius';
import { Spacing } from '../theme/spacing';
import { Typography } from '../theme/typography';
import type { ClientRecord } from '../types/client';
import {
  DOCUMENT_TYPE_OPTIONS,
  getDocumentTypeLabel,
  type ClientDocumentSummary,
  type DocumentRecord,
  type DocumentType,
} from '../types/document';
import type { RootStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<
  RootStackParamList,
  'DocumentLibrary'
>;

type ScreenData = {
  client: ClientRecord;
  documents: DocumentRecord[];
  summary: ClientDocumentSummary;
};

type UploadFormState = {
  documentType: DocumentType;
  documentName: string;
  documentDate: string;
  expiryDate: string;
  issuedBy: string;
  referenceNumber: string;
  notes: string;
  file: DocumentUploadFile | null;
};

const EMPTY_UPLOAD_FORM: UploadFormState = {
  documentType: 'ID_COPY',
  documentName: '',
  documentDate: '',
  expiryDate: '',
  issuedBy: '',
  referenceNumber: '',
  notes: '',
  file: null,
};

const DAY_IN_MILLISECONDS = 86_400_000;

export default function DocumentLibraryScreen({
  route,
}: Props) {
  const { dealerProfile, user } = useAuth();
  const { width } = useWindowDimensions();

  const [data, setData] = useState<ScreenData | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [includeArchived, setIncludeArchived] =
    useState(false);
  const [uploadVisible, setUploadVisible] =
    useState(false);
  const [typePickerVisible, setTypePickerVisible] =
    useState(false);
  const [uploading, setUploading] = useState(false);
  const [workingDocumentId, setWorkingDocumentId] =
    useState<string | null>(null);
  const [form, setForm] =
    useState<UploadFormState>(EMPTY_UPLOAD_FORM);

  const isCompact = width < 780;

  const loadData = useCallback(
    async (showLoader = true) => {
      if (showLoader) {
        setLoading(true);
      }

      try {
        const [client, documents] = await Promise.all([
          getClient(route.params.clientId),
          listClientDocuments(
            route.params.clientId,
            includeArchived
          ),
        ]);

        setData({
          client,
          documents,
          summary: summariseClientDocuments(documents),
        });
      } catch (error) {
        Alert.alert(
          'Unable to load document library',
          error instanceof Error
            ? error.message
            : 'An unknown error occurred.'
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [includeArchived, route.params.clientId]
  );

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const activeDocuments = useMemo(
    () =>
      data?.documents.filter(
        (document) =>
          document.lifecycle_status === 'ACTIVE'
      ) ?? [],
    [data]
  );

  const archivedDocuments = useMemo(
    () =>
      data?.documents.filter(
        (document) =>
          document.lifecycle_status !== 'ACTIVE'
      ) ?? [],
    [data]
  );

  const updateForm = <K extends keyof UploadFormState,>(
    key: K,
    value: UploadFormState[K]
  ) => {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const chooseFile = async () => {
    try {
      const result =
        await DocumentPicker.getDocumentAsync({
          copyToCacheDirectory: true,
          multiple: false,
          type: [
            'application/pdf',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'image/jpeg',
            'image/png',
            'image/webp',
          ],
        });

      if (result.canceled) {
        return;
      }

      const asset = result.assets[0];

      if (!asset) {
        return;
      }

      const selectedFile: DocumentUploadFile = {
        uri: asset.uri,
        name: asset.name,
        mimeType: asset.mimeType ?? null,
        size: asset.size ?? null,
      };

      setForm((current) => ({
        ...current,
        file: selectedFile,
        documentName:
          current.documentName.trim().length > 0
            ? current.documentName
            : asset.name.replace(/\.[^/.]+$/, ''),
      }));
    } catch (error) {
      Alert.alert(
        'Unable to select document',
        error instanceof Error
          ? error.message
          : 'An unknown error occurred.'
      );
    }
  };

  const resetUpload = () => {
    setForm(EMPTY_UPLOAD_FORM);
    setTypePickerVisible(false);
    setUploadVisible(false);
  };

  const submitUpload = async () => {
    if (
      !dealerProfile?.dealerId ||
      !user?.id ||
      !form.file
    ) {
      Alert.alert(
        'Document required',
        'Select a document before uploading.'
      );
      return;
    }

    if (!form.documentName.trim()) {
      Alert.alert(
        'Document name required',
        'Enter a clear name for this document.'
      );
      return;
    }

    setUploading(true);

    try {
      await uploadClientDocument({
        dealerId: dealerProfile.dealerId,
        clientId: route.params.clientId,
        userId: user.id,
        documentType: form.documentType,
        documentName: form.documentName,
        documentDate: form.documentDate,
        expiryDate: form.expiryDate,
        issuedBy: form.issuedBy,
        referenceNumber: form.referenceNumber,
        notes: form.notes,
        file: form.file,
      });

      resetUpload();
      await loadData(false);
    } catch (error) {
      Alert.alert(
        'Unable to upload document',
        error instanceof Error
          ? error.message
          : 'An unknown error occurred.'
      );
    } finally {
      setUploading(false);
    }
  };

  const openDocument = async (
    document: DocumentRecord
  ) => {
    setWorkingDocumentId(document.id);

    try {
      const signedUrl =
        await createDocumentSignedUrl(
          document.storage_path
        );

      const supported = await Linking.canOpenURL(
        signedUrl
      );

      if (!supported) {
        throw new Error(
          'This device cannot open the secure document link.'
        );
      }

      await Linking.openURL(signedUrl);
    } catch (error) {
      Alert.alert(
        'Unable to open document',
        error instanceof Error
          ? error.message
          : 'An unknown error occurred.'
      );
    } finally {
      setWorkingDocumentId(null);
    }
  };

  const toggleVerification = async (
    document: DocumentRecord
  ) => {
    if (!user?.id) {
      return;
    }

    setWorkingDocumentId(document.id);

    try {
      await setDocumentVerified(
        document.id,
        !document.is_verified,
        user.id
      );

      await loadData(false);
    } catch (error) {
      Alert.alert(
        'Unable to update verification',
        error instanceof Error
          ? error.message
          : 'An unknown error occurred.'
      );
    } finally {
      setWorkingDocumentId(null);
    }
  };

  const confirmArchive = (
    document: DocumentRecord
  ) => {
    if (!user?.id) {
      return;
    }

    Alert.alert(
      'Archive document',
      `Archive "${document.document_name}"? The file will remain securely stored and can be shown again from archived documents.`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Archive',
          style: 'destructive',
          onPress: async () => {
            if (!user?.id) {
              return;
            }

            setWorkingDocumentId(document.id);

            try {
              await archiveDocument(
                document.id,
                user.id,
                'Archived from the Document Library.'
              );

              await loadData(false);
            } catch (error) {
              Alert.alert(
                'Unable to archive document',
                error instanceof Error
                  ? error.message
                  : 'An unknown error occurred.'
              );
            } finally {
              setWorkingDocumentId(null);
            }
          },
        },
      ]
    );
  };

  if (loading || !data) {
    return (
      <Screen scroll={false}>
        <View style={styles.loadingState}>
          <ActivityIndicator
            color={Colors.primary}
            size="large"
          />

          <Text style={styles.loadingText}>
            Loading document library...
          </Text>
        </View>
      </Screen>
    );
  }

  const { client, summary } = data;

  return (
    <>
      <Screen
        maxWidth={1160}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={Colors.primary}
            onRefresh={() => {
              setRefreshing(true);
              void loadData(false);
            }}
          />
        }
      >
        <View
          style={[
            styles.header,
            isCompact ? styles.headerCompact : null,
          ]}
        >
          <View style={styles.headerContent}>
            <Text style={styles.eyebrow}>
              DOCUMENT LIBRARY
            </Text>

            <Text style={styles.title}>
              {client.first_name} {client.surname}
            </Text>

            <Text style={styles.subtitle}>
              Securely store, verify and reuse every
              document required for firearm and
              competency applications.
            </Text>
          </View>

          <Button
            leftIcon={
              <Upload
                color={Colors.white}
                size={19}
              />
            }
            onPress={() => setUploadVisible(true)}
            title="Upload document"
          />
        </View>

        <View style={styles.summaryGrid}>
          <SummaryCard
            icon={FolderOpen}
            label="Active documents"
            value={summary.total}
          />

          <SummaryCard
            icon={BadgeCheck}
            label="Verified"
            value={summary.verified}
          />

          <SummaryCard
            icon={Clock3}
            label="Awaiting verification"
            value={summary.awaitingVerification}
          />

          <SummaryCard
            icon={ShieldAlert}
            label="Expired"
            value={summary.expired}
          />
        </View>

        <View style={styles.toolbar}>
          <View>
            <Text style={styles.sectionTitle}>
              Client documents
            </Text>

            <Text style={styles.sectionSubtitle}>
              {activeDocuments.length} active document
              {activeDocuments.length === 1 ? '' : 's'}
            </Text>
          </View>

          <Pressable
            onPress={() =>
              setIncludeArchived((current) => !current)
            }
            style={({ pressed }) => [
              styles.archiveToggle,
              includeArchived
                ? styles.archiveToggleActive
                : null,
              pressed ? styles.pressed : null,
            ]}
          >
            <Archive
              color={
                includeArchived
                  ? Colors.primaryLight
                  : Colors.silver
              }
              size={17}
            />

            <Text
              style={[
                styles.archiveToggleText,
                includeArchived
                  ? styles.archiveToggleTextActive
                  : null,
              ]}
            >
              {includeArchived
                ? 'Hide archived'
                : 'Show archived'}
            </Text>
          </Pressable>
        </View>

        {activeDocuments.length === 0 ? (
          <Card padding="large">
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <FilePlus2
                  color={Colors.primaryLight}
                  size={34}
                />
              </View>

              <Text style={styles.emptyTitle}>
                No documents uploaded yet
              </Text>

              <Text style={styles.emptyText}>
                Upload the client&apos;s ID copy,
                competency certificates, firearm licence
                cards, motivations and supporting
                documents here.
              </Text>

              <Button
                leftIcon={
                  <Upload
                    color={Colors.white}
                    size={18}
                  />
                }
                onPress={() =>
                  setUploadVisible(true)
                }
                title="Upload first document"
              />
            </View>
          </Card>
        ) : (
          <View style={styles.documentList}>
            {activeDocuments.map((document) => (
              <DocumentCard
                document={document}
                isCompact={isCompact}
                key={document.id}
                loading={
                  workingDocumentId === document.id
                }
                onArchive={() =>
                  confirmArchive(document)
                }
                onOpen={() =>
                  void openDocument(document)
                }
                onVerify={() =>
                  void toggleVerification(document)
                }
              />
            ))}
          </View>
        )}

        {includeArchived &&
        archivedDocuments.length > 0 ? (
          <View style={styles.archivedSection}>
            <Text style={styles.sectionTitle}>
              Archived documents
            </Text>

            <Text style={styles.sectionSubtitle}>
              Retained for audit history and future
              reference.
            </Text>

            <View style={styles.documentList}>
              {archivedDocuments.map((document) => (
                <DocumentCard
                  archived
                  document={document}
                  isCompact={isCompact}
                  key={document.id}
                  loading={
                    workingDocumentId === document.id
                  }
                  onOpen={() =>
                    void openDocument(document)
                  }
                />
              ))}
            </View>
          </View>
        ) : null}
      </Screen>

      <Modal
        animationType="fade"
        onRequestClose={resetUpload}
        transparent
        visible={uploadVisible}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <ScrollView
              contentContainerStyle={styles.modalScrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator
            >
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalEyebrow}>
                  CLIENT DOCUMENT
                </Text>

                <Text style={styles.modalTitle}>
                  Upload document
                </Text>
              </View>

              <Pressable
                accessibilityLabel="Close upload"
                onPress={resetUpload}
                style={styles.closeButton}
              >
                <X
                  color={Colors.silver}
                  size={22}
                />
              </Pressable>
            </View>

            <Pressable
              onPress={chooseFile}
              style={({ pressed }) => [
                styles.filePicker,
                form.file
                  ? styles.filePickerSelected
                  : null,
                pressed ? styles.pressed : null,
              ]}
            >
              <FileText
                color={
                  form.file
                    ? Colors.success
                    : Colors.primaryLight
                }
                size={28}
              />

              <View style={styles.filePickerText}>
                <Text style={styles.filePickerTitle}>
                  {form.file
                    ? form.file.name
                    : 'Choose PDF, Word document or image'}
                </Text>

                <Text style={styles.filePickerSubtitle}>
                  {form.file
                    ? formatFileSize(form.file.size)
                    : 'Select a file from this device'}
                </Text>
              </View>

              <ExternalLink
                color={Colors.silverDark}
                size={18}
              />
            </Pressable>

            <View style={styles.formGrid}>
              <FieldBlock
                label="Document type"
                wide
              >
                <Pressable
                  onPress={() =>
                    setTypePickerVisible(
                      (current) => !current
                    )
                  }
                  style={styles.selectField}
                >
                  <Text style={styles.selectFieldText}>
                    {getDocumentTypeLabel(
                      form.documentType
                    )}
                  </Text>

                  <ChevronDown
                    color={Colors.silver}
                    size={18}
                  />
                </Pressable>

                {typePickerVisible ? (
                  <ScrollView
                    nestedScrollEnabled
                    style={styles.typeOptions}
                  >
                    {DOCUMENT_TYPE_OPTIONS.map(
                      (option) => (
                        <Pressable
                          key={option.value}
                          onPress={() => {
                            updateForm(
                              'documentType',
                              option.value
                            );
                            setTypePickerVisible(false);
                          }}
                          style={({ pressed }) => [
                            styles.typeOption,
                            option.value ===
                            form.documentType
                              ? styles.typeOptionSelected
                              : null,
                            pressed
                              ? styles.pressed
                              : null,
                          ]}
                        >
                          <Text
                            style={[
                              styles.typeOptionText,
                              option.value ===
                              form.documentType
                                ? styles.typeOptionTextSelected
                                : null,
                            ]}
                          >
                            {option.label}
                          </Text>
                        </Pressable>
                      )
                    )}
                  </ScrollView>
                ) : null}
              </FieldBlock>

              <FieldBlock
                label="Document name"
                wide
              >
                <TextInput
                  onChangeText={(value) =>
                    updateForm(
                      'documentName',
                      value
                    )
                  }
                  placeholder="e.g. ID copy - Andre van Sittert"
                  placeholderTextColor={
                    Colors.silverDark
                  }
                  style={styles.input}
                  value={form.documentName}
                />
              </FieldBlock>

              <FieldBlock label="Document date">
                <TextInput
                  onChangeText={(value) =>
                    updateForm(
                      'documentDate',
                      value
                    )
                  }
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={
                    Colors.silverDark
                  }
                  style={styles.input}
                  value={form.documentDate}
                />
              </FieldBlock>

              <FieldBlock label="Expiry date">
                <TextInput
                  onChangeText={(value) =>
                    updateForm('expiryDate', value)
                  }
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={
                    Colors.silverDark
                  }
                  style={styles.input}
                  value={form.expiryDate}
                />
              </FieldBlock>

              <FieldBlock label="Issued by">
                <TextInput
                  onChangeText={(value) =>
                    updateForm('issuedBy', value)
                  }
                  placeholder="Authority or organisation"
                  placeholderTextColor={
                    Colors.silverDark
                  }
                  style={styles.input}
                  value={form.issuedBy}
                />
              </FieldBlock>

              <FieldBlock label="Reference number">
                <TextInput
                  onChangeText={(value) =>
                    updateForm(
                      'referenceNumber',
                      value
                    )
                  }
                  placeholder="Optional"
                  placeholderTextColor={
                    Colors.silverDark
                  }
                  style={styles.input}
                  value={form.referenceNumber}
                />
              </FieldBlock>

              <FieldBlock label="Notes" wide>
                <TextInput
                  multiline
                  numberOfLines={3}
                  onChangeText={(value) =>
                    updateForm('notes', value)
                  }
                  placeholder="Optional document notes"
                  placeholderTextColor={
                    Colors.silverDark
                  }
                  style={[
                    styles.input,
                    styles.notesInput,
                  ]}
                  textAlignVertical="top"
                  value={form.notes}
                />
              </FieldBlock>
            </View>

            <View style={styles.modalActions}>
              <Button
                disabled={uploading}
                onPress={resetUpload}
                title="Cancel"
                variant="secondary"
              />

              <Button
                leftIcon={
                  <Upload
                    color={Colors.white}
                    size={18}
                  />
                }
                loading={uploading}
                onPress={() =>
                  void submitUpload()
                }
                title="Upload document"
              />
            </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

type SummaryCardProps = {
  icon: typeof FolderOpen;
  label: string;
  value: number;
};

function SummaryCard({
  icon: Icon,
  label,
  value,
}: SummaryCardProps) {
  return (
    <Card padding="small" style={styles.summaryCard}>
      <View style={styles.summaryHeader}>
        <Icon
          color={Colors.primaryLight}
          size={19}
        />

        <Text style={styles.summaryLabel}>
          {label}
        </Text>
      </View>

      <Text style={styles.summaryValue}>
        {value}
      </Text>
    </Card>
  );
}

type DocumentCardProps = {
  document: DocumentRecord;
  isCompact: boolean;
  loading: boolean;
  archived?: boolean;
  onOpen: () => void;
  onVerify?: () => void;
  onArchive?: () => void;
};

function DocumentCard({
  document,
  isCompact,
  loading,
  archived = false,
  onOpen,
  onVerify,
  onArchive,
}: DocumentCardProps) {
  const expiry = getExpiryVisual(
    document.expiry_date
  );

  return (
    <Card
      padding="medium"
      style={
        archived ? styles.archivedCard : undefined
      }
    >
      <View
        style={[
          styles.documentRow,
          isCompact ? styles.documentRowCompact : null,
        ]}
      >
        <View style={styles.documentIdentity}>
          <View style={styles.documentIcon}>
            <FileText
              color={
                archived
                  ? Colors.silverDark
                  : Colors.primaryLight
              }
              size={24}
            />
          </View>

          <View style={styles.documentContent}>
            <Text style={styles.documentName}>
              {document.document_name}
            </Text>

            <Text style={styles.documentType}>
              {getDocumentTypeLabel(
                document.document_type
              )}
            </Text>

            <View style={styles.badgeRow}>
              <StatusBadge
                icon={
                  document.is_verified
                    ? CheckCircle2
                    : Clock3
                }
                label={
                  document.is_verified
                    ? 'Verified'
                    : 'Awaiting verification'
                }
                tone={
                  document.is_verified
                    ? 'success'
                    : 'neutral'
                }
              />

              {expiry ? (
                <StatusBadge
                  icon={CalendarClock}
                  label={expiry.label}
                  tone={expiry.tone}
                />
              ) : null}

              {archived ? (
                <StatusBadge
                  icon={Archive}
                  label="Archived"
                  tone="neutral"
                />
              ) : null}
            </View>

            <View style={styles.metadataRow}>
              {document.reference_number ? (
                <Text style={styles.metadataText}>
                  Ref: {document.reference_number}
                </Text>
              ) : null}

              {document.issued_by ? (
                <Text style={styles.metadataText}>
                  Issued by: {document.issued_by}
                </Text>
              ) : null}

              <Text style={styles.metadataText}>
                Added {formatDate(document.created_at)}
              </Text>
            </View>
          </View>
        </View>

        <View
          style={[
            styles.documentActions,
            isCompact
              ? styles.documentActionsCompact
              : null,
          ]}
        >
          <Button
            leftIcon={
              <ExternalLink
                color={Colors.silver}
                size={17}
              />
            }
            loading={loading}
            onPress={onOpen}
            size="small"
            title="Open"
            variant="secondary"
          />

          {!archived && onVerify ? (
            <Button
              leftIcon={
                <FileCheck2
                  color={Colors.silver}
                  size={17}
                />
              }
              disabled={loading}
              onPress={onVerify}
              size="small"
              title={
                document.is_verified
                  ? 'Unverify'
                  : 'Verify'
              }
              variant="ghost"
            />
          ) : null}

          {!archived && onArchive ? (
            <Button
              leftIcon={
                <Archive
                  color={Colors.white}
                  size={17}
                />
              }
              disabled={loading}
              onPress={onArchive}
              size="small"
              title="Archive"
              variant="danger"
            />
          ) : null}
        </View>
      </View>
    </Card>
  );
}

type FieldBlockProps = {
  children: ReactNode;
  label: string;
  wide?: boolean;
};

function FieldBlock({
  children,
  label,
  wide = false,
}: FieldBlockProps) {
  return (
    <View
      style={[
        styles.fieldBlock,
        wide ? styles.fieldBlockWide : null,
      ]}
    >
      <Text style={styles.fieldLabel}>
        {label}
      </Text>

      {children}
    </View>
  );
}

type BadgeTone =
  | 'success'
  | 'warning'
  | 'danger'
  | 'neutral';

type StatusBadgeProps = {
  icon: typeof BadgeCheck;
  label: string;
  tone: BadgeTone;
};

function StatusBadge({
  icon: Icon,
  label,
  tone,
}: StatusBadgeProps) {
  const visual = badgeVisuals[tone];

  return (
    <View
      style={[
        styles.statusBadge,
        {
          backgroundColor: visual.background,
          borderColor: visual.border,
        },
      ]}
    >
      <Icon color={visual.color} size={13} />

      <Text
        style={[
          styles.statusBadgeText,
          { color: visual.color },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

const badgeVisuals: Record<
  BadgeTone,
  {
    background: string;
    border: string;
    color: string;
  }
> = {
  success: {
    background: 'rgba(40, 199, 111, 0.12)',
    border: 'rgba(40, 199, 111, 0.34)',
    color: Colors.success,
  },
  warning: {
    background: 'rgba(223, 174, 43, 0.12)',
    border: 'rgba(223, 174, 43, 0.34)',
    color: Colors.warning,
  },
  danger: {
    background: 'rgba(159, 17, 27, 0.18)',
    border: 'rgba(195, 41, 53, 0.44)',
    color: Colors.primaryLight,
  },
  neutral: {
    background: Colors.surfaceSoft,
    border: Colors.border,
    color: Colors.silver,
  },
};

function getExpiryVisual(
  expiryDate: string | null
): {
  label: string;
  tone: BadgeTone;
} | null {
  if (!expiryDate) {
    return null;
  }

  const today = new Date();
  const target = new Date(
    `${expiryDate}T00:00:00`
  );

  const days = Math.ceil(
    (target.getTime() - today.getTime()) /
      DAY_IN_MILLISECONDS
  );

  if (days < 0) {
    return {
      label: `Expired ${formatDate(expiryDate)}`,
      tone: 'danger',
    };
  }

  if (days <= 120) {
    return {
      label: `Expires ${formatDate(expiryDate)}`,
      tone: 'warning',
    };
  }

  return {
    label: `Valid until ${formatDate(expiryDate)}`,
    tone: 'success',
  };
}

function formatDate(value: string): string {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatFileSize(
  size: number | null
): string {
  if (!size || size <= 0) {
    return 'File selected';
  }

  if (size < 1024) {
    return `${size} bytes`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(
    1
  )} MB`;
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
    marginTop: Spacing.lg,
  },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.xxl,
  },
  headerCompact: {
    gap: Spacing.lg,
    flexDirection: 'column',
  },
  headerContent: {
    flex: 1,
    marginRight: Spacing.xl,
  },
  eyebrow: {
    ...Typography.eyebrow,
    color: Colors.primaryLight,
  },
  title: {
    ...Typography.pageTitle,
    color: Colors.silverLight,
    marginTop: Spacing.xs,
  },
  subtitle: {
    ...Typography.body,
    color: Colors.textMuted,
    marginTop: Spacing.sm,
    maxWidth: 720,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
    marginBottom: Spacing.xxl,
  },
  summaryCard: {
    flexGrow: 1,
    minWidth: 180,
  },
  summaryHeader: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  summaryLabel: {
    ...Typography.caption,
    color: Colors.textMuted,
    fontWeight: '700',
    marginLeft: Spacing.sm,
  },
  summaryValue: {
    ...Typography.metric,
    color: Colors.silverLight,
    marginTop: Spacing.sm,
  },
  toolbar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    ...Typography.sectionTitle,
    color: Colors.silverLight,
  },
  sectionSubtitle: {
    ...Typography.caption,
    color: Colors.textMuted,
    marginTop: Spacing.xxs,
  },
  archiveToggle: {
    alignItems: 'center',
    backgroundColor: Colors.surfaceRaised,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  archiveToggleActive: {
    backgroundColor: Colors.primarySoft,
    borderColor: Colors.primaryDark,
  },
  archiveToggleText: {
    ...Typography.label,
    color: Colors.silver,
    marginLeft: Spacing.sm,
  },
  archiveToggleTextActive: {
    color: Colors.primaryLight,
  },
  pressed: {
    opacity: 0.8,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: Spacing.xxl,
  },
  emptyIcon: {
    alignItems: 'center',
    backgroundColor: Colors.primarySoft,
    borderColor: Colors.primaryDark,
    borderRadius: Radius.xl,
    borderWidth: 1,
    height: 66,
    justifyContent: 'center',
    width: 66,
  },
  emptyTitle: {
    ...Typography.sectionTitle,
    color: Colors.silverLight,
    marginTop: Spacing.lg,
  },
  emptyText: {
    ...Typography.body,
    color: Colors.textMuted,
    marginBottom: Spacing.xl,
    marginTop: Spacing.sm,
    maxWidth: 560,
    textAlign: 'center',
  },
  documentList: {
    gap: Spacing.md,
  },
  documentRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  documentRowCompact: {
    alignItems: 'stretch',
    flexDirection: 'column',
    gap: Spacing.lg,
  },
  documentIdentity: {
    alignItems: 'flex-start',
    flex: 1,
    flexDirection: 'row',
  },
  documentIcon: {
    alignItems: 'center',
    backgroundColor: Colors.primarySoft,
    borderColor: Colors.primaryDark,
    borderRadius: Radius.lg,
    borderWidth: 1,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  documentContent: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  documentName: {
    ...Typography.cardTitle,
    color: Colors.silverLight,
  },
  documentType: {
    ...Typography.caption,
    color: Colors.textMuted,
    marginTop: Spacing.xxs,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginTop: Spacing.sm,
  },
  statusBadge: {
    alignItems: 'center',
    borderRadius: Radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xxs,
  },
  statusBadgeText: {
    ...Typography.caption,
    fontWeight: '700',
    marginLeft: Spacing.xs,
  },
  metadataRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
    marginTop: Spacing.sm,
  },
  metadataText: {
    ...Typography.caption,
    color: Colors.silverDark,
  },
  documentActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginLeft: Spacing.xl,
  },
  documentActionsCompact: {
    flexWrap: 'wrap',
    marginLeft: 0,
  },
  archivedSection: {
    marginTop: Spacing.section,
  },
  archivedCard: {
    opacity: 0.72,
  },
  modalOverlay: {
    alignItems: 'center',
    backgroundColor: Colors.overlay,
    flex: 1,
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  modalCard: {
    backgroundColor: Colors.surface,
    borderColor: Colors.borderStrong,
    borderRadius: Radius.xl,
    borderWidth: 1,
    maxHeight: '94%',
    maxWidth: 760,
    padding: Spacing.xxl,
    width: '100%',
  },
  modalScrollContent: {
    paddingBottom: Spacing.xs,
  },
  modalHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.lg,
  },
  modalEyebrow: {
    ...Typography.eyebrow,
    color: Colors.primaryLight,
  },
  modalTitle: {
    ...Typography.sectionTitle,
    color: Colors.silverLight,
    marginTop: Spacing.xs,
  },
  closeButton: {
    alignItems: 'center',
    backgroundColor: Colors.surfaceRaised,
    borderColor: Colors.border,
    borderRadius: Radius.pill,
    borderWidth: 1,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  filePicker: {
    alignItems: 'center',
    backgroundColor: Colors.surfaceRaised,
    borderColor: Colors.borderStrong,
    borderRadius: Radius.lg,
    borderStyle: 'dashed',
    borderWidth: 1,
    flexDirection: 'row',
    padding: Spacing.lg,
  },
  filePickerSelected: {
    borderColor: Colors.success,
    borderStyle: 'solid',
  },
  filePickerText: {
    flex: 1,
    marginHorizontal: Spacing.md,
  },
  filePickerTitle: {
    ...Typography.bodyStrong,
    color: Colors.silverLight,
  },
  filePickerSubtitle: {
    ...Typography.caption,
    color: Colors.textMuted,
    marginTop: Spacing.xxs,
  },
  formGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
    marginTop: Spacing.lg,
  },
  fieldBlock: {
    flexBasis: 300,
    flexGrow: 1,
  },
  fieldBlockWide: {
    flexBasis: '100%',
  },
  fieldLabel: {
    ...Typography.label,
    color: Colors.silver,
    marginBottom: Spacing.xs,
  },
  input: {
    ...Typography.body,
    backgroundColor: Colors.surfaceRaised,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    borderWidth: 1,
    color: Colors.text,
    minHeight: 46,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  notesInput: {
    minHeight: 86,
  },
  selectField: {
    alignItems: 'center',
    backgroundColor: Colors.surfaceRaised,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 46,
    paddingHorizontal: Spacing.md,
  },
  selectFieldText: {
    ...Typography.body,
    color: Colors.text,
  },
  typeOptions: {
    backgroundColor: Colors.surfaceRaised,
    borderColor: Colors.borderStrong,
    borderRadius: Radius.md,
    borderWidth: 1,
    marginTop: Spacing.xs,
    maxHeight: 250,
  },
  typeOption: {
    borderBottomColor: Colors.border,
    borderBottomWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  typeOptionSelected: {
    backgroundColor: Colors.primarySoft,
  },
  typeOptionText: {
    ...Typography.body,
    color: Colors.silver,
  },
  typeOptionTextSelected: {
    color: Colors.primaryLight,
    fontWeight: '700',
  },
  modalActions: {
    flexDirection: 'row',
    gap: Spacing.md,
    justifyContent: 'flex-end',
    marginTop: Spacing.xl,
  },
});
