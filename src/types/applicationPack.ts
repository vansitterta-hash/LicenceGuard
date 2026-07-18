import type {
  ApplicationCaseStatus,
  ApplicationCaseType,
} from './applicationCase';
import type { DocumentRecord, DocumentType } from './document';

export type ApplicationPackState =
  | 'BLOCKED'
  | 'ACTION_REQUIRED'
  | 'READY';

export type ApplicationPackItemState =
  | 'COMPLETE'
  | 'MISSING'
  | 'EXPIRED'
  | 'UNVERIFIED';

export type ApplicationPackItem = {
  key: string;
  order: number;
  label: string;
  detail: string;
  required: boolean;
  state: ApplicationPackItemState;
  documentType: DocumentType | null;
  document: DocumentRecord | null;
};

export type ApplicationPackManifest = {
  generatedAt: string;
  clientId: string;
  clientName: string;
  clientIdNumber: string;
  applicationCaseId: string;
  applicationType: ApplicationCaseType;
  applicationTypeLabel: string;
  caseStatus: ApplicationCaseStatus;
  subject: string;
  licenceSection: string | null;
  packState: ApplicationPackState;
  readinessScore: number;
  totalItems: number;
  completeItems: number;
  missingItems: number;
  warningItems: number;
  blockingReasons: string[];
  items: ApplicationPackItem[];
};

export type PrepareApplicationPackResult = {
  manifest: ApplicationPackManifest;
  nextStatus: ApplicationCaseStatus;
};