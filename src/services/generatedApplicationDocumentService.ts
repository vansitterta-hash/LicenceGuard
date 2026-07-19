import { supabase } from '../lib/supabase';
import type { ApplicationAutofillPackage } from '../types/applicationAutofill';
import type { DocumentRecord, DocumentType } from '../types/document';

const DOCUMENT_BUCKET = 'licenceguard-documents';
const db = supabase as any;

export type ApplicationReviewValues = {
  policeStation: string;
  applicationReference: string;
  motivationSummary: string;
  firstName: string;
  surname: string;
  idNumber: string;
  cellphone: string;
  alternateCellphone: string;
  email: string;
  residentialAddress: string;
  suburb: string;
  city: string;
  province: string;
  postalCode: string;
  firearmMake: string;
  firearmModel: string;
  calibre: string;
  serialNumber: string;
  licenceSection: string;
  licenceNumber: string;
  competencyCategory: string;
  competencyCertificateNumber: string;
  supplierName: string;
  supplierIdOrRegistration: string;
  supplierContact: string;
  supplierLicenceNumber: string;
  saleOrInvoiceReference: string;
};

export function createReviewValues(data: ApplicationAutofillPackage): ApplicationReviewValues {
  return {
    policeStation: data.application.policeStation,
    applicationReference: data.application.applicationReference,
    motivationSummary: data.application.motivationSummary,
    firstName: data.applicant.firstName,
    surname: data.applicant.surname,
    idNumber: data.applicant.idNumber,
    cellphone: data.applicant.cellphone,
    alternateCellphone: data.applicant.alternateCellphone,
    email: data.applicant.email,
    residentialAddress: data.applicant.residentialAddress,
    suburb: data.applicant.suburb,
    city: data.applicant.city,
    province: data.applicant.province,
    postalCode: data.applicant.postalCode,
    firearmMake: data.firearm?.make ?? '',
    firearmModel: data.firearm?.model ?? '',
    calibre: data.firearm?.calibre ?? '',
    serialNumber: data.firearm?.serialNumber ?? '',
    licenceSection: data.firearm?.licenceSection ?? '',
    licenceNumber: data.firearm?.licenceNumber ?? '',
    competencyCategory: data.competency?.category ?? '',
    competencyCertificateNumber: data.competency?.certificateNumber ?? '',
    supplierName: data.supplier?.name ?? '',
    supplierIdOrRegistration: data.supplier?.idOrRegistration ?? '',
    supplierContact: data.supplier?.contact ?? '',
    supplierLicenceNumber: data.supplier?.dealerLicenceNumber ?? '',
    saleOrInvoiceReference: data.supplier?.saleOrInvoiceReference ?? '',
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

export function buildCompletedApplicationHtml(
  data: ApplicationAutofillPackage,
  values: ApplicationReviewValues
): string {
  const firearmRows = data.firearm
    ? row('Make', values.firearmMake) + row('Model', values.firearmModel) + row('Calibre', values.calibre) + row('Serial number', values.serialNumber) + row('Firearm type', data.firearm.firearmType ?? '') + row('Licence section', values.licenceSection) + row('Existing licence number', values.licenceNumber)
    : '';

  const competencyRows = data.competency
    ? row('Competency category', values.competencyCategory) + row('Certificate number', values.competencyCertificateNumber) + row('Issue date', data.competency.issueDate) + row('Expiry date', data.competency.expiryDate)
    : '';

  const supplierRows = data.supplier
    ? row('Acquisition source', data.supplier.acquisitionSource) + row('Supplier / seller', values.supplierName) + row('ID / registration', values.supplierIdOrRegistration) + row('Contact', values.supplierContact) + row('Dealer / seller licence number', values.supplierLicenceNumber) + row('Sale / invoice reference', values.saleOrInvoiceReference)
    : '';

  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(data.application.formLabel)}</title><style>
  @page{size:A4;margin:12mm}body{font-family:Arial,sans-serif;color:#111;margin:0;font-size:12px}h1{font-size:22px;margin:0 0 4px}h2{font-size:15px;margin:18px 0 6px;border-bottom:2px solid #222;padding-bottom:4px}.meta{color:#555;margin-bottom:14px}.notice{border:1px solid #777;padding:10px;background:#f4f4f4;margin:12px 0}table{width:100%;border-collapse:collapse;page-break-inside:avoid}th,td{border:1px solid #999;padding:7px;text-align:left;vertical-align:top}th{width:34%;background:#eee}.signatures{margin-top:28px;display:grid;grid-template-columns:1fr 1fr;gap:28px}.signature{padding-top:30px;border-bottom:1px solid #111}.footer{margin-top:24px;font-size:10px;color:#666}@media print{.no-print{display:none}}
  </style></head><body>
  <h1>${escapeHtml(data.application.formLabel)}</h1>
  <div class="meta">Form code: ${escapeHtml(data.application.formCode.replaceAll('_', ' '))} • LicenceGuard generated ${escapeHtml(new Date().toLocaleString('en-ZA'))}</div>
  <div class="notice"><strong>Review copy:</strong> Confirm every entry against source documents and the current official SAPS form before signature and submission.</div>
  <h2>Application details</h2><table>${row('Application type', data.application.applicationTypeLabel)}${row('Police station / DFO', values.policeStation)}${row('Application reference', values.applicationReference)}${row('Opened date', data.application.openedDate)}${row('Target submission date', data.application.targetSubmissionDate)}${row('Motivation summary', values.motivationSummary)}</table>
  <h2>Applicant</h2><table>${row('First names', values.firstName)}${row('Surname', values.surname)}${row('Identity number', values.idNumber)}${row('Cellphone', values.cellphone)}${row('Alternate cellphone', values.alternateCellphone)}${row('Email', values.email)}${row('Residential address', values.residentialAddress)}${row('Suburb', values.suburb)}${row('Town / city', values.city)}${row('Province', values.province)}${row('Postal code', values.postalCode)}</table>
  ${firearmRows ? `<h2>Firearm and licence</h2><table>${firearmRows}</table>` : ''}
  ${competencyRows ? `<h2>Competency</h2><table>${competencyRows}</table>` : ''}
  ${supplierRows ? `<h2>Dealer / private seller</h2><table>${supplierRows}</table>` : ''}
  <div class="signatures"><div><div class="signature"></div><div>Applicant signature</div></div><div><div class="signature"></div><div>Date</div></div></div>
  <div class="footer">LicenceGuard • Firearm Licence Renewal Management • Generated copy archived against application case ${escapeHtml(data.application.applicationCaseId)}</div>
  </body></html>`;
}

export function printCompletedApplication(html: string): void {
  if (typeof window === 'undefined') throw new Error('Printing is available on LicenceGuard Web.');
  const popup = window.open('', '_blank');
  if (!popup) throw new Error('Allow pop-ups for LicenceGuard and try again.');
  popup.document.open();
  popup.document.write(html);
  popup.document.close();
  popup.focus();
  window.setTimeout(() => popup.print(), 250);
}

function documentTypeFor(data: ApplicationAutofillPackage): DocumentType {
  if (data.application.formCode === 'SAPS_271') return 'FIREARM_LICENCE_APPLICATION_FORM';
  if (data.application.formCode === 'SAPS_518_A') return 'FIREARM_LICENCE_RENEWAL_FORM';
  if (data.application.formCode === 'SAPS_517_G') return 'COMPETENCY_RENEWAL_FORM';
  return 'COMPETENCY_APPLICATION';
}

export async function archiveCompletedApplication(input: {
  dealerId: string;
  clientId: string;
  userId: string;
  data: ApplicationAutofillPackage;
  values: ApplicationReviewValues;
}): Promise<DocumentRecord> {
  const html = buildCompletedApplicationHtml(input.data, input.values);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `${input.data.application.formCode}_${timestamp}.html`;
  const storagePath = `${input.dealerId}/${input.clientId}/GENERATED_APPLICATIONS/${fileName}`;
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });

  const upload = await db.storage.from(DOCUMENT_BUCKET).upload(storagePath, blob, {
    contentType: 'text/html;charset=utf-8',
    upsert: false,
  });
  if (upload.error) throw new Error(upload.error.message);

  const inserted = await db.from('documents').insert({
    dealer_id: input.dealerId,
    client_id: input.clientId,
    competency_id: null,
    firearm_id: null,
    firearm_licence_id: null,
    application_case_id: input.data.application.applicationCaseId,
    parent_document_id: null,
    document_type: documentTypeFor(input.data),
    document_scope: 'APPLICATION_CASE',
    lifecycle_status: 'ACTIVE',
    document_name: `${input.data.application.formLabel} — completed review copy`,
    document_date: new Date().toISOString().slice(0, 10),
    expiry_date: null,
    issued_by: 'LicenceGuard AutoFill',
    reference_number: input.values.applicationReference.trim() || null,
    version_number: 1,
    storage_path: storagePath,
    file_name: fileName,
    original_file_name: fileName,
    mime_type: 'text/html;charset=utf-8',
    file_size_bytes: blob.size,
    is_verified: false,
    is_generated: true,
    generated_from_template_id: null,
    notes: `Generated from ${input.data.application.formCode}. Review before signature and SAPS submission.`,
    metadata: {
      formCode: input.data.application.formCode,
      applicationType: input.data.application.applicationType,
      reviewValues: input.values,
    },
    created_by: input.userId,
    updated_by: input.userId,
  }).select('*').single();

  if (inserted.error) {
    await db.storage.from(DOCUMENT_BUCKET).remove([storagePath]);
    throw new Error(inserted.error.message);
  }
  return inserted.data as DocumentRecord;
}
