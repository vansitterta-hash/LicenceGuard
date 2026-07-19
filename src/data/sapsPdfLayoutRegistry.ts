import type { AutofillFormCode } from '../types/applicationAutofill';
import type { DocumentLayoutDefinition } from '../types/documentLayout';
import { getDocumentLayout } from '../engines/documentLayoutEngine';

/**
 * Backwards-compatible adapter for existing callers.
 * Layout coordinates now live in versioned data definitions rather than renderer code.
 */
export type PdfTemplateLayout = DocumentLayoutDefinition;

export function getPdfTemplateLayout(code: AutofillFormCode): PdfTemplateLayout | null {
  return getDocumentLayout(code);
}
