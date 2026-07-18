import { supabase } from '../lib/supabase';
import {
  getApplicationCaseTypeLabel,
  isCompetencyApplicationType,
  isFirearmApplicationType,
  type ApplicationCaseRecord,
  type ApplicationCaseType,
} from '../types/applicationCase';
import type {
  ApplicationAutofillPackage,
  AutofillFormCode,
  AutofillValidationIssue,
} from '../types/applicationAutofill';
import type { ClientRecord } from '../types/client';
import type { CompetencyRecord } from '../types/competency';
import type {
  FirearmLicenceRecord,
  FirearmRecord,
} from '../types/firearm';

function text(value: string | null | undefined): string {
  return value?.trim() ?? '';
}

function selectFormCode(type: ApplicationCaseType): AutofillFormCode {
  switch (type) {
    case 'COMPETENCY_FIRST_APPLICATION':
      return 'SAPS_517';
    case 'COMPETENCY_ADDITIONAL_CATEGORY':
      return 'SAPS_517_A';
    case 'COMPETENCY_RENEWAL':
    case 'COMPETENCY_REAPPLICATION':
      return 'SAPS_517_G';
    case 'FIREARM_LICENCE_FIRST_APPLICATION':
    case 'FIREARM_LICENCE_ADDITIONAL_APPLICATION':
      return 'SAPS_271';
    case 'FIREARM_LICENCE_RENEWAL':
    case 'FIREARM_LICENCE_REAPPLICATION':
      return 'SAPS_518_A';
    default:
      return 'APPLICATION_WORKSHEET';
  }
}

function formLabel(code: AutofillFormCode): string {
  switch (code) {
    case 'SAPS_271':
      return 'SAPS 271 — Application for a licence to possess a firearm';
    case 'SAPS_517':
      return 'SAPS 517 — Application for a competency certificate';
    case 'SAPS_517_A':
      return 'SAPS 517(a) — Application for a further competency certificate';
    case 'SAPS_517_G':
      return 'SAPS 517(g) — Application for renewal of a competency certificate';
    case 'SAPS_518_A':
      return 'SAPS 518(a) — Application for renewal of a firearm licence';
    default:
      return 'LicenceGuard application worksheet';
  }
}

function buildAddress(client: ClientRecord): string {
  return [client.address_line_1, client.address_line_2]
    .map(text)
    .filter(Boolean)
    .join(', ');
}

function validate(
  client: ClientRecord,
  applicationCase: ApplicationCaseRecord,
  firearm: FirearmRecord | null,
  licence: FirearmLicenceRecord | null,
  competency: CompetencyRecord | null
): AutofillValidationIssue[] {
  const issues: AutofillValidationIssue[] = [];
  const blocking = (key: string, label: string, message: string) =>
    issues.push({ key, label, message, severity: 'BLOCKING' });
  const warning = (key: string, label: string, message: string) =>
    issues.push({ key, label, message, severity: 'WARNING' });

  if (!text(client.first_name)) blocking('firstName', 'First name', 'Record the applicant first name.');
  if (!text(client.surname)) blocking('surname', 'Surname', 'Record the applicant surname.');
  if (!text(client.id_number)) blocking('idNumber', 'ID number', 'Record the applicant identity number.');
  if (!text(client.cellphone)) warning('cellphone', 'Cellphone', 'A cellphone number should be recorded.');
  if (!text(client.address_line_1)) blocking('address', 'Residential address', 'Record the applicant residential address.');
  if (!text(client.city)) blocking('city', 'Town or city', 'Record the applicant town or city.');
  if (!text(client.province)) blocking('province', 'Province', 'Record the applicant province.');
  if (!text(client.postal_code)) warning('postalCode', 'Postal code', 'Record the applicant postal code.');

  if (isFirearmApplicationType(applicationCase.application_type)) {
    if (!firearm) {
      blocking('firearm', 'Firearm', 'Link a firearm to this application case.');
    } else {
      if (!text(firearm.make)) blocking('firearmMake', 'Firearm make', 'Record the firearm make.');
      if (!text(firearm.calibre)) blocking('calibre', 'Calibre', 'Record the firearm calibre.');
      if (!text(firearm.serial_number)) blocking('serialNumber', 'Serial number', 'Record the firearm serial number.');
    }

    if (!text(applicationCase.licence_section)) {
      blocking('licenceSection', 'Licence section', 'Select the applicable Firearms Control Act licence section.');
    }

    if (
      ['FIREARM_LICENCE_RENEWAL', 'FIREARM_LICENCE_REAPPLICATION'].includes(
        applicationCase.application_type
      )
    ) {
      if (!licence) blocking('licence', 'Existing licence', 'Link the existing firearm licence.');
      if (licence && !text(licence.licence_number)) blocking('licenceNumber', 'Licence number', 'Record the existing firearm licence number.');
      if (licence && !text(licence.expiry_date)) blocking('licenceExpiry', 'Licence expiry date', 'Record the existing licence expiry date.');
    }
  }

  if (isCompetencyApplicationType(applicationCase.application_type)) {
    if (!applicationCase.competency_category) {
      blocking('competencyCategory', 'Competency category', 'Select a competency category.');
    }

    if (
      ['COMPETENCY_RENEWAL', 'COMPETENCY_REAPPLICATION'].includes(
        applicationCase.application_type
      )
    ) {
      if (!competency) blocking('competency', 'Existing competency', 'Link the competency being renewed or reapplied for.');
      if (competency && !text(competency.certificate_number)) warning('competencyNumber', 'Competency certificate number', 'Record the existing certificate number where available.');
    }
  }

  if (!text(applicationCase.police_station)) warning('policeStation', 'Police station', 'Record the intended DFO police station.');
  if (!text(applicationCase.motivation_summary) && isFirearmApplicationType(applicationCase.application_type)) {
    warning('motivation', 'Motivation summary', 'Add a motivation summary before producing the final application pack.');
  }

  return issues;
}

export async function buildApplicationAutofillPackage(
  clientId: string,
  applicationCaseId: string
): Promise<ApplicationAutofillPackage> {
  const { data: caseData, error: caseError } = await supabase
    .from('application_cases')
    .select('*')
    .eq('id', applicationCaseId)
    .eq('client_id', clientId)
    .single();

  if (caseError) throw new Error(caseError.message);
  const applicationCase = caseData as ApplicationCaseRecord;

  const [clientResult, firearmResult, licenceResult, competencyResult] = await Promise.all([
    supabase.from('clients').select('*').eq('id', clientId).single(),
    applicationCase.firearm_id
      ? supabase.from('firearms').select('*').eq('id', applicationCase.firearm_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    applicationCase.firearm_licence_id
      ? supabase.from('firearm_licences').select('*').eq('id', applicationCase.firearm_licence_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    applicationCase.competency_id
      ? supabase.from('competencies').select('*').eq('id', applicationCase.competency_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  const firstError = clientResult.error ?? firearmResult.error ?? licenceResult.error ?? competencyResult.error;
  if (firstError) throw new Error(firstError.message);

  const client = clientResult.data as ClientRecord;
  const firearm = (firearmResult.data ?? null) as FirearmRecord | null;
  const licence = (licenceResult.data ?? null) as FirearmLicenceRecord | null;
  const competency = (competencyResult.data ?? null) as CompetencyRecord | null;
  const issues = validate(client, applicationCase, firearm, licence, competency);
  const code = selectFormCode(applicationCase.application_type);

  return {
    generatedAt: new Date().toISOString(),
    applicant: {
      fullName: `${client.first_name} ${client.surname}`.trim(),
      firstName: text(client.first_name),
      surname: text(client.surname),
      idNumber: text(client.id_number),
      cellphone: text(client.cellphone),
      alternateCellphone: text(client.alternate_cellphone),
      email: text(client.email),
      residentialAddress: buildAddress(client),
      suburb: text(client.suburb),
      city: text(client.city),
      province: text(client.province),
      postalCode: text(client.postal_code),
    },
    firearm: firearm
      ? {
          make: text(firearm.make),
          model: text(firearm.model),
          calibre: text(firearm.calibre),
          serialNumber: text(firearm.serial_number),
          firearmType: firearm.firearm_type,
          licenceNumber: text(licence?.licence_number),
          licenceSection: text(applicationCase.licence_section ?? licence?.licence_section),
          licenceIssueDate: text(licence?.issue_date),
          licenceExpiryDate: text(licence?.expiry_date),
        }
      : null,
    competency: applicationCase.competency_category || competency
      ? {
          category: applicationCase.competency_category ?? competency?.category ?? null,
          certificateNumber: text(competency?.certificate_number),
          issueDate: text(competency?.issue_date),
          expiryDate: text(competency?.expiry_date),
        }
      : null,
    supplier: applicationCase.acquisition_source !== 'NOT_APPLICABLE'
      ? {
          acquisitionSource: applicationCase.acquisition_source,
          name: text(applicationCase.supplier_name),
          idOrRegistration: text(applicationCase.supplier_id_or_registration),
          contact: text(applicationCase.supplier_contact),
          dealerLicenceNumber: text(applicationCase.supplier_licence_number),
          saleOrInvoiceReference: text(applicationCase.sale_or_invoice_reference),
        }
      : null,
    application: {
      applicationCaseId,
      applicationType: applicationCase.application_type,
      applicationTypeLabel: getApplicationCaseTypeLabel(applicationCase.application_type),
      formCode: code,
      formLabel: formLabel(code),
      policeStation: text(applicationCase.police_station),
      applicationReference: text(applicationCase.application_reference),
      openedDate: text(applicationCase.opened_date),
      targetSubmissionDate: text(applicationCase.target_submission_date),
      motivationSummary: text(applicationCase.motivation_summary),
    },
    issues,
    blockingIssueCount: issues.filter((issue) => issue.severity === 'BLOCKING').length,
    warningCount: issues.filter((issue) => issue.severity === 'WARNING').length,
    canGenerate: !issues.some((issue) => issue.severity === 'BLOCKING'),
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function row(label: string, value: string): string {
  return `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value || '—')}</td></tr>`;
}

export function printApplicationAutofillPackage(data: ApplicationAutofillPackage): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('AutoFill printing is currently available on LicenceGuard Web.');
  }

  if (!data.canGenerate) {
    throw new Error('Resolve all blocking AutoFill issues before generating the form worksheet.');
  }

  const popup = window.open('', '_blank');
  if (!popup) throw new Error('Allow pop-ups for LicenceGuard and try again.');

  const firearmRows = data.firearm
    ? row('Make', data.firearm.make) + row('Model', data.firearm.model) + row('Calibre', data.firearm.calibre) + row('Serial number', data.firearm.serialNumber) + row('Firearm type', data.firearm.firearmType ?? '') + row('Licence section', data.firearm.licenceSection) + row('Existing licence number', data.firearm.licenceNumber) + row('Licence issue date', data.firearm.licenceIssueDate) + row('Licence expiry date', data.firearm.licenceExpiryDate)
    : '';

  const competencyRows = data.competency
    ? row('Competency category', data.competency.category ?? '') + row('Certificate number', data.competency.certificateNumber) + row('Issue date', data.competency.issueDate) + row('Expiry date', data.competency.expiryDate)
    : '';

  const supplierRows = data.supplier
    ? row('Acquisition source', data.supplier.acquisitionSource) + row('Supplier', data.supplier.name) + row('ID / registration', data.supplier.idOrRegistration) + row('Contact', data.supplier.contact) + row('Dealer licence number', data.supplier.dealerLicenceNumber) + row('Sale / invoice reference', data.supplier.saleOrInvoiceReference)
    : '';

  const warnings = data.issues.filter((issue) => issue.severity === 'WARNING');

  popup.document.open();
  popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(data.application.formLabel)}</title><style>
    body{font-family:Arial,sans-serif;color:#111;margin:28px} h1{margin-bottom:4px} h2{margin-top:26px;border-bottom:2px solid #222;padding-bottom:5px} .muted{color:#555} .notice{border:1px solid #999;padding:12px;margin:18px 0;background:#f5f5f5} table{width:100%;border-collapse:collapse} th,td{border:1px solid #bbb;padding:8px;text-align:left;vertical-align:top} th{width:32%;background:#eee} .footer{margin-top:30px;font-size:11px;color:#666}@media print{body{margin:12mm}}
  </style></head><body>
    <h1>${escapeHtml(data.application.formLabel)}</h1>
    <div class="muted">LicenceGuard AutoFill worksheet • Generated ${escapeHtml(new Date(data.generatedAt).toLocaleString('en-ZA'))}</div>
    <div class="notice"><strong>Important:</strong> This worksheet transfers captured LicenceGuard data into a printable checking format. Verify every entry against the current official SAPS form before signature and submission.</div>
    <h2>Application</h2><table>${row('Application type', data.application.applicationTypeLabel)}${row('Police station / DFO', data.application.policeStation)}${row('Application reference', data.application.applicationReference)}${row('Opened date', data.application.openedDate)}${row('Target submission date', data.application.targetSubmissionDate)}${row('Motivation summary', data.application.motivationSummary)}</table>
    <h2>Applicant</h2><table>${row('First names', data.applicant.firstName)}${row('Surname', data.applicant.surname)}${row('ID number', data.applicant.idNumber)}${row('Cellphone', data.applicant.cellphone)}${row('Alternate cellphone', data.applicant.alternateCellphone)}${row('Email', data.applicant.email)}${row('Residential address', data.applicant.residentialAddress)}${row('Suburb', data.applicant.suburb)}${row('Town / city', data.applicant.city)}${row('Province', data.applicant.province)}${row('Postal code', data.applicant.postalCode)}</table>
    ${firearmRows ? `<h2>Firearm and licence</h2><table>${firearmRows}</table>` : ''}
    ${competencyRows ? `<h2>Competency</h2><table>${competencyRows}</table>` : ''}
    ${supplierRows ? `<h2>Supplier / seller</h2><table>${supplierRows}</table>` : ''}
    ${warnings.length ? `<h2>Warnings to verify</h2><ul>${warnings.map((issue) => `<li><strong>${escapeHtml(issue.label)}:</strong> ${escapeHtml(issue.message)}</li>`).join('')}</ul>` : ''}
    <div class="footer">LicenceGuard • Firearm Licence Renewal Management</div>
  </body></html>`);
  popup.document.close();
  popup.focus();
  window.setTimeout(() => popup.print(), 250);
}