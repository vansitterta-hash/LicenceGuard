import type { ApplicationCaseRecord } from './applicationCase';
import type { CompetencyRecord } from './competency';
import type { DocumentLifecycleStatus, DocumentRecord, DocumentType } from './document';
import type { FirearmRecord } from './firearm';

export type LibraryClassification =
  | 'IDENTITY'
  | 'COMPETENCIES'
  | 'FIREARM_LICENCES'
  | 'FIREARM_LICENCE'
  | 'FIREARM_MOTIVATION'
  | 'FIREARM_INFORMATION'
  | 'CALIBRE_INFORMATION'
  | 'FIREARM_ENDORSEMENTS'
  | 'FIREARM_HISTORICAL_APPLICATIONS'
  | 'FIREARM_SUPPORTING_DOCUMENTS'
  | 'MEMBERSHIP'
  | 'DEDICATED_STATUS'
  | 'GOOD_STANDING'
  | 'ENDORSEMENTS'
  | 'HISTORICAL_APPLICATIONS'
  | 'MOTIVATIONS'
  | 'SUPPORTING_DOCUMENTS'
  | 'UNCLASSIFIED';

export type LibraryClassificationReason = {
  priority: 'ENTITY_LINK' | 'EXPLICIT_METADATA' | 'DOCUMENT_TYPE' | 'PROVENANCE' | 'FILENAME_HEURISTIC' | 'NONE';
  explanation: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
};

export type LibrarySourceProvenance = {
  kind: 'SUPABASE_DOCUMENT' | 'GENERATED_WORKING_COPY' | 'REPOSITORY_REFERENCE';
  sourceDocumentId: string | null;
  referenceItemId: string | null;
  storagePath: string | null;
  repositoryPath: string | null;
};

export type LibraryRelationship = {
  type: 'CLIENT' | 'FIREARM' | 'FIREARM_LICENCE' | 'COMPETENCY' | 'APPLICATION_CASE' | 'PARENT_DOCUMENT' | 'SOURCE_DOCUMENT';
  id: string;
  label: string;
};

export type LibraryDataQualityIssue = {
  code: string;
  severity: 'INFO' | 'WARNING' | 'CONFLICT';
  detail: string;
};

export type PrivateLibraryDocumentItem = {
  id: string;
  document: DocumentRecord;
  documentName: string;
  documentType: DocumentType;
  classification: LibraryClassification;
  classificationReason: LibraryClassificationReason;
  provenance: LibrarySourceProvenance;
  clientId: string;
  firearm: FirearmRecord | null;
  competency: CompetencyRecord | null;
  applicationCase: ApplicationCaseRecord | null;
  relationships: LibraryRelationship[];
  verificationState: 'VERIFIED' | 'AWAITING_VERIFICATION';
  lifecycleState: DocumentLifecycleStatus;
  expiryDate: string | null;
  originalFileName: string | null;
  parentDocumentId: string | null;
  warnings: LibraryDataQualityIssue[];
};

export type PrivateLibraryFolder = {
  id: string;
  label: string;
  classification: LibraryClassification | null;
  firearmId: string | null;
  items: PrivateLibraryDocumentItem[];
  children: PrivateLibraryFolder[];
  count: number;
};

export type PrivateLibraryNode = PrivateLibraryFolder | PrivateLibraryDocumentItem;

export type PrivateLibraryModel = {
  clientId: string;
  builtAt: string;
  folders: PrivateLibraryFolder[];
  items: PrivateLibraryDocumentItem[];
  unclassifiedItems: PrivateLibraryDocumentItem[];
  qualityIssues: LibraryDataQualityIssue[];
};

export type PrivateLibraryFilter = {
  documentType?: DocumentType;
  firearmId?: string;
  applicationCaseId?: string;
  lifecycleStatus?: DocumentLifecycleStatus;
};

export type LibraryReclassificationManifestEntry = {
  sourceKind: 'SUPABASE_DOCUMENT' | 'REPOSITORY_FILE';
  sourcePathOrDocumentId: string;
  currentClassification: string;
  proposedClassification: LibraryClassification;
  proposedClientId: string | null;
  proposedFirearmId: string | null;
  proposedCompetencyId: string | null;
  proposedApplicationCaseId: string | null;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  reason: string;
  conflictWarnings: string[];
  manualApprovalRequired: true;
};

export type PrivateLibraryRecords = {
  clientId: string;
  documents: DocumentRecord[];
  firearms: FirearmRecord[];
  competencies: CompetencyRecord[];
  applicationCases: ApplicationCaseRecord[];
};

export type PrivateLibrarySourceMatch = {
  repositoryItemId: string;
  repositoryPath: string;
  documentId: string;
  evidence: string[];
};

export type PrivateLibrarySourceAudit = {
  repositoryFileCount: number;
  supabaseDocumentCount: number;
  presentInBoth: PrivateLibrarySourceMatch[];
  repositoryOnly: string[];
  supabaseOnly: string[];
  possibleDuplicateGroups: Array<{ key: string; sources: string[] }>;
  incompleteOrContradictoryDocumentIds: string[];
};
