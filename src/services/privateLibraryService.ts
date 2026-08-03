import { REFERENCE_LIBRARY_ITEMS, type ReferenceLibraryItem } from '../data/referenceLibrary';
import { supabase } from '../lib/supabase';
import type { ApplicationCaseRecord } from '../types/applicationCase';
import type { CompetencyRecord } from '../types/competency';
import type { DocumentRecord, DocumentType } from '../types/document';
import type { FirearmRecord } from '../types/firearm';
import type {
  LibraryClassification,
  LibraryClassificationReason,
  LibraryDataQualityIssue,
  LibraryReclassificationManifestEntry,
  PrivateLibraryDocumentItem,
  PrivateLibraryFolder,
  PrivateLibraryModel,
  PrivateLibraryRecords,
  PrivateLibrarySourceAudit,
} from '../types/privateLibrary';

const db = supabase as any;
const CLOSED_STATUSES = new Set(['APPROVED', 'DECLINED', 'WITHDRAWN', 'CLOSED']);

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function documentTypeClassification(type: DocumentType): LibraryClassification | null {
  switch (type) {
    case 'ID_COPY': return 'IDENTITY';
    case 'COMPETENCY_CERTIFICATE':
    case 'COMPETENCY_APPLICATION':
    case 'COMPETENCY_RENEWAL_FORM': return 'COMPETENCIES';
    case 'FIREARM_LICENCE':
    case 'FIREARM_LICENCE_CARD':
    case 'FIREARM_LICENCE_APPLICATION_FORM':
    case 'FIREARM_LICENCE_RENEWAL_FORM': return 'FIREARM_LICENCES';
    case 'MOTIVATION': return 'MOTIVATIONS';
    case 'MEMBERSHIP_CERTIFICATE': return 'MEMBERSHIP';
    case 'DEDICATED_STATUS': return 'DEDICATED_STATUS';
    case 'GOOD_STANDING': return 'GOOD_STANDING';
    case 'ENDORSEMENT': return 'ENDORSEMENTS';
    case 'SUPPORTING_RESEARCH': return 'CALIBRE_INFORMATION';
    case 'SUPPORTING_DOCUMENT':
    case 'SAFE_AFFIDAVIT':
    case 'TESTIMONIAL':
    case 'PURCHASE_INVOICE':
    case 'DEALER_STOCK_DOCUMENT':
    case 'SELLER_ID_COPY':
    case 'SELLER_LICENCE_COPY': return 'SUPPORTING_DOCUMENTS';
    default: return null;
  }
}

function classifyDocument(
  document: DocumentRecord,
  firearm: FirearmRecord | null,
  competency: CompetencyRecord | null,
  applicationCase: ApplicationCaseRecord | null
): { classification: LibraryClassification; reason: LibraryClassificationReason } {
  if (firearm) {
    const classification: Partial<Record<DocumentType, LibraryClassification>> = {
      FIREARM_LICENCE: 'FIREARM_LICENCE',
      FIREARM_LICENCE_CARD: 'FIREARM_LICENCE',
      FIREARM_LICENCE_APPLICATION_FORM: 'FIREARM_LICENCE',
      FIREARM_LICENCE_RENEWAL_FORM: 'FIREARM_LICENCE',
      MOTIVATION: 'FIREARM_MOTIVATION',
      ENDORSEMENT: 'FIREARM_ENDORSEMENTS',
      SUPPORTING_RESEARCH: 'FIREARM_INFORMATION',
    };
    return {
      classification: classification[document.document_type] ?? (
        applicationCase && CLOSED_STATUSES.has(applicationCase.status)
          ? 'FIREARM_HISTORICAL_APPLICATIONS'
          : 'FIREARM_SUPPORTING_DOCUMENTS'
      ),
      reason: {
        priority: 'ENTITY_LINK',
        explanation: `Grouped under ${firearm.make} ${firearm.model ?? firearm.calibre} because firearm_id directly links this record to the firearm.`,
        confidence: 'HIGH',
      },
    };
  }
  if (competency) {
    return {
      classification: 'COMPETENCIES',
      reason: { priority: 'ENTITY_LINK', explanation: `Grouped by direct competency_id linkage to ${competency.category}.`, confidence: 'HIGH' },
    };
  }
  if (applicationCase && CLOSED_STATUSES.has(applicationCase.status)) {
    return {
      classification: 'HISTORICAL_APPLICATIONS',
      reason: { priority: 'ENTITY_LINK', explanation: `Grouped by direct linkage to historical ${applicationCase.application_type} case.`, confidence: 'HIGH' },
    };
  }
  const explicitCategory = text(document.metadata?.referenceCategory);
  if (explicitCategory) {
    const category = explicitCategory.toLowerCase();
    const classification = category.includes('motivation') ? 'MOTIVATIONS'
      : category.includes('endorsement') ? 'ENDORSEMENTS'
        : category.includes('dedicated') ? 'DEDICATED_STATUS'
          : category.includes('good standing') ? 'GOOD_STANDING'
            : category.includes('membership') ? 'MEMBERSHIP'
              : category.includes('research') ? 'CALIBRE_INFORMATION' : null;
    if (classification) {
      return { classification, reason: { priority: 'EXPLICIT_METADATA', explanation: `Grouped from explicit referenceCategory metadata: ${explicitCategory}.`, confidence: 'HIGH' } };
    }
  }
  const byType = documentTypeClassification(document.document_type);
  if (byType) {
    return { classification: byType, reason: { priority: 'DOCUMENT_TYPE', explanation: `Grouped from document_type ${document.document_type}.`, confidence: 'MEDIUM' } };
  }
  const filename = `${document.original_file_name ?? ''} ${document.file_name} ${document.document_name}`.toLowerCase();
  if (filename.includes('motivation')) {
    return { classification: 'MOTIVATIONS', reason: { priority: 'FILENAME_HEURISTIC', explanation: 'Filename contains “motivation”; no stronger entity or metadata link exists.', confidence: 'LOW' } };
  }
  if (filename.includes('identity') || filename.includes('id copy')) {
    return { classification: 'IDENTITY', reason: { priority: 'FILENAME_HEURISTIC', explanation: 'Filename resembles an identity document; no stronger entity or metadata link exists.', confidence: 'LOW' } };
  }
  return { classification: 'UNCLASSIFIED', reason: { priority: 'NONE', explanation: 'No authoritative entity link, explicit metadata or sufficiently specific document type supports grouping.', confidence: 'LOW' } };
}

function qualityIssues(
  document: DocumentRecord,
  firearm: FirearmRecord | null,
  applicationCase: ApplicationCaseRecord | null
): LibraryDataQualityIssue[] {
  const issues: LibraryDataQualityIssue[] = [];
  const metadataFirearmId = text(document.metadata?.firearmId);
  if (metadataFirearmId && metadataFirearmId !== document.firearm_id) {
    issues.push({ code: 'FIREARM_LINK_CONFLICT', severity: 'CONFLICT', detail: 'metadata.firearmId conflicts with firearm_id.' });
  }
  const metadataCaseId = text(document.metadata?.applicationCaseId);
  if (metadataCaseId && metadataCaseId !== document.application_case_id) {
    issues.push({ code: 'APPLICATION_LINK_CONFLICT', severity: 'CONFLICT', detail: 'metadata.applicationCaseId conflicts with application_case_id.' });
  }
  if (document.parent_document_id === document.id) {
    issues.push({ code: 'SELF_PARENT', severity: 'CONFLICT', detail: 'parent_document_id points to the same document.' });
  }
  if (document.is_generated && !document.parent_document_id && !document.generated_from_template_id) {
    issues.push({ code: 'GENERATED_SOURCE_MISSING', severity: 'WARNING', detail: 'Generated document has no parent or template relationship.' });
  }
  if (document.firearm_id && !firearm) {
    issues.push({ code: 'FIREARM_NOT_LOADED', severity: 'CONFLICT', detail: 'firearm_id does not match a current client firearm.' });
  }
  if (document.application_case_id && !applicationCase) {
    issues.push({ code: 'APPLICATION_NOT_LOADED', severity: 'CONFLICT', detail: 'application_case_id does not match a client application case.' });
  }
  return issues;
}

function mapDocument(document: DocumentRecord, records: PrivateLibraryRecords): PrivateLibraryDocumentItem {
  const firearm = records.firearms.find((item) => item.id === document.firearm_id) ?? null;
  const competency = records.competencies.find((item) => item.id === document.competency_id) ?? null;
  const applicationCase = records.applicationCases.find((item) => item.id === document.application_case_id) ?? null;
  const classified = classifyDocument(document, firearm, competency, applicationCase);
  const relationships = [
    { type: 'CLIENT' as const, id: document.client_id, label: 'Client' },
    ...(firearm ? [{ type: 'FIREARM' as const, id: firearm.id, label: `${firearm.make} ${firearm.model ?? firearm.calibre}` }] : []),
    ...(document.firearm_licence_id ? [{ type: 'FIREARM_LICENCE' as const, id: document.firearm_licence_id, label: 'Firearm licence' }] : []),
    ...(competency ? [{ type: 'COMPETENCY' as const, id: competency.id, label: competency.category }] : []),
    ...(applicationCase ? [{ type: 'APPLICATION_CASE' as const, id: applicationCase.id, label: applicationCase.application_type }] : []),
    ...(document.parent_document_id ? [{ type: 'PARENT_DOCUMENT' as const, id: document.parent_document_id, label: 'Parent document' }] : []),
    ...(text(document.metadata?.sourceDocumentId) ? [{ type: 'SOURCE_DOCUMENT' as const, id: text(document.metadata.sourceDocumentId)!, label: 'Source document' }] : []),
  ];
  return {
    id: document.id,
    document,
    documentName: document.document_name,
    documentType: document.document_type,
    classification: classified.classification,
    classificationReason: classified.reason,
    provenance: {
      kind: document.is_generated ? 'GENERATED_WORKING_COPY' : 'SUPABASE_DOCUMENT',
      sourceDocumentId: text(document.metadata?.sourceDocumentId),
      referenceItemId: text(document.metadata?.referenceItemId) ?? text(document.metadata?.referenceLibraryId),
      storagePath: document.storage_path,
      repositoryPath: text(document.metadata?.relativePath),
    },
    clientId: document.client_id,
    firearm,
    competency,
    applicationCase,
    relationships,
    verificationState: document.is_verified ? 'VERIFIED' : 'AWAITING_VERIFICATION',
    lifecycleState: document.lifecycle_status,
    expiryDate: document.expiry_date,
    originalFileName: document.original_file_name,
    parentDocumentId: document.parent_document_id,
    warnings: qualityIssues(document, firearm, applicationCase),
  };
}

function folder(id: string, label: string, classification: LibraryClassification | null, items: PrivateLibraryDocumentItem[] = [], children: PrivateLibraryFolder[] = [], firearmId: string | null = null): PrivateLibraryFolder {
  return { id, label, classification, firearmId, items, children, count: items.length + children.reduce((sum, child) => sum + child.count, 0) };
}

function itemsFor(items: PrivateLibraryDocumentItem[], classification: LibraryClassification): PrivateLibraryDocumentItem[] {
  return items.filter((item) => item.classification === classification);
}

export function buildPrivateLibraryModelFromRecords(records: PrivateLibraryRecords): PrivateLibraryModel {
  const items = records.documents.map((document) => mapDocument(document, records));
  const firearmFolders = records.firearms.map((firearm) => {
    const firearmItems = items.filter((item) => item.firearm?.id === firearm.id);
    const children = [
      folder(`${firearm.id}-licence`, 'Licence', 'FIREARM_LICENCE', itemsFor(firearmItems, 'FIREARM_LICENCE')),
      folder(`${firearm.id}-motivation`, 'Motivation', 'FIREARM_MOTIVATION', itemsFor(firearmItems, 'FIREARM_MOTIVATION')),
      folder(`${firearm.id}-information`, 'Firearm Information', 'FIREARM_INFORMATION', itemsFor(firearmItems, 'FIREARM_INFORMATION')),
      folder(`${firearm.id}-calibre`, 'Calibre Information', 'CALIBRE_INFORMATION', itemsFor(firearmItems, 'CALIBRE_INFORMATION')),
      folder(`${firearm.id}-endorsements`, 'Endorsements', 'FIREARM_ENDORSEMENTS', itemsFor(firearmItems, 'FIREARM_ENDORSEMENTS')),
      folder(`${firearm.id}-history`, 'Historical Applications', 'FIREARM_HISTORICAL_APPLICATIONS', itemsFor(firearmItems, 'FIREARM_HISTORICAL_APPLICATIONS')),
      folder(`${firearm.id}-support`, 'Supporting Documents', 'FIREARM_SUPPORTING_DOCUMENTS', itemsFor(firearmItems, 'FIREARM_SUPPORTING_DOCUMENTS')),
    ];
    return folder(`firearm-${firearm.id}`, [firearm.make, firearm.model, firearm.calibre, firearm.serial_number].filter(Boolean).join(' · '), null, [], children, firearm.id);
  });
  const folders = [
    folder('identity', 'Identity', 'IDENTITY', itemsFor(items, 'IDENTITY')),
    folder('competencies', 'Competencies', 'COMPETENCIES', itemsFor(items, 'COMPETENCIES')),
    folder('firearm-licences', 'Firearm Licences', 'FIREARM_LICENCES', itemsFor(items, 'FIREARM_LICENCES')),
    folder('firearms', 'Firearms', null, [], firearmFolders),
    folder('membership', 'Membership', 'MEMBERSHIP', itemsFor(items, 'MEMBERSHIP')),
    folder('dedicated-status', 'Dedicated Status', 'DEDICATED_STATUS', itemsFor(items, 'DEDICATED_STATUS')),
    folder('good-standing', 'Good Standing', 'GOOD_STANDING', itemsFor(items, 'GOOD_STANDING')),
    folder('endorsements', 'Endorsements', 'ENDORSEMENTS', itemsFor(items, 'ENDORSEMENTS')),
    folder('history', 'Historical Applications', 'HISTORICAL_APPLICATIONS', itemsFor(items, 'HISTORICAL_APPLICATIONS')),
    folder('motivations', 'Motivations', 'MOTIVATIONS', itemsFor(items, 'MOTIVATIONS')),
    folder('supporting', 'Supporting Documents', 'SUPPORTING_DOCUMENTS', itemsFor(items, 'SUPPORTING_DOCUMENTS')),
    folder('unclassified', 'Unclassified / Needs Review', 'UNCLASSIFIED', itemsFor(items, 'UNCLASSIFIED')),
  ];
  return {
    clientId: records.clientId,
    builtAt: new Date().toISOString(),
    folders,
    items,
    unclassifiedItems: itemsFor(items, 'UNCLASSIFIED'),
    qualityIssues: items.flatMap((item) => item.warnings),
  };
}

export async function getClientPrivateLibrary(clientId: string): Promise<PrivateLibraryModel> {
  const [documents, firearms, competencies, applicationCases] = await Promise.all([
    db.from('documents').select('*').eq('client_id', clientId),
    db.from('firearms').select('*').eq('client_id', clientId),
    db.from('competencies').select('*').eq('client_id', clientId),
    db.from('application_cases').select('*').eq('client_id', clientId),
  ]);
  const error = documents.error ?? firearms.error ?? competencies.error ?? applicationCases.error;
  if (error) throw new Error(error.message);
  return buildPrivateLibraryModelFromRecords({
    clientId,
    documents: (documents.data ?? []) as DocumentRecord[],
    firearms: (firearms.data ?? []) as FirearmRecord[],
    competencies: (competencies.data ?? []) as CompetencyRecord[],
    applicationCases: (applicationCases.data ?? []) as ApplicationCaseRecord[],
  });
}

function proposedRepositoryClassification(item: ReferenceLibraryItem): LibraryClassification {
  const category = item.category.toLowerCase();
  if (category.includes('identity')) return 'IDENTITY';
  if (category.includes('motivation')) return 'MOTIVATIONS';
  if (category.includes('membership')) return 'MEMBERSHIP';
  if (category.includes('dedicated')) return 'DEDICATED_STATUS';
  if (category.includes('good standing')) return 'GOOD_STANDING';
  if (category.includes('endorsement')) return 'ENDORSEMENTS';
  if (category.includes('research')) return 'CALIBRE_INFORMATION';
  if (category.includes('supporting')) return 'SUPPORTING_DOCUMENTS';
  return 'UNCLASSIFIED';
}

export function buildRepositoryReclassificationManifest(): LibraryReclassificationManifestEntry[] {
  return REFERENCE_LIBRARY_ITEMS.map((item) => ({
    sourceKind: 'REPOSITORY_FILE',
    sourcePathOrDocumentId: item.relativePath,
    currentClassification: item.category,
    proposedClassification: proposedRepositoryClassification(item),
    proposedClientId: null,
    proposedFirearmId: null,
    proposedCompetencyId: null,
    proposedApplicationCaseId: null,
    confidence: item.category ? 'MEDIUM' : 'LOW',
    reason: 'Proposal is based on registry category only; application-folder names are not authoritative entity links.',
    conflictWarnings: item.category === 'Identity Documents' && item.applicationFolder !== 'General'
      ? ['Identity material is nested under a firearm-named source folder; client ownership requires manual review.']
      : [],
    manualApprovalRequired: true,
  }));
}

export function buildSupabaseReclassificationManifest(model: PrivateLibraryModel): LibraryReclassificationManifestEntry[] {
  return model.items
    .filter((item) => item.classification === 'UNCLASSIFIED' || item.warnings.length > 0 || item.classificationReason.confidence === 'LOW')
    .map((item) => ({
      sourceKind: 'SUPABASE_DOCUMENT',
      sourcePathOrDocumentId: item.id,
      currentClassification: item.documentType,
      proposedClassification: item.classification,
      proposedClientId: item.clientId,
      proposedFirearmId: item.firearm?.id ?? null,
      proposedCompetencyId: item.competency?.id ?? null,
      proposedApplicationCaseId: item.applicationCase?.id ?? null,
      confidence: item.classificationReason.confidence,
      reason: item.classificationReason.explanation,
      conflictWarnings: item.warnings.map((warning) => warning.detail),
      manualApprovalRequired: true,
    }));
}

function normaliseIdentity(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export function auditPrivateLibrarySources(model: PrivateLibraryModel): PrivateLibrarySourceAudit {
  const matchedDocumentIds = new Set<string>();
  const matchedRepositoryIds = new Set<string>();
  const presentInBoth = REFERENCE_LIBRARY_ITEMS.flatMap((repository) => {
    const repositoryName = normaliseIdentity(repository.fileName);
    const matches = model.items.filter((item) => {
      if (item.provenance.referenceItemId === repository.id) return true;
      const names = [item.originalFileName, item.document.file_name, item.provenance.repositoryPath]
        .map(normaliseIdentity).filter(Boolean);
      return Boolean(repositoryName && names.includes(repositoryName));
    });
    return matches.map((item) => {
      matchedDocumentIds.add(item.id);
      matchedRepositoryIds.add(repository.id);
      const evidence = item.provenance.referenceItemId === repository.id
        ? ['Reference item ID matches.']
        : ['Original or stored filename matches.'];
      return { repositoryItemId: repository.id, repositoryPath: repository.relativePath, documentId: item.id, evidence };
    });
  });
  const duplicateMap = new Map<string, string[]>();
  for (const item of REFERENCE_LIBRARY_ITEMS) {
    const key = normaliseIdentity(item.fileName);
    if (!key) continue;
    duplicateMap.set(key, [...(duplicateMap.get(key) ?? []), item.relativePath]);
  }
  for (const item of model.items) {
    const key = item.document.checksum_sha256
      ? `checksum:${item.document.checksum_sha256}`
      : normaliseIdentity(item.originalFileName ?? item.document.file_name);
    if (!key) continue;
    duplicateMap.set(key, [...(duplicateMap.get(key) ?? []), `documents:${item.id}`]);
  }
  return {
    repositoryFileCount: REFERENCE_LIBRARY_ITEMS.length,
    supabaseDocumentCount: model.items.length,
    presentInBoth,
    repositoryOnly: REFERENCE_LIBRARY_ITEMS.filter((item) => !matchedRepositoryIds.has(item.id)).map((item) => item.relativePath),
    supabaseOnly: model.items.filter((item) => !matchedDocumentIds.has(item.id)).map((item) => item.id),
    possibleDuplicateGroups: Array.from(duplicateMap.entries())
      .filter(([, sources]) => sources.length > 1)
      .map(([key, sources]) => ({ key, sources })),
    incompleteOrContradictoryDocumentIds: model.items
      .filter((item) => item.classification === 'UNCLASSIFIED' || item.warnings.length > 0)
      .map((item) => item.id),
  };
}
