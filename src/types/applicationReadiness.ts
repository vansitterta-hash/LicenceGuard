import type { ApplicationCaseType } from './applicationCase';
import type { CompetencyCategory } from './competency';
import type { DocumentType } from './document';

export type ApplicationReadinessState =
  | 'READY'
  | 'ACTION_REQUIRED'
  | 'BLOCKED'
  | 'NO_CASES';

export type RequirementState =
  | 'SATISFIED'
  | 'MISSING'
  | 'UNVERIFIED'
  | 'EXPIRED'
  | 'PENDING_GENERATION'
  | 'MANUAL_REQUIRED'
  | 'PHYSICAL_REQUIRED'
  | 'NOT_APPLICABLE';

export type RequirementDelivery =
  | 'DIGITAL'
  | 'MANUAL_PACK'
  | 'PHYSICAL_SUBMISSION';

export type ReadinessRequirement = {
  generatedFormState?: import('../utils/saps271GeneratedState').Saps271GeneratedState;
  /** Existing source selected for this requirement; no document record is mutated. */
  documentId?: string;
  key: string;
  label: string;
  detail: string;
  state: RequirementState;
  required: boolean;
  documentType: DocumentType | null;
  acceptableDocumentTypes?: DocumentType[];
  evidenceKind?: 'SAFE_PHOTO' | 'SAFE_SECURING_PHOTO';
  requiresFirearmMatch?: boolean;
  delivery: RequirementDelivery;
};

export type ApplicationCaseReadiness = {
  caseId: string;
  applicationType: ApplicationCaseType;
  subject: string;
  status: string;
  competencyCategory: CompetencyCategory | null;
  firearmId: string | null;
  firearmLicenceId: string | null;
  licenceSection: string | null;
  score: number;
  state: ApplicationReadinessState;
  readyToGenerate: boolean;
  requirements: ReadinessRequirement[];
  missingCount: number;
  warningCount: number;
  unsupportedMessage?: string;
};

export type ClientApplicationReadiness = {
  clientId: string;
  clientName: string;
  state: ApplicationReadinessState;
  score: number;
  readyCases: number;
  blockedCases: number;
  actionRequiredCases: number;
  cases: ApplicationCaseReadiness[];
};
