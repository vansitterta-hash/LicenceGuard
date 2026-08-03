import { supabase } from '../lib/supabase';
import { getClientApplicationReadiness } from '../services/applicationReadinessService';
import type { ApplicationCaseRecord } from '../types/applicationCase';
import type { ClientRecord } from '../types/client';
import type { CompetencyRecord } from '../types/competency';
import type { DocumentRecord, DocumentType } from '../types/document';
import type { FirearmLicenceRecord, FirearmRecord } from '../types/firearm';
import { resolveIntelligenceFeatureFlags, type IntelligenceFeatureFlags } from './featureFlags';
import type {
  ApplicationContext,
  ApplicationUserOverride,
  ApplicationUserSelection,
  IntelligenceSourceRecord,
  RenewalWindowContext,
} from './types';

const db = supabase as any;
const DAY_MS = 86_400_000;
const GENERATED_SAPS_TYPES = new Set<DocumentType>([
  'COMPETENCY_APPLICATION',
  'COMPETENCY_RENEWAL_FORM',
  'FIREARM_LICENCE_APPLICATION_FORM',
  'FIREARM_LICENCE_RENEWAL_FORM',
]);

function daysUntil(date: string | null): number | null {
  if (!date) return null;
  const today = new Date();
  const target = new Date(`${date}T00:00:00`);
  return Math.ceil((Date.UTC(target.getFullYear(), target.getMonth(), target.getDate())
    - Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())) / DAY_MS);
}

function subtractDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() - days);
  return value.toISOString().slice(0, 10);
}

function metadataCaseIds(document: DocumentRecord): string[] {
  const ids = document.metadata?.applicationCaseIds;
  return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : [];
}

function readSelections(documents: DocumentRecord[]): ApplicationUserSelection[] {
  return documents.flatMap((document) => {
    const selection = document.metadata?.intelligenceSelection;
    if (!selection || typeof selection !== 'object') return [];
    const value = selection as Record<string, unknown>;
    return [{
      documentType: document.document_type,
      candidateId: typeof value.candidateId === 'string' ? value.candidateId : document.id,
      selectedBy: typeof value.selectedBy === 'string' ? value.selectedBy : null,
      selectedAt: typeof value.selectedAt === 'string' ? value.selectedAt : null,
      reason: typeof value.reason === 'string' ? value.reason : null,
    }];
  });
}

function readOverrides(documents: DocumentRecord[]): ApplicationUserOverride[] {
  return documents.flatMap((document) => {
    const overrides = document.metadata?.intelligenceOverrides;
    if (!Array.isArray(overrides)) return [];
    return overrides.flatMap((override) => {
      if (!override || typeof override !== 'object') return [];
      const value = override as Record<string, unknown>;
      if (typeof value.key !== 'string') return [];
      return [{
        key: value.key,
        originalValue: value.originalValue,
        replacementValue: value.replacementValue,
        overriddenBy: typeof value.overriddenBy === 'string' ? value.overriddenBy : null,
        overriddenAt: typeof value.overriddenAt === 'string' ? value.overriddenAt : null,
        reason: typeof value.reason === 'string' ? value.reason : null,
      }];
    });
  });
}

function renewalWindow(
  applicationCase: ApplicationCaseRecord,
  licence: FirearmLicenceRecord | null,
  competency: CompetencyRecord | null
): RenewalWindowContext {
  const firearmRenewal = applicationCase.application_type === 'FIREARM_LICENCE_RENEWAL';
  const competencyRenewal = applicationCase.application_type === 'COMPETENCY_RENEWAL';
  const expiryDate = firearmRenewal ? licence?.expiry_date ?? null
    : competencyRenewal ? competency?.expiry_date ?? null : null;
  const remaining = daysUntil(expiryDate);
  return {
    subjectType: firearmRenewal ? 'FIREARM_LICENCE' : competencyRenewal ? 'COMPETENCY' : null,
    subjectId: firearmRenewal ? licence?.id ?? null : competencyRenewal ? competency?.id ?? null : null,
    expiryDate,
    daysUntilExpiry: remaining,
    windowStartDate: expiryDate ? subtractDays(expiryDate, 120) : null,
    inRenewalWindow: remaining !== null && remaining <= 120,
  };
}

export async function buildApplicationContext(
  applicationCaseId: string,
  featureOverrides: Partial<IntelligenceFeatureFlags> = {}
): Promise<ApplicationContext> {
  const flags = resolveIntelligenceFeatureFlags(featureOverrides);
  const caseResult = await db.from('application_cases').select('*').eq('id', applicationCaseId).single();
  if (caseResult.error) throw new Error(caseResult.error.message);
  const applicationCase = caseResult.data as ApplicationCaseRecord;

  const [clientResult, documentsResult, historyResult, firearmResult, licenceResult, competencyResult, readinessResult] = await Promise.all([
    db.from('clients').select('*').eq('id', applicationCase.client_id).single(),
    db.from('documents').select('*').eq('client_id', applicationCase.client_id),
    db.from('application_cases').select('*').eq('client_id', applicationCase.client_id).neq('id', applicationCase.id).order('opened_date', { ascending: false }),
    applicationCase.firearm_id
      ? db.from('firearms').select('*').eq('id', applicationCase.firearm_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    applicationCase.firearm_licence_id
      ? db.from('firearm_licences').select('*').eq('id', applicationCase.firearm_licence_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    applicationCase.competency_id
      ? db.from('competencies').select('*').eq('id', applicationCase.competency_id).maybeSingle()
      : applicationCase.competency_category
        ? db.from('competencies').select('*').eq('client_id', applicationCase.client_id).eq('category', applicationCase.competency_category).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    getClientApplicationReadiness(applicationCase.client_id),
  ]);
  const firstError = clientResult.error ?? documentsResult.error ?? historyResult.error
    ?? firearmResult.error ?? licenceResult.error ?? competencyResult.error;
  if (firstError) throw new Error(firstError.message);

  const client = clientResult.data as ClientRecord;
  const documents = (documentsResult.data ?? []) as DocumentRecord[];
  const historicalApplications = (historyResult.data ?? []) as ApplicationCaseRecord[];
  const historicalIds = new Set(historicalApplications.map((item) => item.id));
  const firearm = (firearmResult.data ?? null) as FirearmRecord | null;
  const firearmLicence = (licenceResult.data ?? null) as FirearmLicenceRecord | null;
  const competency = (competencyResult.data ?? null) as CompetencyRecord | null;
  const caseDocuments = documents.filter((document) =>
    document.application_case_id === applicationCase.id || metadataCaseIds(document).includes(applicationCase.id)
  );
  const historicalApplicationDocuments = documents.filter((document) =>
    Boolean(document.application_case_id && historicalIds.has(document.application_case_id))
    || metadataCaseIds(document).some((id) => historicalIds.has(id))
  );
  const generatedSapsForms = caseDocuments.filter((document) =>
    document.is_generated && GENERATED_SAPS_TYPES.has(document.document_type)
  );
  const generatedPack = caseDocuments.some((document) =>
    document.is_generated && document.document_name.toLowerCase().includes('pack')
  );
  const missingData: string[] = [];
  if (!firearm && applicationCase.application_type.startsWith('FIREARM_')) missingData.push('firearm');
  if (!firearmLicence && applicationCase.application_type === 'FIREARM_LICENCE_RENEWAL') missingData.push('firearm licence');
  if (!competency && applicationCase.application_type.startsWith('COMPETENCY_')) missingData.push('competency');
  missingData.push('intended use');
  if (!flags.DEALER_LIBRARY) missingData.push('dealer library disabled');

  return {
    builtAt: new Date().toISOString(),
    dealer: { id: applicationCase.dealer_id, companyName: null },
    client,
    applicationCase,
    applicationType: applicationCase.application_type,
    licenceSection: applicationCase.licence_section,
    intendedUse: null,
    firearm,
    firearmLicence,
    competency,
    renewalWindow: renewalWindow(applicationCase, firearmLicence, competency),
    documents,
    firearmDocuments: firearm ? documents.filter((document) => document.firearm_id === firearm.id) : [],
    historicalApplications,
    historicalApplicationDocuments,
    previousMotivations: historicalApplicationDocuments.filter((document) => document.document_type === 'MOTIVATION'),
    dealerLibrarySources: [],
    publicLibrarySources: [],
    unavailableSourceScopes: ['DEALER_LIBRARY', 'PUBLIC_LIBRARY'],
    readiness: readinessResult.cases.find((item) => item.caseId === applicationCase.id) ?? null,
    generatedSapsForms,
    packState: generatedPack ? 'GENERATED'
      : applicationCase.status === 'READY_FOR_SUBMISSION' ? 'READY_FOR_SUBMISSION'
        : applicationCase.status === 'PACK_IN_PREPARATION' ? 'IN_PREPARATION' : 'NOT_STARTED',
    userSelections: readSelections(caseDocuments),
    userOverrides: readOverrides(caseDocuments),
    missingData,
  };
}
