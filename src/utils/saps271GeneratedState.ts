import { DOCUMENT_LAYOUT_DEFINITIONS } from '../data/documentLayoutDefinitions';
import { resolveDocumentField } from '../engines/documentEngine';
import type { DocumentEngineContext } from '../types/documentEngine';
import type { DocumentRecord } from '../types/document';

export type Saps271GeneratedState = 'NOT_GENERATED' | 'AWAITING_REVIEW' | 'OUTDATED' | 'CONFIRMED';
export function isGenerated271(document: DocumentRecord): boolean {
  return document.is_generated && document.document_type === 'FIREARM_LICENCE_APPLICATION_FORM' && document.metadata?.formCode === 'SAPS_271';
}
export function currentGenerated271(documents: DocumentRecord[], caseId: string): DocumentRecord | undefined {
  return documents.filter(d=>isGenerated271(d) && d.application_case_id === caseId && d.lifecycle_status === 'ACTIVE')
    .sort((a,b)=>(b.version_number ?? 1)-(a.version_number ?? 1) || b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id))[0];
}
// The snapshot is stored only in the already-private document metadata. It
// contains actual overlay inputs, not timestamps or unrelated profile answers.
export function saps271SourceSnapshot(context: DocumentEngineContext): string {
  const layout = DOCUMENT_LAYOUT_DEFINITIONS.find(l=>l.templateCode === 'SAPS_271')!;
  return JSON.stringify([context.data.application.applicationCaseId, layout.id, layout.elements.map(e=>[
    e.id, resolveDocumentField(e.fieldId,context), e.conditionFieldId ? resolveDocumentField(e.conditionFieldId,context) : '',
  ])]);
}
export function saps271GeneratedState(document: DocumentRecord | undefined, snapshot: string): Saps271GeneratedState {
  if (!document) return 'NOT_GENERATED';
  if (document.metadata?.saps271SourceSnapshot !== snapshot) return 'OUTDATED';
  return document.is_verified ? 'CONFIRMED' : 'AWAITING_REVIEW';
}
export function saps271FormAction(state: Saps271GeneratedState): string {
  return state === 'NOT_GENERATED' ? 'Generate SAPS 271' : state === 'OUTDATED' ? 'Regenerate SAPS 271' : 'Preview / Review SAPS 271';
}
