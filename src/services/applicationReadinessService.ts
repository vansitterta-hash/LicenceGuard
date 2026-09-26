import { supabase } from '../lib/supabase';
import { declarationReadinessIssues } from '../utils/saps271Declarations';
import type { Saps271Declarations } from '../types/saps271Declarations';
import { isApplicationTypeSupportedInBeta, UNSUPPORTED_APPLICATION_TYPE_MESSAGE } from '../utils/unsupportedApplicationTypePolicy';
import type {
  ApplicationCaseReadiness,
  ApplicationReadinessState,
  ClientApplicationReadiness,
  ReadinessRequirement,
  RequirementState,
} from '../types/applicationReadiness';
import { isCompetencyApplicationType, type ApplicationCaseType } from '../types/applicationCase';
import type { CompetencyCategory } from '../types/competency';
import type { DocumentRecord, DocumentType } from '../types/document';
import { documentReferencesApplicationCase, isReusableClientIdentification } from './documentService';

const db = supabase as any;
const DAY_MS = 86_400_000;
const GENERATED_APPLICATION_FORM_TYPES = new Set<DocumentType>([
  'COMPETENCY_APPLICATION',
  'COMPETENCY_RENEWAL_FORM',
  'FIREARM_LICENCE_APPLICATION_FORM',
  'FIREARM_LICENCE_RENEWAL_FORM',
]);

type ClientRow = { first_name: string; surname: string; saps271_declarations?: Saps271Declarations | null };
type CaseRow = {
  created_at?: string;
  id: string;
  application_type: ApplicationCaseType;
  status: string;
  competency_category: CompetencyCategory | null;
  competency_id: string | null;
  firearm_id: string | null;
  firearm_licence_id: string | null;
  licence_section: string | null;
  acquisition_source: 'DEALER' | 'PRIVATE_SELLER' | 'EXISTING_FIREARM' | 'NOT_APPLICABLE' | null;
  supplier_name: string | null;
  supplier_id_or_registration: string | null;
};
type CompetencyRow = {
  id: string;
  category: CompetencyCategory;
  certificate_number: string | null;
  issue_date: string | null;
  verified: boolean;
};
type FirearmRow = {
  id: string;
  make: string;
  model: string | null;
  calibre: string;
  serial_number: string;
  required_competency: CompetencyCategory;
};
type LicenceRow = {
  id: string;
  firearm_id: string;
  licence_number: string | null;
  licence_section: string | null;
  issue_date: string | null;
  expiry_date: string | null;
};

type RequirementDefinition = {
  key: string;
  label: string;
  detail: string;
  documentType: DocumentType | null;
  required: boolean;
  acceptableDocumentTypes?: DocumentType[];
  evidenceKind?: 'SAFE_PHOTO' | 'SAFE_SECURING_PHOTO';
  requiresFirearmMatch?: boolean;
  manualWhenMissing?: boolean;
  delivery?: 'DIGITAL' | 'MANUAL_PACK' | 'PHYSICAL_SUBMISSION';
};

const COMMON: RequirementDefinition[] = [
  { key: 'ID_COPY', label: 'Identification copy', detail: 'A clear copy of the client’s identity document.', documentType: 'ID_COPY', required: true },
];

const REQUIREMENTS: Partial<Record<ApplicationCaseType, RequirementDefinition[]>> = {
  COMPETENCY_FIRST_APPLICATION: [
    ...COMMON,
    { key: 'COMPETENCY_APPLICATION', label: 'Competency application form', detail: 'The applicable SAPS competency application form.', documentType: 'COMPETENCY_APPLICATION', required: true },
    { key: 'MOTIVATION', label: 'Competency motivation', detail: 'Motivation supporting the competency application.', documentType: 'MOTIVATION', required: true },
  ],
  COMPETENCY_ADDITIONAL_CATEGORY: [
    ...COMMON,
    { key: 'COMPETENCY_APPLICATION', label: 'Competency application form', detail: 'The applicable SAPS competency application form.', documentType: 'COMPETENCY_APPLICATION', required: true },
    { key: 'COMPETENCY_CERTIFICATE', label: 'Existing competency certificate', detail: 'Copy of the client’s existing competency certificate.', documentType: 'COMPETENCY_CERTIFICATE', required: true },
    { key: 'MOTIVATION', label: 'Competency motivation', detail: 'Motivation supporting the additional category.', documentType: 'MOTIVATION', required: true },
  ],
  COMPETENCY_RENEWAL: [
    ...COMMON,
    { key: 'COMPETENCY_RENEWAL_FORM', label: 'Competency renewal form', detail: 'The applicable SAPS competency renewal form.', documentType: 'COMPETENCY_RENEWAL_FORM', required: true },
    { key: 'COMPETENCY_CERTIFICATE', label: 'Existing competency certificate', detail: 'Copy of the competency being renewed.', documentType: 'COMPETENCY_CERTIFICATE', required: true },
    { key: 'MOTIVATION', label: 'Renewal motivation', detail: 'Motivation supporting the renewal.', documentType: 'MOTIVATION', required: true },
  ],
  COMPETENCY_REAPPLICATION: [
    ...COMMON,
    { key: 'COMPETENCY_APPLICATION', label: 'Competency application form', detail: 'The applicable SAPS competency application form.', documentType: 'COMPETENCY_APPLICATION', required: true },
    { key: 'COMPETENCY_CERTIFICATE', label: 'Previous competency certificate', detail: 'Copy of the previous competency certificate, when available.', documentType: 'COMPETENCY_CERTIFICATE', required: false },
    { key: 'MOTIVATION', label: 'Reapplication motivation', detail: 'Motivation explaining the reapplication.', documentType: 'MOTIVATION', required: true },
  ],
  FIREARM_LICENCE_FIRST_APPLICATION: [
    ...COMMON,
    { key: 'COMPETENCY_CERTIFICATE', label: 'Matching competency certificate', detail: 'A verified competency matching the firearm category.', documentType: 'COMPETENCY_CERTIFICATE', required: true },
    { key: 'FIREARM_LICENCE_APPLICATION_FORM', label: 'Firearm licence application form', detail: 'The applicable SAPS firearm licence application form.', documentType: 'FIREARM_LICENCE_APPLICATION_FORM', required: true },
    { key: 'MOTIVATION', label: 'Licence motivation', detail: 'Motivation for the firearm licence application.', documentType: 'MOTIVATION', required: true, requiresFirearmMatch: true },
    { key: 'SAFE_PHOTOS', label: 'Safe photographs', detail: 'Photographs showing the client’s firearm safe.', documentType: 'SUPPORTING_DOCUMENT', evidenceKind: 'SAFE_PHOTO', required: true },
    { key: 'SAFE_SECURING_PHOTOS', label: 'Safe securing/anchoring photographs', detail: 'Photographs showing how the safe is secured to the wall and/or floor.', documentType: 'SUPPORTING_DOCUMENT', evidenceKind: 'SAFE_SECURING_PHOTO', required: true },
  ],
  FIREARM_LICENCE_ADDITIONAL_APPLICATION: [
    ...COMMON,
    { key: 'COMPETENCY_CERTIFICATE', label: 'Matching competency certificate', detail: 'A verified competency matching the firearm category.', documentType: 'COMPETENCY_CERTIFICATE', required: true },
    { key: 'FIREARM_LICENCE_APPLICATION_FORM', label: 'Firearm licence application form', detail: 'The applicable SAPS firearm licence application form.', documentType: 'FIREARM_LICENCE_APPLICATION_FORM', required: true },
    { key: 'MOTIVATION', label: 'Licence motivation', detail: 'Motivation for the additional firearm.', documentType: 'MOTIVATION', required: true, requiresFirearmMatch: true },
    { key: 'SAFE_PHOTOS', label: 'Safe photographs', detail: 'Photographs showing the client’s firearm safe.', documentType: 'SUPPORTING_DOCUMENT', evidenceKind: 'SAFE_PHOTO', required: true },
    { key: 'SAFE_SECURING_PHOTOS', label: 'Safe securing/anchoring photographs', detail: 'Photographs showing how the safe is secured to the wall and/or floor.', documentType: 'SUPPORTING_DOCUMENT', evidenceKind: 'SAFE_SECURING_PHOTO', required: true },
  ],
  FIREARM_LICENCE_RENEWAL: [
    ...COMMON,
    { key: 'COMPETENCY_CERTIFICATE', label: 'Matching competency certificate', detail: 'A verified competency matching the firearm category.', documentType: 'COMPETENCY_CERTIFICATE', required: true },
    { key: 'FIREARM_LICENCE_CARD', label: 'Current firearm licence card', detail: 'Front and back copies of the existing licence card.', documentType: 'FIREARM_LICENCE_CARD', required: true },
    { key: 'FIREARM_LICENCE_RENEWAL_FORM', label: 'Firearm licence renewal form', detail: 'The applicable SAPS firearm licence renewal form.', documentType: 'FIREARM_LICENCE_RENEWAL_FORM', required: true },
    { key: 'MOTIVATION', label: 'Renewal motivation', detail: 'Motivation supporting continued possession.', documentType: 'MOTIVATION', required: true, requiresFirearmMatch: true },
    { key: 'SAFE_PHOTOS', label: 'Safe photographs', detail: 'Photographs showing the client’s firearm safe.', documentType: 'SUPPORTING_DOCUMENT', evidenceKind: 'SAFE_PHOTO', required: true },
    { key: 'SAFE_SECURING_PHOTOS', label: 'Safe securing/anchoring photographs', detail: 'Photographs showing how the safe is secured to the wall and/or floor.', documentType: 'SUPPORTING_DOCUMENT', evidenceKind: 'SAFE_SECURING_PHOTO', required: true },
  ],
  FIREARM_LICENCE_REAPPLICATION: [
    ...COMMON,
    { key: 'COMPETENCY_CERTIFICATE', label: 'Matching competency certificate', detail: 'A verified competency matching the firearm category.', documentType: 'COMPETENCY_CERTIFICATE', required: true },
    { key: 'FIREARM_LICENCE_CARD', label: 'Previous firearm licence card', detail: 'Front and back copies of the previous licence card.', documentType: 'FIREARM_LICENCE_CARD', required: true },
    { key: 'FIREARM_LICENCE_APPLICATION_FORM', label: 'Firearm licence application form', detail: 'The applicable SAPS firearm licence application form.', documentType: 'FIREARM_LICENCE_APPLICATION_FORM', required: true },
    { key: 'MOTIVATION', label: 'Reapplication motivation', detail: 'Motivation explaining the reapplication circumstances.', documentType: 'MOTIVATION', required: true, requiresFirearmMatch: true },
    { key: 'SAFE_PHOTOS', label: 'Safe photographs', detail: 'Photographs showing the client’s firearm safe.', documentType: 'SUPPORTING_DOCUMENT', evidenceKind: 'SAFE_PHOTO', required: true },
    { key: 'SAFE_SECURING_PHOTOS', label: 'Safe securing/anchoring photographs', detail: 'Photographs showing how the safe is secured to the wall and/or floor.', documentType: 'SUPPORTING_DOCUMENT', evidenceKind: 'SAFE_SECURING_PHOTO', required: true },
  ],
};

function daysUntil(value: string): number {
  const now = new Date();
  const target = new Date(`${value}T00:00:00`);
  return Math.ceil((Date.UTC(target.getFullYear(), target.getMonth(), target.getDate()) - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / DAY_MS);
}

function documentState(document: DocumentRecord | undefined): RequirementState {
  if (!document) return 'MISSING';
  if (document.expiry_date && daysUntil(document.expiry_date) < 0) return 'EXPIRED';
  if (!document.is_verified) return 'UNVERIFIED';
  return 'SATISFIED';
}

function stateFor(requirements: ReadinessRequirement[]): ApplicationReadinessState {
  const required = requirements.filter((item) => item.required);
  if (required.some((item) => item.state === 'MISSING' || item.state === 'EXPIRED')) return 'BLOCKED';
  if (required.some((item) => item.state === 'UNVERIFIED' || item.state === 'PENDING_GENERATION')) return 'ACTION_REQUIRED';
  return 'READY';
}

function selectRequirementDocument(
  documents: DocumentRecord[],
  requirement: RequirementDefinition,
  applicationCase: CaseRow,
  firearm: FirearmRow | undefined,
  licence: LicenceRow | undefined,
  sourceCases: CaseRow[]
): DocumentRecord | undefined {
  if (!requirement.documentType) return undefined;
  const acceptedTypes = requirement.acceptableDocumentTypes ?? [requirement.documentType];
  return documents
    .filter((document) => {
      if (!acceptedTypes.includes(document.document_type)) return false;
      if (isReusableClientIdentification(document)) return true;
      if (requirement.evidenceKind && document.metadata?.evidenceKind !== requirement.evidenceKind) return false;
      if (requirement.documentType === 'MOTIVATION' && isCompetencyApplicationType(applicationCase.application_type)) {
        // A firearm motivation or a filename match is not competency evidence.
        if (document.firearm_id || document.firearm_licence_id) return false;
        if (documentReferencesApplicationCase(document, applicationCase.id)) return true;
        return Boolean(applicationCase.competency_category) && sourceCases.some((source) =>
          documentReferencesApplicationCase(document, source.id)
          && source.application_type === applicationCase.application_type
          && source.competency_category === applicationCase.competency_category
          && !source.firearm_id
        );
      }
      if (requirement.requiresFirearmMatch) {
        return Boolean(firearm && document.firearm_id === firearm.id)
          && (!document.application_case_id || documentReferencesApplicationCase(document, applicationCase.id));
      }
      if (
        document.application_case_id
        && document.application_case_id !== applicationCase.id
        && !documentReferencesApplicationCase(document, applicationCase.id)
      ) return false;
      return documentReferencesApplicationCase(document, applicationCase.id)
        || document.document_scope === 'CLIENT'
        || Boolean(firearm && document.firearm_id === firearm.id)
        || Boolean(licence && document.firearm_licence_id === licence.id);
    })
    .sort((left, right) => {
      const leftExpired = Boolean(left.expiry_date && daysUntil(left.expiry_date) < 0);
      const rightExpired = Boolean(right.expiry_date && daysUntil(right.expiry_date) < 0);
      if (leftExpired !== rightExpired) return leftExpired ? 1 : -1;
      const leftLinked = documentReferencesApplicationCase(left, applicationCase.id);
      const rightLinked = documentReferencesApplicationCase(right, applicationCase.id);
      if (leftLinked !== rightLinked) return leftLinked ? -1 : 1;
      if (left.is_verified !== right.is_verified) return left.is_verified ? -1 : 1;
      return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
    })[0];
}

function sectionExpectedYears(section: string | null): number | null {
  if (!section) return null;
  const normalised = section.replace(/[^0-9]/g, '');
  if (normalised === '13') return 5;
  if (normalised === '15' || normalised === '16') return 10;
  return null;
}

export async function getClientApplicationReadiness(clientId: string): Promise<ClientApplicationReadiness> {
  const [clientResult, casesResult, competenciesResult, firearmsResult, licencesResult, documentsResult] = await Promise.all([
    db.from('clients').select('first_name,surname,saps271_declarations').eq('id', clientId).single(),
    db.from('application_cases').select('*').eq('client_id', clientId).order('opened_date', { ascending: false }),
    db.from('competencies').select('id,category,certificate_number,issue_date,verified').eq('client_id', clientId),
    db.from('firearms').select('id,make,model,calibre,serial_number,required_competency').eq('client_id', clientId).eq('is_active', true),
    db.from('firearm_licences').select('id,firearm_id,licence_number,licence_section,issue_date,expiry_date').eq('client_id', clientId),
    db.from('documents').select('*').eq('client_id', clientId).eq('lifecycle_status', 'ACTIVE'),
  ]);
  const error = clientResult.error ?? casesResult.error ?? competenciesResult.error ?? firearmsResult.error ?? licencesResult.error ?? documentsResult.error;
  if (error) throw new Error(error.message);

  const client = clientResult.data as ClientRow;
  const sourceCases = (casesResult.data ?? []) as CaseRow[];
  const cases = sourceCases.filter((item) => !['APPROVED', 'DECLINED', 'WITHDRAWN', 'CLOSED'].includes(item.status));
  const competencies = (competenciesResult.data ?? []) as CompetencyRow[];
  const firearms = (firearmsResult.data ?? []) as FirearmRow[];
  const licences = (licencesResult.data ?? []) as LicenceRow[];
  const documents = (documentsResult.data ?? []) as DocumentRecord[];

  const firearmById = new Map(firearms.map((item) => [item.id, item]));
  const licenceById = new Map(licences.map((item) => [item.id, item]));

  const readinessCases: ApplicationCaseReadiness[] = cases.map((applicationCase) => {
    const firearm = applicationCase.firearm_id ? firearmById.get(applicationCase.firearm_id) : undefined;
    const licence = applicationCase.firearm_licence_id ? licenceById.get(applicationCase.firearm_licence_id) : undefined;
    const category = applicationCase.competency_category ?? firearm?.required_competency ?? null;
    if (!isApplicationTypeSupportedInBeta(applicationCase.application_type)) {
      return { caseId: applicationCase.id, applicationType: applicationCase.application_type, subject: 'Unsupported application', status: applicationCase.status, competencyCategory: category, firearmId: applicationCase.firearm_id, firearmLicenceId: applicationCase.firearm_licence_id, licenceSection: applicationCase.licence_section ?? licence?.licence_section ?? null, score: 0, state: 'BLOCKED' as const, readyToGenerate: false, requirements: [], missingCount: 0, warningCount: 0, unsupportedMessage: UNSUPPORTED_APPLICATION_TYPE_MESSAGE };
    }
    const matchingCompetency = category ? competencies.find((item) => item.category === category) : undefined;
    const baseDefinitions = REQUIREMENTS[applicationCase.application_type] ?? COMMON;
    const definitions: RequirementDefinition[] = [...baseDefinitions];

    if (applicationCase.application_type.startsWith('FIREARM_LICENCE_')) {
      definitions.push({
        key: 'PASSPORT_PHOTOS',
        label: 'Passport photographs',
        detail: 'Attach the required original passport photographs before SAPS submission.',
        documentType: null,
        required: true,
        delivery: 'PHYSICAL_SUBMISSION',
      });
    }

    if (applicationCase.acquisition_source === 'DEALER') {
      definitions.push(
        { key: 'ACQUISITION_DETAILS', label: 'Dealer details', detail: 'Record the supplying dealer name before generating the application.', documentType: null, required: true },
        { key: 'ACQUISITION_EVIDENCE', label: 'Dealer acquisition evidence', detail: 'A dealer invoice, sale document, SAP 350 or equivalent that is explicitly associated with this firearm.', documentType: 'PURCHASE_INVOICE', acceptableDocumentTypes: ['PURCHASE_INVOICE', 'DEALER_STOCK_DOCUMENT'], required: true, requiresFirearmMatch: true },
      );
    }

    if (applicationCase.acquisition_source === 'PRIVATE_SELLER') {
      definitions.push(
        { key: 'ACQUISITION_DETAILS', label: 'Private seller details', detail: 'Record the seller name and identity number before generating the application.', documentType: null, required: true },
        { key: 'ACQUISITION_EVIDENCE', label: 'Private-sale acquisition evidence', detail: 'A signed sale agreement or equivalent record explicitly associated with this firearm and seller.', documentType: 'PURCHASE_INVOICE', required: true, requiresFirearmMatch: true },
      );
    }

    const section = (applicationCase.licence_section ?? licence?.licence_section ?? '').replace(/[^0-9]/g, '');
    if (section === '16') {
      definitions.push(
        { key: 'DEDICATED_STATUS', label: 'Dedicated status certificate', detail: 'Required proof of current dedicated status for a Section 16 application.', documentType: 'DEDICATED_STATUS', required: true },
        { key: 'GOOD_STANDING', label: 'Good-standing letter', detail: 'Add the current firearm/application-specific letter to the printed submission pack.', documentType: 'GOOD_STANDING', required: true, requiresFirearmMatch: true, manualWhenMissing: true },
        { key: 'MEMBERSHIP_CERTIFICATE', label: 'Membership certificate', detail: 'Required current membership evidence supporting dedicated status.', documentType: 'MEMBERSHIP_CERTIFICATE', required: true },
        { key: 'ENDORSEMENT', label: 'Endorsement', detail: 'Add the correct firearm/application-specific endorsement to the printed submission pack.', documentType: 'ENDORSEMENT', required: true, requiresFirearmMatch: true, manualWhenMissing: true },
        { key: 'SUPPORTING_RESEARCH', label: 'Firearm or calibre research', detail: 'Optional supporting research that strengthens the motivation.', documentType: 'SUPPORTING_RESEARCH', required: false, requiresFirearmMatch: true },
      );
    }

    const requirements: ReadinessRequirement[] = definitions.map((definition) => {
      let state: RequirementState;
      let documentId: string | undefined;
      if (definition.key === 'ACQUISITION_DETAILS') {
        const complete = applicationCase.acquisition_source === 'DEALER'
          ? Boolean(applicationCase.supplier_name?.trim())
          : Boolean(applicationCase.supplier_name?.trim() && applicationCase.supplier_id_or_registration?.trim());
        state = complete ? 'SATISFIED' : 'MISSING';
      } else if (definition.key === 'COMPETENCY_CERTIFICATE') {
        state = !matchingCompetency || !matchingCompetency.certificate_number || !matchingCompetency.issue_date
          ? 'MISSING'
          : matchingCompetency.verified ? 'SATISFIED' : 'UNVERIFIED';
      } else {
        const linked = selectRequirementDocument(
          documents,
          definition,
          applicationCase,
          firearm,
          licence,
          sourceCases
        );
        documentId = linked?.id;
        state = definition.delivery === 'PHYSICAL_SUBMISSION'
          ? 'PHYSICAL_REQUIRED'
          : !linked && definition.manualWhenMissing
            ? 'MANUAL_REQUIRED'
            : !linked && definition.documentType && GENERATED_APPLICATION_FORM_TYPES.has(definition.documentType)
              ? 'PENDING_GENERATION'
              : documentState(linked);
      }
      return {
        ...definition,
        documentId,
        state,
        delivery: state === 'MANUAL_REQUIRED'
          ? 'MANUAL_PACK' as const
          : definition.delivery ?? 'DIGITAL' as const,
      };
    });

    if (firearm && !matchingCompetency) {
      requirements.unshift({ key: 'MATCHING_COMPETENCY', label: `Matching ${firearm.required_competency.toLowerCase()} competency`, detail: 'The firearm cannot proceed without the matching competency category.', state: 'MISSING', required: true, documentType: null, delivery: 'DIGITAL' });
    }

    if (licence?.issue_date && licence.expiry_date) {
      const expectedYears = sectionExpectedYears(applicationCase.licence_section ?? licence.licence_section);
      if (expectedYears) {
        const issue = new Date(`${licence.issue_date}T00:00:00`);
        const expected = new Date(issue);
        expected.setFullYear(expected.getFullYear() + expectedYears);
        const recorded = new Date(`${licence.expiry_date}T00:00:00`);
        const difference = Math.abs(expected.getTime() - recorded.getTime()) / DAY_MS;
        if (difference > 31) {
          requirements.unshift({ key: 'LICENCE_TERM_REVIEW', label: 'Licence term requires review', detail: `Section ${applicationCase.licence_section ?? licence.licence_section} is expected to use a ${expectedYears}-year term. Verify the recorded expiry date.`, state: 'UNVERIFIED', required: true, documentType: null, delivery: 'DIGITAL' });
        }
      }
    }

    if (['FIREARM_LICENCE_FIRST_APPLICATION', 'FIREARM_LICENCE_ADDITIONAL_APPLICATION'].includes(applicationCase.application_type)) {
      const declarationIssues = declarationReadinessIssues(client.saps271_declarations, applicationCase.created_at);
      requirements.push({ key: 'SAPS271_DECLARATIONS', label: 'SAPS 271 Background & Declarations', detail: declarationIssues.join(' ') || 'Declarations answered and confirmed after this application was created.', documentType: null, required: true, delivery: 'DIGITAL', state: declarationIssues.length ? 'MISSING' : 'SATISFIED' });
    }
    const state = stateFor(requirements);
    const required = requirements.filter((item) => item.required && item.delivery === 'DIGITAL');
    const satisfied = required.filter((item) => item.state === 'SATISFIED').length;
    const score = required.length ? Math.round((satisfied / required.length) * 100) : 0;
    const subject = firearm
      ? [firearm.make, firearm.model, firearm.calibre, firearm.serial_number].filter(Boolean).join(' · ')
      : category ? `${category} competency` : 'General application';

    return {
      caseId: applicationCase.id,
      applicationType: applicationCase.application_type,
      subject,
      status: applicationCase.status,
      competencyCategory: category,
      firearmId: applicationCase.firearm_id,
      firearmLicenceId: applicationCase.firearm_licence_id,
      licenceSection: applicationCase.licence_section ?? licence?.licence_section ?? null,
      score,
      state,
      readyToGenerate: state === 'READY',
      requirements,
      missingCount: requirements.filter((item) => item.required && (item.state === 'MISSING' || item.state === 'EXPIRED')).length,
      warningCount: requirements.filter((item) =>
        item.required && (item.state === 'UNVERIFIED' || item.state === 'PENDING_GENERATION')
      ).length,
    };
  });

  if (readinessCases.length === 0) {
    return { clientId, clientName: `${client.first_name} ${client.surname}`, state: 'NO_CASES', score: 0, readyCases: 0, blockedCases: 0, actionRequiredCases: 0, cases: [] };
  }

  const score = Math.round(readinessCases.reduce((sum, item) => sum + item.score, 0) / readinessCases.length);
  const blockedCases = readinessCases.filter((item) => item.state === 'BLOCKED').length;
  const actionRequiredCases = readinessCases.filter((item) => item.state === 'ACTION_REQUIRED').length;
  const readyCases = readinessCases.filter((item) => item.state === 'READY').length;
  const state: ApplicationReadinessState = blockedCases > 0 ? 'BLOCKED' : actionRequiredCases > 0 ? 'ACTION_REQUIRED' : 'READY';

  return { clientId, clientName: `${client.first_name} ${client.surname}`, state, score, readyCases, blockedCases, actionRequiredCases, cases: readinessCases };
}
