import { supabase } from '../lib/supabase';
import type { ApplicationAutofillPackage } from '../types/applicationAutofill';
import type { DocumentRecord, DocumentType } from '../types/document';
import { mapApplicationToSapsTemplate } from '../engines/sapsFieldMappingEngine';
import { getSapsTemplate } from '../data/sapsTemplateRegistry';
import { renderOfficialPdfTemplate } from '../engines/pdfTemplateRenderer';

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
  const mapped = mapApplicationToSapsTemplate(data, values);
  const mappedSections = mapped.sections.map((section) => {
    const rows = section.fields.map((field) => row(field.label, field.value)).join('');
    return `<h2>${escapeHtml(section.title)}</h2><table>${rows}</table>`;
  }).join('');

  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(mapped.template.name)}</title><style>
  @page{size:A4;margin:12mm}body{font-family:Arial,sans-serif;color:#111;margin:0;font-size:12px}h1{font-size:22px;margin:0 0 4px}h2{font-size:15px;margin:18px 0 6px;border-bottom:2px solid #222;padding-bottom:4px}.meta{color:#555;margin-bottom:14px}.notice{border:1px solid #777;padding:10px;background:#f4f4f4;margin:12px 0}.source{border-left:4px solid #8b0000;padding:8px 10px;background:#fafafa;margin:12px 0}table{width:100%;border-collapse:collapse;page-break-inside:avoid}th,td{border:1px solid #999;padding:7px;text-align:left;vertical-align:top}th{width:42%;background:#eee}.tick{font-weight:700;font-size:16px}.signatures{margin-top:28px;display:grid;grid-template-columns:1fr 1fr;gap:28px}.signature{padding-top:30px;border-bottom:1px solid #111}.footer{margin-top:24px;font-size:10px;color:#666}@media print{.no-print{display:none}}
  </style></head><body>
  <h1>${escapeHtml(mapped.template.name)}</h1>
  <div class="meta">Template: ${escapeHtml(mapped.template.versionLabel)} | LicenceGuard generated ${escapeHtml(new Date().toLocaleString('en-ZA'))}</div>
  <div class="source"><strong>Official blank form:</strong> ${escapeHtml(mapped.template.sourceUrl || 'Not available')}<br/><strong>Mapped:</strong> ${mapped.mappedFieldCount} fields | <strong>Missing required:</strong> ${mapped.missingRequiredFieldCount}</div>
  <div class="notice"><strong>Completion schedule:</strong> This document contains the values mapped to the official SAPS form. Confirm every entry against source documents and transfer the reviewed values to the current official form before signature and submission.</div>
  ${mappedSections}
  <div class="signatures"><div><div class="signature"></div><div>Applicant review signature</div></div><div><div class="signature"></div><div>Date</div></div></div>
  <div class="footer">LicenceGuard | Firearm Licence Renewal Management | Application case ${escapeHtml(data.application.applicationCaseId)} | Original SAPS template remains unchanged.</div>
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
      templateSourceUrl: mapApplicationToSapsTemplate(input.data, input.values).template.sourceUrl,
      mappedDocument: mapApplicationToSapsTemplate(input.data, input.values),
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


export async function generateOfficialApplicationPdf(
  data: ApplicationAutofillPackage,
  values: ApplicationReviewValues
): Promise<Uint8Array> {
  const template = getSapsTemplate(data.application.formCode);
  return renderOfficialPdfTemplate({ template: template as never, context: { data, reviewValues: values } });
}

export async function archiveOfficialApplicationPdf(input: {
  dealerId: string;
  clientId: string;
  userId: string;
  data: ApplicationAutofillPackage;
  values: ApplicationReviewValues;
}): Promise<DocumentRecord> {
  const bytes = await generateOfficialApplicationPdf(input.data, input.values);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `${input.data.application.formCode}_${timestamp}.pdf`;
  const storagePath = `${input.dealerId}/${input.clientId}/GENERATED_APPLICATIONS/${fileName}`;
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });

  const upload = await db.storage.from(DOCUMENT_BUCKET).upload(storagePath, blob, {
    contentType: 'application/pdf',
    upsert: false,
  });
  if (upload.error) throw new Error(upload.error.message);

  const mappedDocument = mapApplicationToSapsTemplate(input.data, input.values);
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
    document_name: `${input.data.application.formLabel} - completed official PDF`,
    document_date: new Date().toISOString().slice(0, 10),
    expiry_date: null,
    issued_by: 'LicenceGuard Document Engine',
    reference_number: input.values.applicationReference.trim() || null,
    version_number: 1,
    storage_path: storagePath,
    file_name: fileName,
    original_file_name: fileName,
    mime_type: 'application/pdf',
    file_size_bytes: blob.size,
    is_verified: false,
    is_generated: true,
    generated_from_template_id: null,
    notes: `Generated onto the official ${input.data.application.formCode} template. Review every field before signature and submission.`,
    metadata: {
      formCode: input.data.application.formCode,
      templateSourceUrl: mappedDocument.template.sourceUrl,
      mappedDocument,
      applicationType: input.data.application.applicationType,
      reviewValues: input.values,
      renderer: 'LICENCEGUARD_PDF_OVERLAY_V1',
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
