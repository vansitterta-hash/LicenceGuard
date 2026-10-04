import type { ApplicationCaseType } from '../types/applicationCase';
import type { CompetencyCategory } from '../types/competency';
import type { DocumentType } from '../types/document';
import type { ClientRecord } from '../types/client';
import type { ApplicationCaseRecord, ApplicationCaseStatus } from '../types/applicationCase';
import type { CompetencyRecord } from '../types/competency';
import type { DocumentRecord } from '../types/document';
import type { FirearmLicenceRecord, FirearmRecord } from '../types/firearm';
import type { ApplicationCaseReadiness } from '../types/applicationReadiness';

export type IntelligenceDecision =
  | 'AUTO_SELECTED'
  | 'RECOMMENDED'
  | 'REQUIRES_REVIEW'
  | 'BLOCKED';

export type IntelligenceConfidence =
  | 'HIGH'
  | 'MEDIUM'
  | 'LOW';

export type IntelligenceSource =
  | 'RULE_ENGINE'
  | 'DOCUMENT_LIBRARY'
  | 'APPLICATION_HISTORY'
  | 'USER_INPUT';

export type IntelligenceMatchReason = {
  field: string;
  value: string;
  explanation: string;
};

export type IntelligenceRecommendation = {
  id: string;

  decision: IntelligenceDecision;

  confidence: IntelligenceConfidence;

  source: IntelligenceSource;

  title: string;

  description: string;

  reasons: IntelligenceMatchReason[];

  score: number;
};


export type ApplicationIntelligenceContext = {
  applicationCaseId: string;

  applicationType: ApplicationCaseType;

  licenceSection: string | null;

  competencyCategory: CompetencyCategory | null;

  intendedUse?: string | null;

  primaryPurpose?: string | null;

  sportDiscipline?: string | null;

  sportAssociation?: string | null;

  firearm: {
    id: string;
    make: string;
    model: string | null;
    calibre: string;
    serialNumber: string;
    firearmType: string;
  } | null;

  client: {
    id: string;
    name: string;
    idNumber: string;
  };

  existingDocuments: DocumentType[];

  previousApplications: ApplicationCaseType[];
};


export type MotivationRecommendation = IntelligenceRecommendation & {
  documentType: 'MOTIVATION';

  templateId: string | null;
};


export type FirearmInformationRecommendation = IntelligenceRecommendation & {
  documentType:
    | 'SUPPORTING_RESEARCH'
    | 'SUPPORTING_DOCUMENT';

  firearmMatch: {
    calibreMatched: boolean;
    makeMatched: boolean;
    modelMatched: boolean;
    firearmTypeMatched: boolean;
  };
};


export type DocumentSelectionResult = {
  selectedDocuments: Array<{
    documentType: DocumentType;
    recommendationId: string;
    confidence: IntelligenceConfidence;
  }>;

  rejectedDocuments: Array<{
    documentType: DocumentType;
    reason: string;
  }>;

  recommendations: IntelligenceRecommendation[];
};


export type ApplicationIntelligenceResult = {
  context: ApplicationIntelligenceContext;

  motivation: MotivationRecommendation | null;

  firearmInformation: FirearmInformationRecommendation[];

  documentSelection: DocumentSelectionResult;

  warnings: string[];

  generatedAt: string;
};

export type IntelligenceSourceScope =
  | 'CLIENT'
  | 'FIREARM'
  | 'HISTORICAL_APPLICATION'
  | 'DEALER_LIBRARY'
  | 'PUBLIC_LIBRARY';

export type IntelligenceSourceRecord = {
  id: string;
  scope: IntelligenceSourceScope;
  dealerId: string | null;
  clientId: string | null;
  firearmId: string | null;
  applicationCaseId: string | null;
  documentId: string | null;
  title: string;
  sourceAuthority: string | null;
  trustLevel: 'DIRECT' | 'PRIVATE_REVIEWED' | 'PUBLIC_REVIEWED' | 'UNREVIEWED';
  private: boolean;
  metadata: Record<string, unknown>;
};

export type CandidateScoreFactorKey =
  | 'EXACT_FIREARM'
  | 'EXACT_APPLICATION'
  | 'EXACT_COMPETENCY'
  | 'EXACT_CALIBRE'
  | 'FIREARM_CATEGORY'
  | 'MAKE_MODEL'
  | 'LICENCE_SECTION'
  | 'INTENDED_USE'
  | 'CLIENT_OWNERSHIP'
  | 'HISTORICAL_USE'
  | 'PRIOR_USER_ACCEPTANCE'
  | 'PRIOR_SUBMISSION_OUTCOME'
  | 'DOCUMENT_VERIFICATION'
  | 'LIFECYCLE_STATUS'
  | 'FRESHNESS'
  | 'SOURCE_TRUST';

export type CandidateScoreFactor = {
  key: CandidateScoreFactorKey;
  label: string;
  weight: number;
  value: number;
  contribution: number;
  explanation: string;
  dataAvailable: boolean;
};

export type CandidateScoreBreakdown = {
  factors: CandidateScoreFactor[];
  rawScore: number;
  maximumScore: number;
  normalisedScore: number;
};

export type CandidateConfidence = {
  level: IntelligenceConfidence;
  score: number;
  basis: string[];
  missingData: string[];
};

export type RecommendationExplanation = {
  summary: string;
  positiveReasons: string[];
  cautions: string[];
  sourceScope: IntelligenceSourceScope;
  legalReviewRequired: true;
};

export type CandidateDocument = {
  id: string;
  documentType: DocumentType;
  documentId: string | null;
  source: IntelligenceSourceRecord;
  title: string;
  storagePath: string | null;
  lifecycleStatus: string | null;
  verified: boolean;
  expiryDate: string | null;
  matchSignals: Partial<Record<CandidateScoreFactorKey, number>>;
  score: CandidateScoreBreakdown | null;
  confidence: CandidateConfidence | null;
  explanation: RecommendationExplanation | null;
  metadata: Record<string, unknown>;
};

export type ApplicationUserSelection = {
  documentType: DocumentType;
  candidateId: string;
  selectedBy: string | null;
  selectedAt: string | null;
  reason: string | null;
};

export type ApplicationUserOverride = {
  key: string;
  originalValue: unknown;
  replacementValue: unknown;
  overriddenBy: string | null;
  overriddenAt: string | null;
  reason: string | null;
};

export type RenewalWindowContext = {
  subjectType: 'FIREARM_LICENCE' | 'COMPETENCY' | null;
  subjectId: string | null;
  expiryDate: string | null;
  daysUntilExpiry: number | null;
  windowStartDate: string | null;
  inRenewalWindow: boolean;
};

export type ApplicationContext = {
  builtAt: string;
  dealer: { id: string; companyName: string | null };
  client: ClientRecord;
  applicationCase: ApplicationCaseRecord;
  applicationType: ApplicationCaseType;
  licenceSection: string | null;
  intendedUse: string | null;
  firearm: FirearmRecord | null;
  firearmLicence: FirearmLicenceRecord | null;
  competency: CompetencyRecord | null;
  renewalWindow: RenewalWindowContext;
  documents: DocumentRecord[];
  firearmDocuments: DocumentRecord[];
  historicalApplications: ApplicationCaseRecord[];
  historicalApplicationDocuments: DocumentRecord[];
  previousMotivations: DocumentRecord[];
  dealerLibrarySources: IntelligenceSourceRecord[];
  publicLibrarySources: IntelligenceSourceRecord[];
  unavailableSourceScopes: IntelligenceSourceScope[];
  readiness: ApplicationCaseReadiness | null;
  generatedSapsForms: DocumentRecord[];
  packState: 'NOT_STARTED' | 'IN_PREPARATION' | 'GENERATED' | 'READY_FOR_SUBMISSION';
  userSelections: ApplicationUserSelection[];
  userOverrides: ApplicationUserOverride[];
  missingData: string[];
};

export type LearningEventType =
  | 'RECOMMENDATION_SHOWN'
  | 'SOURCE_SELECTED'
  | 'SOURCE_REJECTED'
  | 'USER_OVERRIDE'
  | 'DOCUMENT_REPLACED'
  | 'PACK_GENERATED'
  | 'APPLICATION_SUBMITTED'
  | 'APPLICATION_APPROVED'
  | 'APPLICATION_REFUSED'
  | 'SOURCE_REUSED_SUCCESSFULLY';

export type LearningEvent = {
  id: string;
  eventType: LearningEventType;
  occurredAt: string;
  dealerId: string;
  clientId: string;
  applicationCaseId: string;
  candidateId: string | null;
  sourceScope: IntelligenceSourceScope | null;
  actorId: string | null;
  outcome: ApplicationCaseStatus | null;
  payload: Record<string, unknown>;
  appendOnly: true;
};

export type IntelligenceFeatureFlag =
  | 'READ_ONLY_INTELLIGENCE'
  | 'PRIVATE_LIBRARY_INTEGRATION'
  | 'PROACTIVE_RENEWALS'
  | 'DEALER_LIBRARY'
  | 'PUBLIC_LIBRARY'
  | 'LEARNING_FEEDBACK';

export type AutomaticOperation =
  | 'BUILD_CONTEXT'
  | 'PREPARE_RENEWAL_CASE'
  | 'LINK_REUSABLE_DOCUMENTS'
  | 'GENERATE_SAPS_FORM'
  | 'GENERATE_DRAFT_PACK'
  | 'SEND_RENEWAL_NOTIFICATION';

export type IdempotencyKey = {
  value: string;
  operation: AutomaticOperation;
  dealerId: string;
  clientId: string;
  applicationCaseId: string | null;
  subjectType: string | null;
  subjectId: string | null;
  renewalWindow: string | null;
};

export type IntelligenceAuditEvent = {
  eventType: `INTELLIGENCE_${string}`;
  title: string;
  detail: string | null;
  applicationCaseId: string;
  actorId: string | null;
  idempotencyKey: string | null;
  payload: Record<string, unknown>;
};
