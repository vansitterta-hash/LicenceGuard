import type { DocumentRecord, DocumentType } from '../types/document';
import { buildPrivateLibraryModelFromRecords } from '../services/privateLibraryService';
import { rankCandidateDocuments } from './intelligencePolicy';
import type {
  ApplicationContext,
  CandidateDocument,
  CandidateScoreFactorKey,
  IntelligenceSourceRecord,
  IntelligenceSourceScope,
} from './types';

const DOCUMENT_TYPES = new Set<DocumentType>([
  'ID_COPY', 'PASSPORT_PHOTO', 'PROOF_OF_ADDRESS', 'COMPETENCY_CERTIFICATE',
  'FIREARM_LICENCE', 'MOTIVATION', 'SUPPORTING_DOCUMENT', 'OTHER',
  'FIREARM_LICENCE_CARD', 'COMPETENCY_APPLICATION', 'COMPETENCY_RENEWAL_FORM',
  'FIREARM_LICENCE_APPLICATION_FORM', 'FIREARM_LICENCE_RENEWAL_FORM',
  'DEALER_STOCK_DOCUMENT', 'SELLER_ID_COPY', 'SELLER_LICENCE_COPY',
  'PURCHASE_INVOICE', 'ENDORSEMENT', 'DEDICATED_STATUS', 'GOOD_STANDING',
  'MEMBERSHIP_CERTIFICATE', 'SAFE_AFFIDAVIT', 'TESTIMONIAL',
  'SUPPORTING_RESEARCH', 'PAYMENT_RECEIPT', 'SUBMISSION_CONFIRMATION',
  'OUTCOME_DOCUMENT', 'CLIENT_SIGNATURE',
]);

function sourceForDocument(
  document: DocumentRecord,
  context: ApplicationContext,
  historicalIds: Set<string>
): IntelligenceSourceRecord {
  const historical = Boolean(document.application_case_id && historicalIds.has(document.application_case_id));
  const firearmLinked = Boolean(context.firearm && document.firearm_id === context.firearm.id);
  const scope: IntelligenceSourceScope = historical
    ? 'HISTORICAL_APPLICATION'
    : firearmLinked ? 'FIREARM' : 'CLIENT';
  return {
    id: `document-source-${document.id}`,
    scope,
    dealerId: document.dealer_id,
    clientId: document.client_id,
    firearmId: document.firearm_id,
    applicationCaseId: document.application_case_id,
    documentId: document.id,
    title: document.document_name,
    sourceAuthority: document.issued_by,
    trustLevel: document.is_verified ? 'PRIVATE_REVIEWED' : 'UNREVIEWED',
    private: true,
    metadata: document.metadata,
  };
}

function freshnessSignal(document: DocumentRecord): number | undefined {
  const date = document.document_date ?? document.created_at?.slice(0, 10);
  if (!date) return undefined;
  const age = Date.now() - new Date(`${date.slice(0, 10)}T00:00:00`).getTime();
  const years = age / (365.25 * 86_400_000);
  return years <= 1 ? 1 : years <= 3 ? 0.6 : years <= 5 ? 0.25 : 0;
}

function documentSignals(
  document: DocumentRecord,
  context: ApplicationContext,
  source: IntelligenceSourceRecord
): Partial<Record<CandidateScoreFactorKey, number>> {
  const metadata = document.metadata ?? {};
  const signals: Partial<Record<CandidateScoreFactorKey, number>> = {
    CLIENT_OWNERSHIP: document.client_id === context.client.id ? 1 : -1,
    HISTORICAL_USE: source.scope === 'HISTORICAL_APPLICATION' ? 1 : 0,
    DOCUMENT_VERIFICATION: document.is_verified ? 1 : 0,
    LIFECYCLE_STATUS: document.lifecycle_status === 'ACTIVE' ? 1 : -1,
    FRESHNESS: freshnessSignal(document),
    SOURCE_TRUST: document.is_verified ? 1 : 0.25,
  };
  if (source.scope === 'HISTORICAL_APPLICATION' && document.application_case_id) {
    const historicalCase = context.historicalApplications.find(
      (item) => item.id === document.application_case_id
    );
    if (historicalCase?.status === 'APPROVED') {
      signals.PRIOR_SUBMISSION_OUTCOME = 1;
    } else if (historicalCase?.status === 'SUBMITTED') {
      signals.PRIOR_SUBMISSION_OUTCOME = 0.5;
    }
  }
  if (context.firearm && document.firearm_id) {
    signals.EXACT_FIREARM = document.firearm_id === context.firearm.id ? 1 : -1;
  }
  if (document.application_case_id) {
    signals.EXACT_APPLICATION = document.application_case_id === context.applicationCase.id ? 1 : 0;
  }
  if (document.competency_id && context.competency) {
    signals.EXACT_COMPETENCY = document.competency_id === context.competency.id ? 1 : -1;
  }
  if (context.firearm && typeof metadata.calibre === 'string') {
    signals.EXACT_CALIBRE = metadata.calibre.trim().toLowerCase() === context.firearm.calibre.trim().toLowerCase() ? 1 : -1;
  }
  if (context.licenceSection && typeof metadata.licenceSection === 'string') {
    signals.LICENCE_SECTION = metadata.licenceSection === context.licenceSection ? 1 : -1;
  }
  return signals;
}

function candidateFromDocument(
  document: DocumentRecord,
  context: ApplicationContext,
  historicalIds: Set<string>
): CandidateDocument {
  const source = sourceForDocument(document, context, historicalIds);
  return {
    id: `document-${document.id}`,
    documentType: document.document_type,
    documentId: document.id,
    source,
    title: document.document_name,
    storagePath: document.storage_path,
    lifecycleStatus: document.lifecycle_status,
    verified: document.is_verified,
    expiryDate: document.expiry_date,
    matchSignals: documentSignals(document, context, source),
    score: null,
    confidence: null,
    explanation: null,
    metadata: document.metadata,
  };
}

export function buildCandidateDocuments(
  context: ApplicationContext,
  usePrivateLibrary = false
): CandidateDocument[] {
  const historicalIds = new Set(context.historicalApplications.map((item) => item.id));
  const sourceDocuments = usePrivateLibrary
    ? buildPrivateLibraryModelFromRecords({
        clientId: context.client.id,
        documents: context.documents,
        firearms: context.firearm ? [context.firearm] : [],
        competencies: context.competency ? [context.competency] : [],
        applicationCases: [context.applicationCase, ...context.historicalApplications],
      }).items.map((item) => item.document)
    : context.documents;
  const privateCandidates = sourceDocuments
    .filter((document) => document.lifecycle_status === 'ACTIVE')
    .map((document) => {
      const candidate = candidateFromDocument(document, context, historicalIds);
      if (!usePrivateLibrary) {
        delete candidate.matchSignals.EXACT_APPLICATION;
        delete candidate.matchSignals.EXACT_COMPETENCY;
      }
      return candidate;
    });
  const publicCandidates = context.publicLibrarySources.flatMap((source): CandidateDocument[] => {
    const value = source.metadata.documentType;
    if (typeof value !== 'string' || !DOCUMENT_TYPES.has(value as DocumentType)) return [];
    return [{
      id: `public-${source.id}`,
      documentType: value as DocumentType,
      documentId: null,
      source,
      title: source.title,
      storagePath: null,
      lifecycleStatus: 'ACTIVE',
      verified: source.trustLevel === 'PUBLIC_REVIEWED',
      expiryDate: null,
      matchSignals: {
        SOURCE_TRUST: source.trustLevel === 'PUBLIC_REVIEWED' ? 0.75 : 0,
        LIFECYCLE_STATUS: 1,
      },
      score: null,
      confidence: null,
      explanation: null,
      metadata: source.metadata,
    }];
  });
  return rankCandidateDocuments([...privateCandidates, ...publicCandidates]);
}
