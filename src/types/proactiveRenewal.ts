import type { ApplicationCaseType } from './applicationCase';
import type { DocumentType } from './document';
import type { IdempotencyKey } from '../intelligence/types';

export type RenewalSubjectType = 'FIREARM_LICENCE' | 'COMPETENCY';

export type ProactiveRenewalStage =
  | 'ELIGIBILITY_CONFIRMED'
  | 'CASE_CREATED'
  | 'DOCUMENTS_LINKED'
  | 'SAPS_FORM_GENERATED'
  | 'DRAFT_PACK_PREPARED'
  | 'NOTIFICATION_CREATED'
  | 'AWAITING_REVIEW'
  | 'FAILED';

export type RenewalPreviewItem = {
  key: string;
  label: string;
  detail: string;
  documentType: DocumentType | null;
  state: 'AVAILABLE_VERIFIED' | 'AVAILABLE_UNVERIFIED' | 'EXPIRED' | 'MISSING' | 'PENDING_GENERATION' | 'PHYSICAL' | 'MANUAL_REVIEW';
  documentId: string | null;
};

export type RenewalEligibilityResult = {
  subjectType: RenewalSubjectType;
  subjectId: string;
  clientId: string;
  dealerId: string;
  description: string;
  applicationType: Extract<ApplicationCaseType, 'FIREARM_LICENCE_RENEWAL' | 'COMPETENCY_RENEWAL'>;
  firearmId: string | null;
  firearmLicenceId: string | null;
  competencyId: string | null;
  competencyCategory: string | null;
  licenceSection: string | null;
  expiryDate: string | null;
  daysUntilExpiry: number | null;
  renewalWindowStart: string | null;
  renewalWindowOpened: boolean;
  alreadyExpired: boolean;
  existingActiveCaseId: string | null;
  automaticPreparationAllowed: boolean;
  blockingReason: string | null;
  idempotencyKey: IdempotencyKey;
  automaticallyPreparedPreview: RenewalPreviewItem[];
  needsReviewPreview: RenewalPreviewItem[];
  proposedStages: ProactiveRenewalStage[];
  notificationPreview: string;
};

export type ProactiveRenewalPreview = {
  generatedAt: string;
  clientId: string;
  mode: 'PREVIEW';
  renewalWindowDays: 120;
  eligible: RenewalEligibilityResult[];
  blocked: RenewalEligibilityResult[];
  prepareModeAvailable: false;
  prepareModeBlocker: string;
  writesPerformed: false;
};
