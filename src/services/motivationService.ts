import { supabase } from '../lib/supabase';
import { generatedDocumentPrivacy, registerGeneratedDocument } from './generatedApplicationDocumentService';
import { renderDocxAsPdf, renderCanonicalMotivationAsPdf } from '../engines/docxPdfRenderer';
import { applicableMotivationEvidence, defaultMotivationReview, motivationAnnexures, motivationReleaseIssues, motivationSourceSnapshot, populateCanonicalMotivation } from '../engines/canonicalMotivationEngine';
import { currentMotivation, latestMotivation, isCanonicalMotivation, motivationState, MOTIVATION_MAPPING_VERSION, CANONICAL_MOTIVATION_HASH } from '../utils/motivationGeneratedState';
import { resolveReusableCompetency } from '../utils/reusableCompetency';
import type { MotivationReview, MotivationSources } from '../types/motivation';
import type { DocumentRecord } from '../types/document';
import type { CompetencyRecord } from '../types/competency';

const db = supabase as any;
const BUCKET = 'licenceguard-documents';
export type MotivationIdentity = { dealerId: string; clientId: string; applicationCaseId: string; userId: string };

export function assertMotivationLinkage(s: MotivationSources, identity: MotivationIdentity): void {
  const { application: a, client: c, firearm: f, competency: k } = s;
  if (a.id !== identity.applicationCaseId || a.client_id !== identity.clientId || c.id !== identity.clientId || a.firearm_id !== f.id
    || f.client_id !== c.id || [a, c, f, ...(k ? [k] : [])].some(record => record.dealer_id !== identity.dealerId)
    || (k && (k.client_id !== c.id || k.category !== f.required_competency || (a.competency_id && a.competency_id !== k.id)))) {
    throw new Error('Motivation source client/application/firearm/competency links are inconsistent.');
  }
  for (const record of [a, c, f, ...(k ? [k] : [])] as any[]) {
    // Existing client/firearm records may have no owner. Their authenticated
    // SELECT still requires RLS authorization; NULL is not an access grant.
    const authorizedLegacySource = (record === c || record === f) && record.owner_user_id === null;
    if ((!authorizedLegacySource && record.owner_user_id !== identity.userId) || record.record_scope !== 'PRIVATE') throw new Error('Motivation requires the authenticated owner’s private source records.');
  }
  if (f.is_active !== true) throw new Error('The linked Motivation firearm must be active.');
  if (s.documents.some((d: any) => d.client_id !== c.id || d.dealer_id !== identity.dealerId || d.owner_user_id !== identity.userId || d.record_scope !== 'PRIVATE')) throw new Error('Document ownership/linkage is inconsistent.');
  if (!['FIREARM_LICENCE_FIRST_APPLICATION', 'FIREARM_LICENCE_ADDITIONAL_APPLICATION'].includes(a.application_type)
    || !['13', '15', '16', '17'].includes(a.licence_section ?? '')) throw new Error('This canonical Master applies to new firearm licence applications under Sections 13/15/16/17.');
}

export async function loadMotivationSources(identity: MotivationIdentity): Promise<MotivationSources> {
  const session = await supabase.auth.getSession();
  if (session.error || session.data.session?.user.id !== identity.userId) throw new Error('Sign in as the application owner before preparing Motivation.');
  const query = (table: string, ownerOnly = true) => {
    const selection = db.from(table).select('*').eq('dealer_id', identity.dealerId).eq('record_scope', 'PRIVATE');
    return ownerOnly ? selection.eq('owner_user_id', identity.userId) : selection;
  };
  const app = await query('application_cases').eq('id', identity.applicationCaseId).eq('client_id', identity.clientId).single();
  if (app.error || !app.data?.firearm_id) throw new Error('The authorized application and linked firearm are required.');
  const results = await Promise.all([
    query('clients', false).eq('id', identity.clientId).single(),
    query('firearms', false).eq('id', app.data.firearm_id).eq('client_id', identity.clientId).eq('is_active', true).single(),
    query('competencies').eq('client_id', identity.clientId),
    query('documents').eq('client_id', identity.clientId),
  ]);
  if (results.some(r => r.error) || !results[0].data || !results[1].data) throw new Error('Unable to load authorized Motivation source records.');
  const competency = resolveReusableCompetency<CompetencyRecord>(results[2].data ?? [], results[1].data.required_competency, app.data.competency_id, false) ?? null;
  const sources: MotivationSources = { application: app.data, client: results[0].data, firearm: results[1].data, competency, documents: results[3].data ?? [] };
  assertMotivationLinkage(sources, identity);
  return sources;
}

export function validateMotivationReview(review: MotivationReview): void {
  if (!review || typeof review.background !== 'string' || typeof review.narrative !== 'string' || review.background.length > 6000 || review.narrative.length > 12000
    || !Array.isArray(review.evidenceIds) || review.evidenceIds.length > 26 || !review.evidenceIds.every(id => typeof id === 'string')
    || !Array.isArray(review.claims) || review.claims.length > 40 || review.claims.some(c => typeof c.text !== 'string' || c.text.length > 3000 || typeof c.reviewed !== 'boolean')
    || !review.assertions || Object.values(review.assertions).some(v => typeof v !== 'boolean') || !review.collector
    || ['category', 'field', 'theme', 'subTheme', 'membership', 'approvalDocumentId', 'photographDocumentId', 'themeFit', 'points', 'regulation15'].some(key => typeof (review.collector as any)[key] !== 'string' || (review.collector as any)[key].length > 6000)
    || typeof review.collector.confirmed !== 'boolean' || typeof review.collector.legalReviewed !== 'boolean') throw new Error('Invalid or oversized Motivation review data.');
}

export async function getMotivationWorkspace(identity: MotivationIdentity) {
  const sources = await loadMotivationSources(identity);
  const current = currentMotivation(sources.documents, identity.applicationCaseId);
  const review = (current?.metadata.motivationDraft ?? current?.metadata.motivationReview ?? defaultMotivationReview(sources)) as MotivationReview;
  validateMotivationReview(review);
  let snapshot = '', issues: string[] = [];
  try { snapshot = motivationSourceSnapshot(sources, review); issues = motivationReleaseIssues(sources, review); }
  catch (error) { issues = [error instanceof Error ? error.message : 'Source evidence changed. Review and regenerate.']; }
  return { sources, current, review, snapshot, issues, state: motivationState(current, snapshot), history: sources.documents.filter(d => d.application_case_id === identity.applicationCaseId && isCanonicalMotivation(d)).sort((a, b) => b.version_number - a.version_number) };
}

/** Save corrections to existing private document metadata; the immutable PDF stays in history. */
export async function saveMotivationCorrections(identity: MotivationIdentity, documentId: string, review: MotivationReview): Promise<void> {
  validateMotivationReview(review);
  const workspace = await getMotivationWorkspace(identity);
  if (workspace.current?.id !== documentId) throw new Error('Reload the current Motivation before saving corrections.');
  const result = await db.from('documents').update({ metadata: { ...workspace.current.metadata, motivationDraft: review, motivationConfirmedSnapshot: null, motivationReviewedSnapshot: null }, is_verified: false, verified_at: null, verified_by: null })
    .eq('id', documentId).eq('owner_user_id', identity.userId).eq('client_id', identity.clientId).eq('application_case_id', identity.applicationCaseId).select('id').single();
  if (result.error || !result.data) throw new Error('Unable to save authorized Motivation corrections.');
}

async function supportingBytes(d: DocumentRecord): Promise<Uint8Array> {
  const signed = await db.storage.from(BUCKET).createSignedUrl(d.storage_path, 60);
  if (signed.error || !signed.data?.signedUrl) throw new Error(`Unable to access verified evidence: ${d.document_name}`);
  const response = await fetch(signed.data.signedUrl);
  if (!response.ok) throw new Error(`Verified supporting file is unavailable: ${d.document_name}`);
  return new Uint8Array(await response.arrayBuffer());
}

export async function generateMotivation(identity: MotivationIdentity, review: MotivationReview): Promise<DocumentRecord> {
  validateMotivationReview(review);
  const sources = await loadMotivationSources(identity);
  const previous = latestMotivation(sources.documents, identity.applicationCaseId);
  const snapshot = motivationSourceSnapshot(sources, review);
  const response = await fetch('/templates/LicenceGuard-Master-Motivation-Canonical.docx');
  if (!response.ok) throw new Error('The locked canonical Master is unavailable.');
  const docx = await populateCanonicalMotivation(new Uint8Array(await response.arrayBuffer()), sources, review, new Date().toISOString().slice(0, 10));
  const pdfLib = await import('pdf-lib/cjs/index.js');
  const pdf = await pdfLib.PDFDocument.load(await renderCanonicalMotivationAsPdf(docx));
  // Annexures are actually embedded, so a register never claims an absent attachment.
  const annexures = motivationAnnexures(sources, review);
  for (const a of annexures) {
    const bytes = await supportingBytes(a.document);
    const marker = pdf.addPage([595.28, 841.89]);
    const font = await pdf.embedFont(pdfLib.StandardFonts.Helvetica);
    marker.drawText(`Annexure ${a.letter}`, { x: 44, y: 790, size: 18, font });
    const mime = a.document.mime_type ?? '', file = a.document.file_name.toLowerCase();
    if (mime === 'application/pdf' || file.endsWith('.pdf') || file.endsWith('.docx')) {
      const attached = await pdfLib.PDFDocument.load(file.endsWith('.docx') ? await renderDocxAsPdf(bytes) : bytes);
      if (!attached.getPageCount()) throw new Error(`Empty annexure: ${a.document.document_name}`);
      (await pdf.copyPages(attached, attached.getPageIndices())).forEach(page => pdf.addPage(page));
    } else if (mime === 'image/png' || mime === 'image/jpeg' || /\.(png|jpe?g)$/.test(file)) {
      const image = mime === 'image/png' || file.endsWith('.png') ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
      const scale = Math.min(505 / image.width, 690 / image.height);
      marker.drawImage(image, { x: 44, y: 60, width: image.width * scale, height: image.height * scale });
    } else throw new Error(`Convert ${a.document.document_name} to a supported PDF, DOCX, PNG or JPEG before selecting it as an annexure.`);
  }
  // Reject source edits or another generation during rendering; never confirm stale bytes.
  const latest = await loadMotivationSources(identity);
  if (snapshot !== motivationSourceSnapshot(latest, review) || latestMotivation(latest.documents, identity.applicationCaseId)?.id !== previous?.id) throw new Error('Source data or the current Motivation changed during generation. Reload and regenerate.');
  const bytes = await pdf.save();
  const fileName = `MOTIVATION_${identity.applicationCaseId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.pdf`;
  const path = `${identity.dealerId}/${identity.clientId}/MOTIVATION/${fileName}`;
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
  const upload = await db.storage.from(BUCKET).upload(path, blob, { contentType: 'application/pdf', upsert: false });
  if (upload.error) throw new Error(upload.error.message);
  return registerGeneratedDocument({ ...generatedDocumentPrivacy(identity.userId), dealer_id: identity.dealerId, client_id: identity.clientId, application_case_id: identity.applicationCaseId,
    firearm_id: sources.firearm.id, competency_id: sources.competency?.id ?? null, firearm_licence_id: sources.application.firearm_licence_id, parent_document_id: previous?.id ?? null,
    document_type: 'MOTIVATION', document_scope: 'APPLICATION_CASE', lifecycle_status: 'ACTIVE', version_number: (previous?.version_number ?? 0) + 1,
    storage_path: path, file_name: fileName, original_file_name: fileName, document_name: `Section ${sources.application.licence_section} ${sources.firearm.make} ${sources.firearm.calibre} — Motivation`,
    mime_type: 'application/pdf', file_size_bytes: blob.size, document_date: new Date().toISOString().slice(0, 10), is_verified: false, is_generated: true, generated_from_template_id: null, uploaded_by: identity.userId,
    metadata: { motivationMappingVersion: MOTIVATION_MAPPING_VERSION, canonicalMasterHash: CANONICAL_MOTIVATION_HASH, motivationSourceSnapshot: snapshot, motivationReview: review, motivationDraft: review, motivationConfirmedSnapshot: null,
      motivationReleaseIssues: motivationReleaseIssues(sources, review), annexures: annexures.map(a => ({ letter: a.letter, documentId: a.document.id })), paginationNotice: 'A4 Motivation index reflects generated section pages; supporting annexures follow the Motivation.' } });
}

export async function markMotivationReviewed(identity: MotivationIdentity, documentId: string): Promise<void> {
  const w = await getMotivationWorkspace(identity);
  if (w.current?.id !== documentId || w.state === 'OUTDATED') throw new Error('Review the current regenerated Motivation.');
  const result = await db.from('documents').update({ metadata: { ...w.current.metadata, motivationReviewedSnapshot: w.snapshot } }).eq('id', documentId).eq('owner_user_id', identity.userId).select('id').single();
  if (result.error || !result.data) throw new Error('Unable to record Motivation review.');
}

export async function assertMotivationConfirmable(identity: MotivationIdentity, documentId: string) {
  const w = await getMotivationWorkspace(identity);
  if (w.current?.id !== documentId || w.state === 'OUTDATED' || w.current.metadata.motivationReviewedSnapshot !== w.snapshot || w.issues.length) throw new Error(`Review and regenerate the current Motivation before confirmation. ${w.issues.join(' ')}`);
  return w;
}

export async function confirmMotivation(identity: MotivationIdentity, documentId: string): Promise<void> {
  const w = await assertMotivationConfirmable(identity, documentId);
  const result = await db.from('documents').update({ is_verified: true, verified_at: new Date().toISOString(), verified_by: identity.userId,
    metadata: { ...w.current!.metadata, motivationConfirmedSnapshot: w.snapshot, motivationConfirmedAt: new Date().toISOString(), motivationConfirmedBy: identity.userId } })
    .eq('id', documentId).eq('owner_user_id', identity.userId).eq('application_case_id', identity.applicationCaseId).select('id').single();
  if (result.error || !result.data) throw new Error('Unable to confirm the current authorized Motivation.');
}

export async function assertCurrentMotivationReleased(identity: MotivationIdentity, documentId: string): Promise<void> {
  const w = await getMotivationWorkspace(identity);
  if (w.current?.id !== documentId || w.state !== 'CONFIRMED' || w.issues.length) throw new Error('The current Motivation must be reviewed, confirmed and fresh before release.');
}

/** Called by readiness/pack; returns a derived state without altering any document. */
export async function canonicalMotivationForCase(caseId: string, documents: DocumentRecord[]) {
  const current = currentMotivation(documents, caseId);
  if (!current) return null;
  const owner = (current as any).owner_user_id;
  if (!owner) return { current, state: 'OUTDATED' as const };
  try {
    const w = await getMotivationWorkspace({ dealerId: current.dealer_id, clientId: current.client_id, applicationCaseId: caseId, userId: owner });
    return { current: w.current ?? current, state: w.issues.length && w.state === 'CONFIRMED' ? 'OUTDATED' as const : w.state };
  } catch { return { current, state: 'OUTDATED' as const }; }
}
