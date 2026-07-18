import type { CompetencyCategory } from './competency';

export type ApplicationCaseType =
  | 'COMPETENCY_FIRST_APPLICATION'
  | 'COMPETENCY_ADDITIONAL_CATEGORY'
  | 'COMPETENCY_RENEWAL'
  | 'COMPETENCY_REAPPLICATION'
  | 'FIREARM_LICENCE_FIRST_APPLICATION'
  | 'FIREARM_LICENCE_ADDITIONAL_APPLICATION'
  | 'FIREARM_LICENCE_RENEWAL'
  | 'FIREARM_LICENCE_REAPPLICATION'
  | 'TEMPORARY_AUTHORISATION'
  | 'APPEAL_OR_RECONSIDERATION';

export type FirearmAcquisitionSource =
  | 'DEALER'
  | 'PRIVATE_SELLER'
  | 'EXISTING_FIREARM'
  | 'NOT_APPLICABLE';

export type ApplicationCaseStatus =
  | 'NOT_STARTED'
  | 'CLIENT_CONTACTED'
  | 'DOCUMENTS_REQUESTED'
  | 'DOCUMENTS_INCOMPLETE'
  | 'DOCUMENTS_COMPLETE'
  | 'PACK_IN_PREPARATION'
  | 'READY_FOR_SUBMISSION'
  | 'SUBMITTED'
  | 'APPROVED'
  | 'DECLINED'
  | 'WITHDRAWN'
  | 'CLOSED';

export type ApplicationCaseRecord = {
  id: string;
  dealer_id: string;
  client_id: string;

  application_type: ApplicationCaseType;
  status: ApplicationCaseStatus;

  competency_category: CompetencyCategory | null;
  competency_id: string | null;

  firearm_id: string | null;
  firearm_licence_id: string | null;
  licence_section: string | null;

  acquisition_source: FirearmAcquisitionSource;
  supplier_name: string | null;
  supplier_id_or_registration: string | null;
  supplier_contact: string | null;
  supplier_licence_number: string | null;
  sale_or_invoice_reference: string | null;
  motivation_summary: string | null;

  opened_date: string;
  target_submission_date: string | null;
  actual_submission_date: string | null;

  application_reference: string | null;
  police_station: string | null;

  outcome_date: string | null;
  outcome_notes: string | null;

  withdrawn_date: string | null;
  closed_date: string | null;

  assigned_to: string | null;
  progress_percent: number;

  dealer_notes: string | null;
  client_notes: string | null;

  created_by: string | null;
  updated_by: string | null;

  created_at: string;
  updated_at: string;
};

export type ApplicationCaseListItem =
  ApplicationCaseRecord & {
    clientName: string;
    clientIdNumber: string;

    subjectDescription: string;
    firearmDescription: string | null;

    isOpen: boolean;
    isOverdue: boolean;
    daysUntilTarget: number | null;
  };

export type ApplicationCaseFormValues = {
  applicationType: ApplicationCaseType;
  status: ApplicationCaseStatus;

  competencyCategory: CompetencyCategory;
  competencyId: string;

  firearmId: string;
  firearmLicenceId: string;
  licenceSection: string;

  acquisitionSource: FirearmAcquisitionSource;
  supplierName: string;
  supplierIdOrRegistration: string;
  supplierContact: string;
  supplierLicenceNumber: string;
  saleOrInvoiceReference: string;
  motivationSummary: string;

  openedDate: string;
  targetSubmissionDate: string;
  actualSubmissionDate: string;

  applicationReference: string;
  policeStation: string;

  outcomeDate: string;
  outcomeNotes: string;

  progressPercent: string;

  dealerNotes: string;
  clientNotes: string;
};

export type ApplicationCaseSubjectOption = {
  id: string;
  label: string;
  secondaryLabel: string;
};


export const FIREARM_ACQUISITION_SOURCES: Array<{
  value: FirearmAcquisitionSource;
  label: string;
  description: string;
}> = [
  {
    value: 'DEALER',
    label: 'Dealer purchase',
    description: 'The firearm is being supplied by a licensed firearms dealer.',
  },
  {
    value: 'PRIVATE_SELLER',
    label: 'Private sale',
    description: 'The firearm is being purchased or transferred from a private individual.',
  },
  {
    value: 'EXISTING_FIREARM',
    label: 'Existing firearm',
    description: 'Use for a renewal, reapplication or another case involving a firearm already held by the client.',
  },
  {
    value: 'NOT_APPLICABLE',
    label: 'Not applicable',
    description: 'Use for competency-only applications and cases without a firearm supplier.',
  },
];

export function isNewFirearmLicenceApplication(
  applicationType: ApplicationCaseType
): boolean {
  return [
    'FIREARM_LICENCE_FIRST_APPLICATION',
    'FIREARM_LICENCE_ADDITIONAL_APPLICATION',
  ].includes(applicationType);
}

export const APPLICATION_CASE_TYPES: Array<{
  value: ApplicationCaseType;
  label: string;
  description: string;
}> = [
  {
    value: 'COMPETENCY_FIRST_APPLICATION',
    label: 'First competency application',
    description:
      'Apply for the client’s first firearm competency category.',
  },
  {
    value: 'COMPETENCY_ADDITIONAL_CATEGORY',
    label: 'Additional competency category',
    description:
      'Add a new competency category where the client already holds another category.',
  },
  {
    value: 'COMPETENCY_RENEWAL',
    label: 'Competency renewal',
    description:
      'Renew an existing competency before it expires.',
  },
  {
    value: 'COMPETENCY_REAPPLICATION',
    label: 'Competency reapplication',
    description:
      'Reapply or regularise a competency that has expired or cannot continue as an ordinary renewal.',
  },
  {
    value: 'FIREARM_LICENCE_FIRST_APPLICATION',
    label: 'First firearm licence application',
    description:
      'Apply for the client’s first firearm licence.',
  },
  {
    value: 'FIREARM_LICENCE_ADDITIONAL_APPLICATION',
    label: 'Additional firearm licence application',
    description:
      'Apply for another firearm where the client already holds one or more firearm licences.',
  },
  {
    value: 'FIREARM_LICENCE_RENEWAL',
    label: 'Firearm licence renewal',
    description:
      'Renew an existing firearm licence before expiry.',
  },
  {
    value: 'FIREARM_LICENCE_REAPPLICATION',
    label: 'Firearm licence reapplication',
    description:
      'Reapply where an expired or otherwise lapsed licence cannot proceed as an ordinary renewal.',
  },
  {
    value: 'TEMPORARY_AUTHORISATION',
    label: 'Temporary authorisation',
    description:
      'Track an application for temporary authorisation linked to a firearm.',
  },
  {
    value: 'APPEAL_OR_RECONSIDERATION',
    label: 'Appeal or reconsideration',
    description:
      'Track an appeal or reconsideration following an adverse application outcome.',
  },
];

export const APPLICATION_CASE_STATUSES: Array<{
  value: ApplicationCaseStatus;
  label: string;
  progressPercent: number;
}> = [
  { value: 'NOT_STARTED', label: 'Not started', progressPercent: 0 },
  { value: 'CLIENT_CONTACTED', label: 'Client contacted', progressPercent: 10 },
  { value: 'DOCUMENTS_REQUESTED', label: 'Documents requested', progressPercent: 20 },
  { value: 'DOCUMENTS_INCOMPLETE', label: 'Documents incomplete', progressPercent: 30 },
  { value: 'DOCUMENTS_COMPLETE', label: 'Documents complete', progressPercent: 50 },
  { value: 'PACK_IN_PREPARATION', label: 'Pack in preparation', progressPercent: 65 },
  { value: 'READY_FOR_SUBMISSION', label: 'Ready for submission', progressPercent: 80 },
  { value: 'SUBMITTED', label: 'Submitted', progressPercent: 90 },
  { value: 'APPROVED', label: 'Approved', progressPercent: 100 },
  { value: 'DECLINED', label: 'Declined', progressPercent: 100 },
  { value: 'WITHDRAWN', label: 'Withdrawn', progressPercent: 100 },
  { value: 'CLOSED', label: 'Closed', progressPercent: 100 },
];

export const CLOSED_APPLICATION_CASE_STATUSES:
  ApplicationCaseStatus[] = [
    'APPROVED',
    'DECLINED',
    'WITHDRAWN',
    'CLOSED',
  ];

export function isCompetencyApplicationType(
  applicationType: ApplicationCaseType
): boolean {
  return [
    'COMPETENCY_FIRST_APPLICATION',
    'COMPETENCY_ADDITIONAL_CATEGORY',
    'COMPETENCY_RENEWAL',
    'COMPETENCY_REAPPLICATION',
  ].includes(applicationType);
}

export function isFirearmApplicationType(
  applicationType: ApplicationCaseType
): boolean {
  return [
    'FIREARM_LICENCE_FIRST_APPLICATION',
    'FIREARM_LICENCE_ADDITIONAL_APPLICATION',
    'FIREARM_LICENCE_RENEWAL',
    'FIREARM_LICENCE_REAPPLICATION',
    'TEMPORARY_AUTHORISATION',
    'APPEAL_OR_RECONSIDERATION',
  ].includes(applicationType);
}

export function getApplicationCaseTypeLabel(
  applicationType: ApplicationCaseType
): string {
  return (
    APPLICATION_CASE_TYPES.find(
      (item) => item.value === applicationType
    )?.label ?? applicationType
  );
}

export function getApplicationCaseStatusLabel(
  status: ApplicationCaseStatus
): string {
  return (
    APPLICATION_CASE_STATUSES.find(
      (item) => item.value === status
    )?.label ?? status
  );
}

export function getDefaultProgressForStatus(
  status: ApplicationCaseStatus
): number {
  return (
    APPLICATION_CASE_STATUSES.find(
      (item) => item.value === status
    )?.progressPercent ?? 0
  );
}