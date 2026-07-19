import type { AutofillFormCode } from './applicationAutofill';
import type { DocumentFieldId } from './documentEngine';

export type DocumentLayoutElementKind = 'TEXT' | 'CHECKBOX';
export type DocumentLayoutTextAlign = 'LEFT' | 'CENTER' | 'RIGHT';

export type DocumentLayoutElement = {
  id: string;
  kind: DocumentLayoutElementKind;
  fieldId: DocumentFieldId;
  page: number;
  x: number;
  y: number;
  width?: number;
  height?: number;
  fontSize?: number;
  lineHeight?: number;
  maxLines?: number;
  align?: DocumentLayoutTextAlign;
  uppercase?: boolean;
  choiceValue?: string;
  mark?: string;
};

export type DocumentLayoutDefinition = {
  id: string;
  templateCode: AutofillFormCode;
  templateVersion: string;
  language: 'en' | 'af' | 'zu' | 'other';
  pageCount: number;
  sourceAuthority: string;
  sourceUrl: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  status: 'DRAFT' | 'ACTIVE' | 'RETIRED';
  elements: DocumentLayoutElement[];
};

export type DocumentLayoutValidationIssue = {
  elementId: string | null;
  message: string;
};

export type DocumentLayoutValidationResult = {
  valid: boolean;
  issues: DocumentLayoutValidationIssue[];
};
