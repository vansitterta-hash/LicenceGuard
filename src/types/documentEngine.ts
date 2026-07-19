import type { ApplicationCaseType } from './applicationCase';
import type { AutofillFormCode, ApplicationAutofillPackage } from './applicationAutofill';
import type { DocumentType } from './document';

export type DocumentFieldId =
  | `application.${string}`
  | `applicant.${string}`
  | `firearm.${string}`
  | `licence.${string}`
  | `competency.${string}`
  | `supplier.${string}`
  | `case.${string}`;

export type DocumentFieldDataType = 'TEXT' | 'DATE' | 'BOOLEAN' | 'CHOICE';

export type DocumentFieldDefinition = {
  id: DocumentFieldId;
  label: string;
  dataType: DocumentFieldDataType;
  sourcePath: string;
  normalise?: 'TRIM' | 'UPPERCASE' | 'DIGITS_ONLY' | 'SECTION_NUMBER';
};

export type DocumentTemplateFieldBinding = {
  fieldId: DocumentFieldId;
  label: string;
  section: string;
  required: boolean;
  page?: number;
  targetName?: string;
  choiceValue?: string;
};

export type DocumentTemplateDefinition = {
  code: AutofillFormCode;
  name: string;
  applicationTypes: ApplicationCaseType[];
  documentType: DocumentType;
  sourceAuthority: string;
  sourceUrl: string;
  instructionsUrl: string | null;
  versionLabel: string;
  bindings: DocumentTemplateFieldBinding[];
};

export type DocumentReviewValues = Record<string, string>;

export type DocumentEngineContext = {
  data: ApplicationAutofillPackage;
  reviewValues: DocumentReviewValues;
};

export type ResolvedDocumentField = DocumentTemplateFieldBinding & {
  value: string;
  valid: boolean;
};

export type ResolvedDocumentSection = {
  title: string;
  fields: ResolvedDocumentField[];
};

export type ResolvedDocument = {
  template: DocumentTemplateDefinition;
  sections: ResolvedDocumentSection[];
  mappedFieldCount: number;
  missingRequiredFieldCount: number;
  isComplete: boolean;
};

export type ApplicationPackItem = {
  key: string;
  label: string;
  documentType: DocumentType;
  required: boolean;
  reason: string;
  generated: boolean;
};

export type ApplicationPackManifest = {
  applicationType: ApplicationCaseType;
  templateCode: AutofillFormCode;
  items: ApplicationPackItem[];
  requiredCount: number;
  generatedCount: number;
};
