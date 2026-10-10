import type { DocumentRecord } from '../types/document';

export const CANONICAL_MOTIVATION_HASH = 'd87785faa295333f7b1b9bbc4b0107effe54759160d71cb28ce77665c26c0bb2';
export const MOTIVATION_MAPPING_VERSION = 'CANONICAL_V1';
export type MotivationState = 'NOT_GENERATED' | 'OUTDATED' | 'AWAITING_REVIEW' | 'CONFIRMED';
export function isCanonicalMotivation(d: DocumentRecord): boolean {
  return d.document_type === 'MOTIVATION' && d.is_generated && d.metadata?.motivationMappingVersion === MOTIVATION_MAPPING_VERSION;
}
export function latestMotivation(documents: DocumentRecord[], caseId: string): DocumentRecord | undefined {
  return documents.filter(d => isCanonicalMotivation(d) && d.application_case_id === caseId)
    .sort((a, b) => b.version_number - a.version_number || b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id))[0];
}
export function currentMotivation(documents: DocumentRecord[], caseId: string): DocumentRecord | undefined {
  const latest = latestMotivation(documents, caseId);
  // Archiving/rejecting the newest version must never resurrect an older approval.
  return latest?.lifecycle_status === 'ACTIVE' ? latest : undefined;
}
export function motivationState(document: DocumentRecord | undefined, snapshot: string): MotivationState {
  if (!document) return 'NOT_GENERATED';
  if (document.metadata.motivationSourceSnapshot !== snapshot) return 'OUTDATED';
  return document.is_verified && document.metadata.motivationConfirmedSnapshot === snapshot ? 'CONFIRMED' : 'AWAITING_REVIEW';
}
export function stableMotivationJson(value: unknown): string {
  const normalise = (v: any): any => Array.isArray(v) ? v.map(normalise) : v && typeof v === 'object'
    ? Object.fromEntries(Object.keys(v).sort().map(k => [k, normalise(v[k])])) : v;
  return JSON.stringify(normalise(value));
}
