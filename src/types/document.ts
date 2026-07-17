export type DocumentType =
  | 'ID_COPY'
  | 'PASSPORT_PHOTO'
  | 'PROOF_OF_ADDRESS'
  | 'COMPETENCY_CERTIFICATE'
  | 'FIREARM_LICENCE'
  | 'MOTIVATION'
  | 'SUPPORTING_DOCUMENT'
  | 'OTHER'
  | 'FIREARM_LICENCE_CARD'
  | 'COMPETENCY_APPLICATION'
  | 'COMPETENCY_RENEWAL_FORM'
  | 'FIREARM_LICENCE_APPLICATION_FORM'
  | 'FIREARM_LICENCE_RENEWAL_FORM'
  | 'DEALER_STOCK_DOCUMENT'
  | 'SELLER_ID_COPY'
  | 'SELLER_LICENCE_COPY'
  | 'PURCHASE_INVOICE'
  | 'ENDORSEMENT'
  | 'DEDICATED_STATUS'
  | 'GOOD_STANDING'
  | 'MEMBERSHIP_CERTIFICATE'
  | 'SAFE_AFFIDAVIT'
  | 'TESTIMONIAL'
  | 'SUPPORTING_RESEARCH'
  | 'PAYMENT_RECEIPT'
  | 'SUBMISSION_CONFIRMATION'
  | 'OUTCOME_DOCUMENT'
  | 'CLIENT_SIGNATURE';

export type DocumentScope =
  | 'CLIENT'
  | 'COMPETENCY'
  | 'FIREARM'
  | 'FIREARM_LICENCE'
  | 'APPLICATION_CASE'
  | 'GLOBAL_TEMPLATE';

export type DocumentLifecycleStatus =
  | 'ACTIVE'
  | 'SUPERSEDED'
  | 'ARCHIVED'
  | 'REJECTED';

export type DocumentTemplateStatus =
  | 'DRAFT'
  | 'ACTIVE'
  | 'SUPERSEDED'
  | 'ARCHIVED';

export type DocumentTemplateFormat =
  | 'PDF'
  | 'DOCX'
  | 'HTML'
  | 'OTHER';

export type DocumentRecord = {
  id: string;
  dealer_id: string;
  client_id: string;
  competency_id: string | null;
  firearm_id: string | null;
  firearm_licence_id: string | null;
  application_case_id: string | null;
  parent_document_id: string | null;
  document_type: DocumentType;
  document_scope: DocumentScope;
  lifecycle_status: DocumentLifecycleStatus;
  document_name: string;
  document_date: string | null;
  expiry_date: string | null;
  issued_by: string | null;
  reference_number: string | null;
  version_number: number;
  storage_path: string;
  file_name: string;
  original_file_name: string | null;
  mime_type: string | null;
  file_size_bytes: number | null;
  checksum_sha256: string | null;
  is_verified: boolean;
  is_generated: boolean;
  generated_from_template_id: string | null;
  archived_at: string | null;
  archived_by: string | null;
  archive_reason: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type DocumentTemplateRecord = {
  id: string;
  template_code: string;
  template_name: string;
  description: string | null;
  application_type: string | null;
  document_type: DocumentType;
  format: DocumentTemplateFormat;
  status: DocumentTemplateStatus;
  source_authority: string | null;
  source_url: string | null;
  storage_path: string | null;
  current_version: number;
  effective_date: string | null;
  superseded_date: string | null;
  field_map: Record<string, unknown>;
  notes: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type DocumentUploadValues = {
  documentType: DocumentType;
  documentScope: DocumentScope;
  documentName: string;
  documentDate: string;
  expiryDate: string;
  issuedBy: string;
  referenceNumber: string;
  notes: string;
};

export type ClientDocumentSummary = {
  total: number;
  verified: number;
  awaitingVerification: number;
  expiring: number;
  expired: number;
};

export const DOCUMENT_TYPE_OPTIONS: ReadonlyArray<{
  value: DocumentType;
  label: string;
}> = [
  { value: 'ID_COPY', label: 'Identification copy' },
  { value: 'PASSPORT_PHOTO', label: 'Passport photographs' },
  { value: 'COMPETENCY_CERTIFICATE', label: 'Competency certificate' },
  { value: 'FIREARM_LICENCE_CARD', label: 'Firearm licence card' },
  {
    value: 'FIREARM_LICENCE_APPLICATION_FORM',
    label: 'SAPS firearm licence application form',
  },
  {
    value: 'FIREARM_LICENCE_RENEWAL_FORM',
    label: 'SAPS firearm licence renewal form',
  },
  {
    value: 'COMPETENCY_APPLICATION',
    label: 'SAPS competency application form',
  },
  {
    value: 'COMPETENCY_RENEWAL_FORM',
    label: 'SAPS competency renewal form',
  },
  { value: 'DEALER_STOCK_DOCUMENT', label: 'Dealer stock document' },
  { value: 'SELLER_ID_COPY', label: 'Private seller ID copy' },
  {
    value: 'SELLER_LICENCE_COPY',
    label: 'Private seller licence copy',
  },
  {
    value: 'PURCHASE_INVOICE',
    label: 'Purchase invoice or sale document',
  },
  { value: 'MOTIVATION', label: 'Motivation' },
  { value: 'ENDORSEMENT', label: 'Endorsement' },
  { value: 'DEDICATED_STATUS', label: 'Dedicated status certificate' },
  { value: 'GOOD_STANDING', label: 'Good-standing letter' },
  {
    value: 'MEMBERSHIP_CERTIFICATE',
    label: 'Membership certificate',
  },
  { value: 'SAFE_AFFIDAVIT', label: 'Safe affidavit' },
  { value: 'TESTIMONIAL', label: 'Testimonial' },
  { value: 'SUPPORTING_RESEARCH', label: 'Supporting research' },
  {
    value: 'SUPPORTING_DOCUMENT',
    label: 'Other supporting document',
  },
  { value: 'PAYMENT_RECEIPT', label: 'Payment receipt' },
  {
    value: 'SUBMISSION_CONFIRMATION',
    label: 'Submission confirmation',
  },
  { value: 'OUTCOME_DOCUMENT', label: 'Outcome document' },
  { value: 'CLIENT_SIGNATURE', label: 'Client signature' },
  { value: 'OTHER', label: 'Other document' },
];

export const EMPTY_DOCUMENT_UPLOAD_VALUES: DocumentUploadValues = {
  documentType: 'ID_COPY',
  documentScope: 'CLIENT',
  documentName: '',
  documentDate: '',
  expiryDate: '',
  issuedBy: '',
  referenceNumber: '',
  notes: '',
};

export function getDocumentTypeLabel(
  documentType: DocumentType
): string {
  return (
    DOCUMENT_TYPE_OPTIONS.find(
      (option) => option.value === documentType
    )?.label ?? documentType
  );
}
