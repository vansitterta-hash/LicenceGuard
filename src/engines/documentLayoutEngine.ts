import { DOCUMENT_LAYOUT_DEFINITIONS } from '../data/documentLayoutDefinitions';
import type { AutofillFormCode } from '../types/applicationAutofill';
import type {
  DocumentLayoutDefinition,
  DocumentLayoutValidationResult,
} from '../types/documentLayout';

function isDateActive(layout: DocumentLayoutDefinition, at: Date): boolean {
  const timestamp = at.getTime();
  const start = layout.effectiveFrom ? new Date(layout.effectiveFrom).getTime() : Number.NEGATIVE_INFINITY;
  const end = layout.effectiveTo ? new Date(layout.effectiveTo).getTime() : Number.POSITIVE_INFINITY;
  return timestamp >= start && timestamp <= end;
}

export function validateDocumentLayout(layout: DocumentLayoutDefinition): DocumentLayoutValidationResult {
  const issues: DocumentLayoutValidationResult['issues'] = [];
  const ids = new Set<string>();

  if (!layout.id.trim()) issues.push({ elementId: null, message: 'Layout id is required.' });
  if (layout.pageCount < 1) issues.push({ elementId: null, message: 'Page count must be at least one.' });
  if (!layout.sourceUrl.trim()) issues.push({ elementId: null, message: 'Template source URL is required.' });

  for (const element of layout.elements) {
    if (ids.has(element.id)) issues.push({ elementId: element.id, message: 'Element id must be unique.' });
    ids.add(element.id);
    if (element.page < 1 || element.page > layout.pageCount) issues.push({ elementId: element.id, message: `Page ${element.page} is outside the declared page count.` });
    if (!Number.isFinite(element.x) || !Number.isFinite(element.y)) issues.push({ elementId: element.id, message: 'Coordinates must be finite numbers.' });
    if (element.kind === 'CHECKBOX' && !element.choiceValue) issues.push({ elementId: element.id, message: 'Checkbox elements require a choiceValue.' });
    if (element.width !== undefined && element.width <= 0) issues.push({ elementId: element.id, message: 'Width must be greater than zero.' });
    if (element.fontSize !== undefined && element.fontSize <= 0) issues.push({ elementId: element.id, message: 'Font size must be greater than zero.' });
  }

  return { valid: issues.length === 0, issues };
}

export function getDocumentLayout(
  templateCode: AutofillFormCode,
  options?: { version?: string; at?: Date },
): DocumentLayoutDefinition | null {
  const at = options?.at ?? new Date();
  const candidates = DOCUMENT_LAYOUT_DEFINITIONS.filter((layout) =>
    layout.templateCode === templateCode &&
    layout.status === 'ACTIVE' &&
    (!options?.version || layout.templateVersion === options.version) &&
    isDateActive(layout, at),
  );

  const layout = candidates.at(-1) ?? null;
  if (!layout) return null;
  const validation = validateDocumentLayout(layout);
  if (!validation.valid) {
    throw new Error(`Invalid document layout ${layout.id}: ${validation.issues.map((issue) => issue.message).join(' ')}`);
  }
  return layout;
}

export function listDocumentLayouts(templateCode?: AutofillFormCode): DocumentLayoutDefinition[] {
  return DOCUMENT_LAYOUT_DEFINITIONS.filter((layout) => !templateCode || layout.templateCode === templateCode);
}
