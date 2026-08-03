import { supabase } from '../lib/supabase';
import { getLocalIntelligenceFeatureFlags } from '../intelligence/featureFlags';
import { buildIdempotencyKey } from '../intelligence/intelligencePolicy';
import { buildPrivateLibraryModelFromRecords } from './privateLibraryService';
import type { ApplicationCaseRecord } from '../types/applicationCase';
import type { CompetencyRecord } from '../types/competency';
import type { DocumentRecord, DocumentType } from '../types/document';
import type { FirearmLicenceRecord, FirearmRecord } from '../types/firearm';
import type {
  ProactiveRenewalPreview,
  RenewalEligibilityResult,
  RenewalPreviewItem,
  RenewalSubjectType,
} from '../types/proactiveRenewal';

const db = supabase as any;
const DAY_MS = 86_400_000;
const RENEWAL_WINDOW_DAYS = 120 as const;
const ACTIVE_CASE_STATUSES = new Set([
  'NOT_STARTED',
  'CLIENT_CONTACTED',
  'DOCUMENTS_REQUESTED',
  'DOCUMENTS_INCOMPLETE',
  'DOCUMENTS_COMPLETE',
  'PACK_IN_PREPARATION',
  'READY_FOR_SUBMISSION',
  'SUBMITTED',
]);
const PREPARE_MODE_BLOCKER =
  'Prepare mode requires a durable unique idempotency claim. The current schema cannot prevent concurrent runs from creating duplicate renewal cases, generated forms, packs, notifications or stage events.';

type ClientIdentity = { id: string; dealer_id: string };

function daysUntil(date: string | null): number | null {
  if (!date) return null;
  const today = new Date();
  const target = new Date(`${date}T00:00:00`);
  return Math.ceil((Date.UTC(target.getFullYear(), target.getMonth(), target.getDate())
    - Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())) / DAY_MS);
}

function subtractDays(date: string | null, days: number): string | null {
  if (!date) return null;
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() - days);
  return value.toISOString().slice(0, 10);
}

function activeCaseFor(
  cases: ApplicationCaseRecord[],
  subjectType: RenewalSubjectType,
  subjectId: string,
  firearmId: string | null,
  competencyCategory: string | null
): ApplicationCaseRecord | null {
  return cases.find((applicationCase) => {
    if (!ACTIVE_CASE_STATUSES.has(applicationCase.status)) return false;
    if (subjectType === 'FIREARM_LICENCE') {
      return applicationCase.application_type === 'FIREARM_LICENCE_RENEWAL'
        && (applicationCase.firearm_licence_id === subjectId
          || Boolean(firearmId && applicationCase.firearm_id === firearmId));
    }
    return applicationCase.application_type === 'COMPETENCY_RENEWAL'
      && (applicationCase.competency_id === subjectId
        || Boolean(competencyCategory && applicationCase.competency_category === competencyCategory));
  }) ?? null;
}

function relevantDocuments(
  documents: DocumentRecord[],
  subjectType: RenewalSubjectType,
  subjectId: string,
  firearmId: string | null,
  competencyId: string | null
): DocumentRecord[] {
  return documents.filter((document) => {
    if (document.lifecycle_status !== 'ACTIVE') return false;
    if (subjectType === 'FIREARM_LICENCE' && (
      document.firearm_licence_id === subjectId || document.firearm_id === firearmId
    )) return true;
    if (subjectType === 'COMPETENCY' && document.competency_id === competencyId) return true;
    return document.document_scope === 'CLIENT'
      && !document.firearm_id
      && !document.firearm_licence_id
      && !document.competency_id;
  });
}

function strongestDocument(
  documents: DocumentRecord[],
  type: DocumentType,
  firearmId: string | null,
  competencyId: string | null
): DocumentRecord | null {
  return documents
    .filter((document) => document.document_type === type)
    .sort((left, right) => {
      const leftExact = Number(Boolean(firearmId && left.firearm_id === firearmId)
        || Boolean(competencyId && left.competency_id === competencyId));
      const rightExact = Number(Boolean(firearmId && right.firearm_id === firearmId)
        || Boolean(competencyId && right.competency_id === competencyId));
      if (leftExact !== rightExact) return rightExact - leftExact;
      if (left.is_verified !== right.is_verified) return left.is_verified ? -1 : 1;
      return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
    })[0] ?? null;
}

function documentPreview(
  documents: DocumentRecord[],
  type: DocumentType,
  label: string,
  firearmId: string | null,
  competencyId: string | null
): RenewalPreviewItem {
  const document = strongestDocument(documents, type, firearmId, competencyId);
  if (!document) {
    return { key: type, label, detail: `${label} is not available in the durable private library.`, documentType: type, state: 'MISSING', documentId: null };
  }
  const today = new Date().toISOString().slice(0, 10);
  if (document.expiry_date && document.expiry_date < today) {
    return { key: type, label, detail: `${document.document_name} expired on ${document.expiry_date}.`, documentType: type, state: 'EXPIRED', documentId: document.id };
  }
  return {
    key: type,
    label,
    detail: document.document_name,
    documentType: type,
    state: document.is_verified ? 'AVAILABLE_VERIFIED' : 'AVAILABLE_UNVERIFIED',
    documentId: document.id,
  };
}

function buildPreviewItems(
  subjectType: RenewalSubjectType,
  documents: DocumentRecord[],
  firearmId: string | null,
  competencyId: string | null
): { prepared: RenewalPreviewItem[]; needsReview: RenewalPreviewItem[] } {
  const requested: Array<[DocumentType, string]> = subjectType === 'FIREARM_LICENCE'
    ? [
        ['ID_COPY', 'Identification copy'],
        ['FIREARM_LICENCE_CARD', 'Current firearm licence card'],
        ['COMPETENCY_CERTIFICATE', 'Matching competency certificate'],
        ['MOTIVATION', 'Prior motivation'],
        ['MEMBERSHIP_CERTIFICATE', 'Membership certificate'],
        ['DEDICATED_STATUS', 'Dedicated status'],
        ['GOOD_STANDING', 'Good standing'],
        ['ENDORSEMENT', 'Endorsement'],
        ['SUPPORTING_DOCUMENT', 'Supporting documents'],
      ]
    : [
        ['ID_COPY', 'Identification copy'],
        ['COMPETENCY_CERTIFICATE', 'Current competency certificate'],
        ['MOTIVATION', 'Prior motivation'],
        ['MEMBERSHIP_CERTIFICATE', 'Membership certificate'],
        ['DEDICATED_STATUS', 'Dedicated status'],
        ['GOOD_STANDING', 'Good standing'],
      ];
  const evaluated = requested.map(([type, label]) =>
    documentPreview(documents, type, label, firearmId, competencyId)
  );
  const generatedType: DocumentType = subjectType === 'FIREARM_LICENCE'
    ? 'FIREARM_LICENCE_RENEWAL_FORM' : 'COMPETENCY_RENEWAL_FORM';
  const generated = documentPreview(
    documents,
    generatedType,
    subjectType === 'FIREARM_LICENCE' ? 'SAPS 518(a)' : 'SAPS 517(g)',
    firearmId,
    competencyId
  );
  if (generated.state === 'MISSING') generated.state = 'PENDING_GENERATION';
  const manual: RenewalPreviewItem[] = [
    generated,
    { key: 'DRAFT_PACK', label: 'Draft application pack', detail: 'Would be prepared after existing readiness checks.', documentType: null, state: 'PENDING_GENERATION', documentId: null },
    { key: 'LEGAL_DECLARATIONS', label: 'Declarations and specialist sections', detail: 'Must be reviewed and completed manually; LicenceGuard will not infer answers.', documentType: null, state: 'MANUAL_REVIEW', documentId: null },
    { key: 'SIGNATURE', label: 'Applicant signature', detail: 'Manual signature remains required.', documentType: 'CLIENT_SIGNATURE', state: 'MANUAL_REVIEW', documentId: null },
    { key: 'PHYSICAL_PHOTOS', label: 'Physical passport photographs', detail: 'Attach the required original passport photographs before submitting the application to SAPS.', documentType: null, state: 'PHYSICAL', documentId: null },
    { key: 'FINAL_APPROVAL', label: 'Final user approval', detail: 'The user must approve the reviewed draft before printing or submission.', documentType: null, state: 'MANUAL_REVIEW', documentId: null },
  ];
  return {
    prepared: evaluated.filter((item) => item.state === 'AVAILABLE_VERIFIED'),
    needsReview: [
      ...evaluated.filter((item) => item.state !== 'AVAILABLE_VERIFIED'),
      ...manual,
    ],
  };
}

function eligibility(input: {
  subjectType: RenewalSubjectType;
  subjectId: string;
  client: ClientIdentity;
  description: string;
  expiryDate: string | null;
  firearmId: string | null;
  firearmLicenceId: string | null;
  competencyId: string | null;
  competencyCategory: string | null;
  licenceSection: string | null;
  cases: ApplicationCaseRecord[];
  documents: DocumentRecord[];
}): RenewalEligibilityResult {
  const remaining = daysUntil(input.expiryDate);
  const windowStart = subtractDays(input.expiryDate, RENEWAL_WINDOW_DAYS);
  const alreadyExpired = remaining !== null && remaining < 0;
  const windowOpened = remaining !== null && remaining <= RENEWAL_WINDOW_DAYS;
  const existingCase = activeCaseFor(
    input.cases, input.subjectType, input.subjectId, input.firearmId, input.competencyCategory
  );
  let blockingReason: string | null = null;
  if (!input.expiryDate) blockingReason = 'No authoritative expiry date is recorded.';
  else if (alreadyExpired) blockingReason = 'The item is already expired; LicenceGuard will not infer that an ordinary renewal remains legally appropriate.';
  else if (!windowOpened) blockingReason = `The existing ${RENEWAL_WINDOW_DAYS}-day renewal window has not opened.`;
  else if (existingCase) blockingReason = `Active renewal case ${existingCase.id} already covers this subject.`;
  const subjectDocuments = relevantDocuments(
    input.documents, input.subjectType, input.subjectId, input.firearmId, input.competencyId
  );
  const preview = buildPreviewItems(input.subjectType, subjectDocuments, input.firearmId, input.competencyId);
  const idempotencyKey = buildIdempotencyKey({
    operation: 'PREPARE_RENEWAL_CASE',
    dealerId: input.client.dealer_id,
    clientId: input.client.id,
    applicationCaseId: null,
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    renewalWindow: windowStart,
  });
  const attention = preview.needsReview.length;
  return {
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    clientId: input.client.id,
    dealerId: input.client.dealer_id,
    description: input.description,
    applicationType: input.subjectType === 'FIREARM_LICENCE' ? 'FIREARM_LICENCE_RENEWAL' : 'COMPETENCY_RENEWAL',
    firearmId: input.firearmId,
    firearmLicenceId: input.firearmLicenceId,
    competencyId: input.competencyId,
    competencyCategory: input.competencyCategory,
    licenceSection: input.licenceSection,
    expiryDate: input.expiryDate,
    daysUntilExpiry: remaining,
    renewalWindowStart: windowStart,
    renewalWindowOpened: windowOpened,
    alreadyExpired,
    existingActiveCaseId: existingCase?.id ?? null,
    automaticPreparationAllowed: blockingReason === null,
    blockingReason,
    idempotencyKey,
    automaticallyPreparedPreview: preview.prepared,
    needsReviewPreview: preview.needsReview,
    proposedStages: [
      'ELIGIBILITY_CONFIRMED', 'CASE_CREATED', 'DOCUMENTS_LINKED', 'SAPS_FORM_GENERATED',
      'DRAFT_PACK_PREPARED', 'NOTIFICATION_CREATED', 'AWAITING_REVIEW',
    ],
    notificationPreview: `Your ${input.description} expires on ${input.expiryDate ?? 'an unrecorded date'}. LicenceGuard would prepare a draft renewal for your review. ${attention} items still require attention.`,
  };
}

export async function previewProactiveRenewals(clientId: string): Promise<ProactiveRenewalPreview> {
  if (!getLocalIntelligenceFeatureFlags().PROACTIVE_RENEWALS) {
    throw new Error('Proactive renewals are disabled.');
  }
  const [clientResult, competenciesResult, firearmsResult, licencesResult, casesResult, documentsResult] = await Promise.all([
    db.from('clients').select('id,dealer_id').eq('id', clientId).single(),
    db.from('competencies').select('*').eq('client_id', clientId),
    db.from('firearms').select('*').eq('client_id', clientId).eq('is_active', true),
    db.from('firearm_licences').select('*').eq('client_id', clientId),
    db.from('application_cases').select('*').eq('client_id', clientId),
    db.from('documents').select('*').eq('client_id', clientId),
  ]);
  const error = clientResult.error ?? competenciesResult.error ?? firearmsResult.error
    ?? licencesResult.error ?? casesResult.error ?? documentsResult.error;
  if (error) throw new Error(error.message);
  const client = clientResult.data as ClientIdentity;
  const competencies = (competenciesResult.data ?? []) as CompetencyRecord[];
  const firearms = (firearmsResult.data ?? []) as FirearmRecord[];
  const licences = (licencesResult.data ?? []) as FirearmLicenceRecord[];
  const cases = (casesResult.data ?? []) as ApplicationCaseRecord[];
  const rawDocuments = (documentsResult.data ?? []) as DocumentRecord[];
  const documents = buildPrivateLibraryModelFromRecords({
    clientId,
    documents: rawDocuments,
    firearms,
    competencies,
    applicationCases: cases,
  }).items.map((item) => item.document);
  const firearmById = new Map(firearms.map((firearm) => [firearm.id, firearm]));
  const results: RenewalEligibilityResult[] = [
    ...licences.map((licence) => {
      const firearm = firearmById.get(licence.firearm_id) ?? null;
      return eligibility({
        subjectType: 'FIREARM_LICENCE', subjectId: licence.id, client,
        description: firearm
          ? `${firearm.make} ${firearm.model ?? firearm.calibre} firearm licence`
          : 'firearm licence',
        expiryDate: licence.expiry_date, firearmId: licence.firearm_id,
        firearmLicenceId: licence.id, competencyId: null,
        competencyCategory: firearm?.required_competency ?? null,
        licenceSection: licence.licence_section, cases, documents,
      });
    }),
    ...competencies.map((competency) => eligibility({
      subjectType: 'COMPETENCY', subjectId: competency.id, client,
      description: `${competency.category.toLowerCase()} competency`,
      expiryDate: competency.expiry_date, firearmId: null, firearmLicenceId: null,
      competencyId: competency.id, competencyCategory: competency.category,
      licenceSection: null, cases, documents,
    })),
  ];
  return {
    generatedAt: new Date().toISOString(),
    clientId,
    mode: 'PREVIEW',
    renewalWindowDays: RENEWAL_WINDOW_DAYS,
    eligible: results.filter((item) => item.automaticPreparationAllowed),
    blocked: results.filter((item) => !item.automaticPreparationAllowed),
    prepareModeAvailable: false,
    prepareModeBlocker: PREPARE_MODE_BLOCKER,
    writesPerformed: false,
  };
}

export function getProactiveRenewalPrepareModeBlocker(): string {
  return PREPARE_MODE_BLOCKER;
}
