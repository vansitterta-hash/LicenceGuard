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
  | 'NOT_APPLICABLE';

export type ReadinessRequirement = {
  key: string;
  label: string;
  detail: string;
  state: RequirementState;
  required: boolean;
  documentType: DocumentType | null;
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
