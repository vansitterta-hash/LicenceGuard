import { supabase } from '../lib/supabase';
import type {
  ApplicationCaseReadiness,
  ApplicationReadinessState,
  ClientApplicationReadiness,
  ReadinessRequirement,
  RequirementState,
} from '../types/applicationReadiness';
import type { ApplicationCaseType } from '../types/applicationCase';
import type { CompetencyCategory } from '../types/competency';
import type { DocumentRecord, DocumentType } from '../types/document';

const db = supabase as any;
const DAY_MS = 86_400_000;

type ClientRow = { first_name: string; surname: string };
type CaseRow = {
  id: string;
  application_type: ApplicationCaseType;
  status: string;
  competency_category: CompetencyCategory | null;
  competency_id: string | null;
  firearm_id: string | null;
  firearm_licence_id: string | null;
  licence_section: string | null;
  acquisition_source: 'DEALER' | 'PRIVATE_SELLER' | 'EXISTING_FIREARM' | 'NOT_APPLICABLE' | null;
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
};

const COMMON: RequirementDefinition[] = [
  { key: 'ID_COPY', label: 'Identification copy', detail: 'A clear copy of the client’s identity document.', documentType: 'ID_COPY', required: true },
  { key: 'PASSPORT_PHOTO', label: 'Passport photographs', detail: 'Current photographs for the application pack.', documentType: 'PASSPORT_PHOTO', required: true },
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
    { key: 'PURCHASE_INVOICE', label: 'Purchase or sale document', detail: 'Dealer invoice or private-sale documentation.', documentType: 'PURCHASE_INVOICE', required: true },
    { key: 'MOTIVATION', label: 'Licence motivation', detail: 'Motivation for the firearm licence application.', documentType: 'MOTIVATION', required: true },
    { key: 'SAFE_AFFIDAVIT', label: 'Safe affidavit', detail: 'Evidence or affidavit confirming compliant safe storage.', documentType: 'SAFE_AFFIDAVIT', required: true },
  ],
  FIREARM_LICENCE_ADDITIONAL_APPLICATION: [
    ...COMMON,
    { key: 'COMPETENCY_CERTIFICATE', label: 'Matching competency certificate', detail: 'A verified competency matching the firearm category.', documentType: 'COMPETENCY_CERTIFICATE', required: true },
    { key: 'FIREARM_LICENCE_APPLICATION_FORM', label: 'Firearm licence application form', detail: 'The applicable SAPS firearm licence application form.', documentType: 'FIREARM_LICENCE_APPLICATION_FORM', required: true },
    { key: 'PURCHASE_INVOICE', label: 'Purchase or sale document', detail: 'Dealer invoice or private-sale documentation.', documentType: 'PURCHASE_INVOICE', required: true },
    { key: 'MOTIVATION', label: 'Licence motivation', detail: 'Motivation for the additional firearm.', documentType: 'MOTIVATION', required: true },
    { key: 'SAFE_AFFIDAVIT', label: 'Safe affidavit', detail: 'Evidence or affidavit confirming compliant safe storage.', documentType: 'SAFE_AFFIDAVIT', required: true },
  ],
  FIREARM_LICENCE_RENEWAL: [
    ...COMMON,
    { key: 'COMPETENCY_CERTIFICATE', label: 'Matching competency certificate', detail: 'A verified competency matching the firearm category.', documentType: 'COMPETENCY_CERTIFICATE', required: true },
    { key: 'FIREARM_LICENCE_CARD', label: 'Current firearm licence card', detail: 'Front and back copies of the existing licence card.', documentType: 'FIREARM_LICENCE_CARD', required: true },
    { key: 'FIREARM_LICENCE_RENEWAL_FORM', label: 'Firearm licence renewal form', detail: 'The applicable SAPS firearm licence renewal form.', documentType: 'FIREARM_LICENCE_RENEWAL_FORM', required: true },
    { key: 'MOTIVATION', label: 'Renewal motivation', detail: 'Motivation supporting continued possession.', documentType: 'MOTIVATION', required: true },
    { key: 'SAFE_AFFIDAVIT', label: 'Safe affidavit', detail: 'Evidence or affidavit confirming compliant safe storage.', documentType: 'SAFE_AFFIDAVIT', required: true },
  ],
  FIREARM_LICENCE_REAPPLICATION: [
    ...COMMON,
    { key: 'COMPETENCY_CERTIFICATE', label: 'Matching competency certificate', detail: 'A verified competency matching the firearm category.', documentType: 'COMPETENCY_CERTIFICATE', required: true },
    { key: 'FIREARM_LICENCE_CARD', label: 'Previous firearm licence card', detail: 'Front and back copies of the previous licence card.', documentType: 'FIREARM_LICENCE_CARD', required: true },
    { key: 'FIREARM_LICENCE_APPLICATION_FORM', label: 'Firearm licence application form', detail: 'The applicable SAPS firearm licence application form.', documentType: 'FIREARM_LICENCE_APPLICATION_FORM', required: true },
    { key: 'MOTIVATION', label: 'Reapplication motivation', detail: 'Motivation explaining the reapplication circumstances.', documentType: 'MOTIVATION', required: true },
    { key: 'SAFE_AFFIDAVIT', label: 'Safe affidavit', detail: 'Evidence or affidavit confirming compliant safe storage.', documentType: 'SAFE_AFFIDAVIT', required: true },
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
  if (required.some((item) => item.state === 'UNVERIFIED')) return 'ACTION_REQUIRED';
  return 'READY';
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
    db.from('clients').select('first_name,surname').eq('id', clientId).single(),
    db.from('application_cases').select('*').eq('client_id', clientId).not('status', 'in', '("APPROVED","DECLINED","WITHDRAWN","CLOSED")').order('opened_date', { ascending: false }),
    db.from('competencies').select('id,category,certificate_number,issue_date,verified').eq('client_id', clientId),
    db.from('firearms').select('id,make,model,calibre,serial_number,required_competency').eq('client_id', clientId).eq('is_active', true),
    db.from('firearm_licences').select('id,firearm_id,licence_number,licence_section,issue_date,expiry_date').eq('client_id', clientId),
    db.from('documents').select('*').eq('client_id', clientId).eq('lifecycle_status', 'ACTIVE'),
  ]);
  const error = clientResult.error ?? casesResult.error ?? competenciesResult.error ?? firearmsResult.error ?? licencesResult.error ?? documentsResult.error;
  if (error) throw new Error(error.message);

  const client = clientResult.data as ClientRow;
  const cases = (casesResult.data ?? []) as CaseRow[];
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
    const matchingCompetency = category ? competencies.find((item) => item.category === category) : undefined;
    const baseDefinitions = REQUIREMENTS[applicationCase.application_type] ?? COMMON;
    const definitions: RequirementDefinition[] = [...baseDefinitions];

    if (applicationCase.acquisition_source === 'DEALER') {
      definitions.push(
        { key: 'PURCHASE_INVOICE', label: 'Dealer invoice or sale document', detail: 'Dealer invoice or sale document identifying the firearm and purchaser.', documentType: 'PURCHASE_INVOICE', required: true },
        { key: 'DEALER_STOCK_DOCUMENT', label: 'Dealer stock document', detail: 'Dealer stock, transfer or equivalent supporting document for the firearm.', documentType: 'DEALER_STOCK_DOCUMENT', required: true },
      );
    }

    if (applicationCase.acquisition_source === 'PRIVATE_SELLER') {
      definitions.push(
        { key: 'SELLER_ID_COPY', label: 'Private seller ID copy', detail: 'A clear copy of the private seller’s identity document.', documentType: 'SELLER_ID_COPY', required: true },
        { key: 'SELLER_LICENCE_COPY', label: 'Seller firearm licence copy', detail: 'A copy of the seller’s firearm licence for the firearm being sold.', documentType: 'SELLER_LICENCE_COPY', required: true },
        { key: 'PURCHASE_INVOICE', label: 'Private sale agreement', detail: 'Signed sale agreement or equivalent proof of the private sale.', documentType: 'PURCHASE_INVOICE', required: true },
      );
    }

    const section = (applicationCase.licence_section ?? licence?.licence_section ?? '').replace(/[^0-9]/g, '');
    if (section === '16') {
      definitions.push(
        { key: 'DEDICATED_STATUS', label: 'Dedicated status certificate', detail: 'Recommended supporting evidence for a Section 16 application.', documentType: 'DEDICATED_STATUS', required: false },
        { key: 'GOOD_STANDING', label: 'Good-standing letter', detail: 'Recommended proof that the applicant remains in good standing.', documentType: 'GOOD_STANDING', required: false },
        { key: 'MEMBERSHIP_CERTIFICATE', label: 'Membership certificate', detail: 'Recommended current membership evidence.', documentType: 'MEMBERSHIP_CERTIFICATE', required: false },
        { key: 'ENDORSEMENT', label: 'Endorsement', detail: 'Recommended firearm-specific endorsement where available.', documentType: 'ENDORSEMENT', required: false },
        { key: 'SUPPORTING_RESEARCH', label: 'Firearm or calibre research', detail: 'Optional supporting research that strengthens the motivation.', documentType: 'SUPPORTING_RESEARCH', required: false },
      );
    }

    const requirements: ReadinessRequirement[] = definitions.map((definition) => {
      let state: RequirementState;
      if (definition.key === 'COMPETENCY_CERTIFICATE') {
        state = !matchingCompetency || !matchingCompetency.certificate_number || !matchingCompetency.issue_date
          ? 'MISSING'
          : matchingCompetency.verified ? 'SATISFIED' : 'UNVERIFIED';
      } else {
        const candidates = documents.filter((document) => document.document_type === definition.documentType);
        const linked = candidates.find((document) =>
          document.application_case_id === applicationCase.id ||
          (firearm && document.firearm_id === firearm.id) ||
          (licence && document.firearm_licence_id === licence.id) ||
          document.document_scope === 'CLIENT'
        ) ?? candidates[0];
        state = documentState(linked);
      }
      return { ...definition, state };
    });

    if (firearm && !matchingCompetency) {
      requirements.unshift({ key: 'MATCHING_COMPETENCY', label: `Matching ${firearm.required_competency.toLowerCase()} competency`, detail: 'The firearm cannot proceed without the matching competency category.', state: 'MISSING', required: true, documentType: null });
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
          requirements.unshift({ key: 'LICENCE_TERM_REVIEW', label: 'Licence term requires review', detail: `Section ${applicationCase.licence_section ?? licence.licence_section} is expected to use a ${expectedYears}-year term. Verify the recorded expiry date.`, state: 'UNVERIFIED', required: true, documentType: null });
        }
      }
    }

    const state = stateFor(requirements);
    const required = requirements.filter((item) => item.required);
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
      warningCount: requirements.filter((item) => item.required && item.state === 'UNVERIFIED').length,
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
