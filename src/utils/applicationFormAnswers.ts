import type { CompetencyCategory } from '../types/competency';
import type { Saps271Declarations } from '../types/saps271Declarations';
import { declarationDataIssues } from './saps271Declarations';
import { isValidSouthAfricanId } from './southAfricanId';

// Case-specific answers live in the existing private client declaration JSON.
// They are never copied from another application or inferred from a PDF date.
export type ApplicationFormAnswers = {
  furtherCategories?: CompetencyCategory[];
  previousCompetencyIds?: string[];
  associationMember?: 'YES' | 'NO';
  associationName?: string;
  associationNumber?: string;
  associationJoined?: string;
  submissionDate?: string;
  submissionKind?: 'INTENDED' | 'ACTUAL';
  before90Reason?: string;
  beforeExpiryReason?: string;
  afterExpiryReason?: string;
  licenceTermConfirmed?: string;
};
export type FormCase = {
  id: string; application_type: string; competency_category?: CompetencyCategory | null;
  competency_id?: string | null; licence_section?: string | null;
  actual_submission_date?: string | null; target_submission_date?: string | null;
};
export type FormCompetency = {
  id: string; category: CompetencyCategory; certificate_number?: string | null;
  issue_date?: string | null; expiry_date?: string | null; verified?: boolean;
};
export type FormLicence = { id: string; licence_section?: string | null; issue_date?: string | null; expiry_date?: string | null };
export const FURTHER_CATEGORIES: CompetencyCategory[] = ['HANDGUN', 'RIFLE', 'SHOTGUN'];
export function applicationFormAnswers(profile: Saps271Declarations | null | undefined, caseId: string): ApplicationFormAnswers {
  return profile?.applications?.[caseId] ?? {};
}
export function dateDay(value: string | null | undefined): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? time / 86400000 : null;
}
export function renewalTiming(expiry: string | null | undefined, submission: string | null | undefined) {
  const end = dateDay(expiry), handed = dateDay(submission);
  if (end === null || handed === null) return { before90: '', beforeExpiry: '', afterExpiry: '' };
  return { before90: end - handed >= 90 ? 'YES' : 'NO', beforeExpiry: handed > end - 90 && handed < end ? 'YES' : 'NO', afterExpiry: handed > end ? 'YES' : 'NO' };
}
export function licenceTermKey(licence: FormLicence | null | undefined): string {
  return licence ? [licence.id, licence.licence_section, licence.issue_date, licence.expiry_date].join('|') : '';
}
export function licenceTermNeedsReview(licence: FormLicence | null | undefined): boolean {
  const years = ({ '13': 5, '14': 2, '15': 10, '16': 10, '17': 10, '19': 10, '20': 5 } as Record<string, number>)[licence?.licence_section?.replace(/\D/g, '') ?? ''];
  if (!years || dateDay(licence?.issue_date) === null || dateDay(licence?.expiry_date) === null) return false;
  const expected = new Date(`${licence!.issue_date}T00:00:00Z`);
  expected.setUTCFullYear(expected.getUTCFullYear() + years);
  return Math.abs(expected.getTime() / 86400000 - dateDay(licence!.expiry_date)!) > 31;
}
export function previousCompetencies(records: FormCompetency[], application: FormCase, answers: ApplicationFormAnswers) {
  if (answers.previousCompetencyIds !== undefined) return records.filter(r => answers.previousCompetencyIds?.includes(r.id));
  if (application.competency_id) {
    const linked = records.find(r => r.id === application.competency_id);
    return linked ? records.filter(r => r.certificate_number === linked.certificate_number && r.issue_date === linked.issue_date && r.expiry_date === linked.expiry_date) : [];
  }
  const groups = new Set(records.map(r => [r.certificate_number, r.issue_date, r.expiry_date].join('|')));
  return groups.size === 1 ? records : [];
}
export function evaluateApplicationForm(input: {
  application: FormCase; profile?: Saps271Declarations | null; idNumber?: string | null;
  competencies: FormCompetency[]; competency?: FormCompetency | null; licence?: FormLicence | null;
}) {
  const { application: app, profile, competencies, competency, licence } = input;
  const answers = applicationFormAnswers(profile, app.id);
  const issues: string[] = [];
  const fields: Record<string, string> = {};
  const further = app.application_type === 'COMPETENCY_ADDITIONAL_CATEGORY';
  const renewal = app.application_type === 'COMPETENCY_RENEWAL';
  const firearmRenewal = app.application_type === 'FIREARM_LICENCE_RENEWAL';
  const prior = further ? previousCompetencies(competencies, app, answers) : [];
  // Validated client identity is an SA identity document, not a citizenship answer.
  fields.identificationType = isValidSouthAfricanId(input.idNumber ?? '') ? 'SA_ID' : '';
  if (further) {
    const categories = answers.furtherCategories ?? (app.competency_category ? [app.competency_category] : []);
    if (!categories.length || categories.some(c => !FURTHER_CATEGORIES.includes(c))) issues.push('Select the applicable Handgun, Rifle and/or Shotgun categories printed on SAPS 517(a). SLR has no separate box on this pinned form.');
    for (const category of FURTHER_CATEGORIES) fields[`further${category}`] = categories.includes(category) ? 'X' : '';
    fields.furtherCategories = categories.filter(c => FURTHER_CATEGORIES.includes(c)).join(', ');
    if (!prior.length || prior.some(r => !r.certificate_number || dateDay(r.issue_date) === null)) issues.push('Select the stored current/previous competency certificate with its number and issue date.');
    if (answers.previousCompetencyIds?.some(id => !prior.some(r => r.id === id))) issues.push('A selected previous competency is no longer available for this client.');
    if (new Set(prior.map(r => [r.certificate_number, r.issue_date, r.expiry_date].join('|'))).size > 1) issues.push('SAPS 517(a) has one previous-certificate section. Select the categories recorded on one certificate; different certificates require a reviewed continuation.');
    fields.previousCategory = prior.map(r => r.category).join(', ');
    fields.previousNumber = prior[0]?.certificate_number ?? '';
    fields.previousIssueDate = prior[0]?.issue_date ?? '';
    fields.previousExpiryDate = prior[0]?.expiry_date ?? '';
    fields.associationMember = answers.associationMember === 'YES' || answers.associationMember === 'NO' ? answers.associationMember : '';
    if (!fields.associationMember) issues.push('Answer SAPS 517(a) F5: membership of an accredited association.');
    if (fields.associationMember === 'YES') {
      fields.associationName = answers.associationName?.trim() ?? '';
      fields.associationNumber = answers.associationNumber?.trim() ?? '';
      fields.associationJoined = answers.associationJoined ?? '';
      if (!fields.associationName || !fields.associationNumber || dateDay(fields.associationJoined) === null) issues.push('Supply the accredited association name, membership number and date joined.');
    }
    issues.push(...declarationDataIssues(profile).map(s => s.replace(/G(6[2-7])/g, (_, n) => `F${Number(n) - 52}`)));
  }
  if (renewal || firearmRenewal) {
    const expiry = renewal ? competency?.expiry_date : licence?.expiry_date;
    // A target is a prefill, not an applicant confirmation. A recorded actual
    // hand-in date takes precedence and must agree with the confirmed answer.
    const selectedDate = app.actual_submission_date;
    const confirmed = ['INTENDED', 'ACTUAL'].includes(answers.submissionKind ?? '') && dateDay(answers.submissionDate) !== null
      && (!selectedDate || selectedDate === answers.submissionDate)
      && (!app.actual_submission_date || answers.submissionKind === 'ACTUAL');
    const timing = renewalTiming(expiry, confirmed ? answers.submissionDate : null);
    if (!confirmed) issues.push('Confirm the intended or actual SAPS hand-in date. PDF generation date is not the hand-in date.');
    if (dateDay(expiry) === null) issues.push('Record the existing certificate/licence expiry date before answering renewal timing questions.');
    fields.before90 = timing.before90; fields.afterExpiry = timing.afterExpiry; fields.beforeExpiry = timing.beforeExpiry;
    for (const [required, key, label] of [
      [timing.before90 === 'NO', 'before90Reason', 'not handing in at least 90 days before expiry'],
      [firearmRenewal && timing.beforeExpiry === 'YES', 'beforeExpiryReason', 'handing in after the due date but before expiry'],
      [timing.afterExpiry === 'YES', 'afterExpiryReason', 'handing in after expiry'],
    ] as const) {
      fields[key] = required ? answers[key]?.trim() ?? '' : '';
      if (required && !fields[key]) issues.push(`Provide the applicant's reason for ${label}.`);
    }
    if (renewal && competency?.category === 'SLR') issues.push('The stored SLR category does not distinguish the printed Hand Machine Carbine category. Review the certificate category before generating SAPS 517(g).');
  }
  if ((further || renewal || firearmRenewal) && !fields.identificationType) issues.push('A validated South African identity document is required for the supported applicant mapping.');
  if (app.application_type.startsWith('FIREARM_') && licenceTermNeedsReview(licence) && answers.licenceTermConfirmed !== licenceTermKey(licence)) issues.push('Review and confirm the recorded licence term against the existing licence, or correct its dates.');
  return { answers, fields, issues, previousCompetencies: prior };
}
