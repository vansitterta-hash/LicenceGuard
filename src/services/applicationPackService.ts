import { supabase } from '../lib/supabase';
import { getClientApplicationReadiness } from './applicationReadinessService';
import { getApplicationCaseTypeLabel } from '../types/applicationCase';
import { getDocumentTypeLabel, type DocumentRecord } from '../types/document';
import type { ApplicationPackData, ApplicationPackDocument } from '../types/applicationPack';

const db = supabase as any;
const SIGNED_URL_SECONDS = 3600;
const DOCUMENT_BUCKET = 'licenceguard-documents';

type ClientRow = {
  first_name: string;
  surname: string;
  id_number: string;
  cellphone: string | null;
  email: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  suburb: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
};

type CaseRow = {
  id: string;
  application_type: ApplicationPackData['applicationType'];
  status: string;
  competency_category: ApplicationPackData['subject']['competencyCategory'];
  firearm_id: string | null;
  firearm_licence_id: string | null;
  licence_section: string | null;
};

type FirearmRow = { make: string; model: string | null; calibre: string; serial_number: string };
type LicenceRow = { licence_number: string | null; licence_section: string | null; issue_date: string | null; expiry_date: string | null };

function joinAddress(client: ClientRow): string {
  return [client.address_line_1, client.address_line_2, client.suburb, client.city, client.province, client.postal_code]
    .map((value) => value?.trim())
    .filter(Boolean)
    .join(', ');
}

function escapeHtml(value: string | null | undefined): string {
  return (value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDate(value: string | null | undefined): string {
  if (!value) return 'Not recorded';
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-ZA', { day: '2-digit', month: 'long', year: 'numeric' });
}

async function getSignedDocument(document: DocumentRecord, order: number, requirementLabel: string): Promise<ApplicationPackDocument> {
  const result = await db.storage.from(DOCUMENT_BUCKET).createSignedUrl(document.storage_path, SIGNED_URL_SECONDS);
  if (result.error) throw new Error(result.error.message);
  if (!result.data?.signedUrl) throw new Error(`Could not create a secure link for ${document.document_name}.`);
  return {
    documentId: document.id,
    documentType: document.document_type,
    documentName: document.document_name,
    originalFileName: document.original_file_name,
    storagePath: document.storage_path,
    mimeType: document.mime_type,
    isVerified: document.is_verified,
    expiryDate: document.expiry_date,
    signedUrl: result.data.signedUrl,
    order,
    requirementLabel,
  };
}

export async function getApplicationPackData(clientId: string, caseId: string): Promise<ApplicationPackData> {
  const [clientResult, caseResult, documentsResult, readiness] = await Promise.all([
    db.from('clients').select('*').eq('id', clientId).single(),
    db.from('application_cases').select('*').eq('id', caseId).eq('client_id', clientId).single(),
    db.from('documents').select('*').eq('client_id', clientId).eq('lifecycle_status', 'ACTIVE').order('created_at', { ascending: true }),
    getClientApplicationReadiness(clientId),
  ]);
  if (clientResult.error) throw new Error(clientResult.error.message);
  if (caseResult.error) throw new Error(caseResult.error.message);
  if (documentsResult.error) throw new Error(documentsResult.error.message);

  const client = clientResult.data as ClientRow;
  const applicationCase = caseResult.data as CaseRow;
  const caseReadiness = readiness.cases.find((item) => item.caseId === caseId);
  if (!caseReadiness) throw new Error('This application case is closed or is not available to the readiness engine.');

  let firearm: FirearmRow | null = null;
  let licence: LicenceRow | null = null;
  if (applicationCase.firearm_id) {
    const result = await db.from('firearms').select('make, model, calibre, serial_number').eq('id', applicationCase.firearm_id).maybeSingle();
    if (result.error) throw new Error(result.error.message);
    firearm = result.data as FirearmRow | null;
  }
  if (applicationCase.firearm_licence_id) {
    const result = await db.from('firearm_licences').select('licence_number, licence_section, issue_date, expiry_date').eq('id', applicationCase.firearm_licence_id).maybeSingle();
    if (result.error) throw new Error(result.error.message);
    licence = result.data as LicenceRow | null;
  }

  const allDocuments = (documentsResult.data ?? []) as DocumentRecord[];
  const eligibleDocuments = allDocuments.filter((document) => !document.application_case_id || document.application_case_id === caseId);
  const selectedIds = new Set<string>();
  const selected: Array<{ document: DocumentRecord; label: string }> = [];

  for (const requirement of caseReadiness.requirements) {
    if (!requirement.documentType) continue;
    const match = eligibleDocuments.find((document) => document.document_type === requirement.documentType && !selectedIds.has(document.id));
    if (match) {
      selectedIds.add(match.id);
      selected.push({ document: match, label: requirement.label });
    }
  }

  for (const document of eligibleDocuments) {
    if (document.application_case_id === caseId && !selectedIds.has(document.id)) {
      selectedIds.add(document.id);
      selected.push({ document, label: getDocumentTypeLabel(document.document_type) });
    }
  }

  const documents = await Promise.all(selected.map((item, index) => getSignedDocument(item.document, index + 1, item.label)));
  const missingRequiredItems = caseReadiness.requirements
    .filter((item) => item.required && ['MISSING', 'EXPIRED'].includes(item.state))
    .map((item) => item.label);
  const warnings = caseReadiness.requirements
    .filter((item) => item.state === 'UNVERIFIED')
    .map((item) => `${item.label} is awaiting verification.`);

  return {
    clientId,
    caseId,
    applicationType: applicationCase.application_type,
    applicationTypeLabel: getApplicationCaseTypeLabel(applicationCase.application_type),
    caseStatus: applicationCase.status,
    readinessState: caseReadiness.state,
    readinessScore: caseReadiness.score,
    readyToGenerate: caseReadiness.readyToGenerate,
    generatedAt: new Date().toISOString(),
    client: {
      fullName: `${client.first_name} ${client.surname}`.trim(),
      idNumber: client.id_number,
      cellphone: client.cellphone,
      email: client.email,
      address: joinAddress(client),
    },
    subject: {
      description: caseReadiness.subject,
      competencyCategory: applicationCase.competency_category,
      firearmDescription: firearm ? [firearm.make, firearm.model, firearm.calibre, `Serial ${firearm.serial_number}`].filter(Boolean).join(' - ') : null,
      licenceNumber: licence?.licence_number ?? null,
      licenceSection: licence?.licence_section ?? applicationCase.licence_section,
      licenceIssueDate: licence?.issue_date ?? null,
      licenceExpiryDate: licence?.expiry_date ?? null,
    },
    requirements: caseReadiness.requirements,
    documents,
    missingRequiredItems,
    warnings,
  };
}

export function buildApplicationPackHtml(pack: ApplicationPackData, dealerName: string): string {
  const requirementRows = pack.requirements.map((item) => `<tr><td>${escapeHtml(item.label)}</td><td>${escapeHtml(item.state.replace(/_/g, ' '))}</td><td>${escapeHtml(item.detail)}</td></tr>`).join('');
  const documentRows = pack.documents.map((item) => `<tr><td>${item.order}</td><td>${escapeHtml(item.requirementLabel)}</td><td>${escapeHtml(item.documentName)}</td><td>${item.isVerified ? 'Verified' : 'Awaiting verification'}</td><td><a href="${escapeHtml(item.signedUrl)}">Open document</a></td></tr>`).join('');
  const missing = pack.missingRequiredItems.length ? `<div class="warning"><strong>Missing required items:</strong><ul>${pack.missingRequiredItems.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></div>` : '';
  const warnings = pack.warnings.length ? `<div class="notice"><strong>Warnings:</strong><ul>${pack.warnings.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></div>` : '';
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(pack.applicationTypeLabel)} - ${escapeHtml(pack.client.fullName)}</title><style>
  @page{size:A4;margin:16mm}body{font-family:Arial,sans-serif;color:#171717;line-height:1.45;margin:0}.cover{min-height:250mm;display:flex;flex-direction:column;justify-content:space-between}.brand{font-size:30px;font-weight:800}.brand span{color:#9d0b13}.subtitle{letter-spacing:2px;font-size:11px}.status{border:2px solid #9d0b13;padding:18px;margin:30px 0}.score{font-size:42px;font-weight:800}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.field{border-bottom:1px solid #bbb;padding:8px 0}.label{font-size:10px;text-transform:uppercase;color:#666}.value{font-weight:700}h1{font-size:24px}h2{font-size:18px;border-bottom:2px solid #9d0b13;padding-bottom:6px;margin-top:28px}table{width:100%;border-collapse:collapse;font-size:11px}th,td{border:1px solid #bbb;padding:7px;text-align:left;vertical-align:top}th{background:#eee}.warning{border:2px solid #b00020;background:#fff0f2;padding:12px;margin:16px 0}.notice{border:1px solid #b88700;background:#fff9df;padding:12px;margin:16px 0}.page-break{page-break-before:always}.footer{font-size:10px;color:#666;margin-top:24px}.print{position:fixed;right:16px;top:16px;padding:10px 16px}@media print{.print{display:none}a{color:#000;text-decoration:none}}
  </style></head><body><button class="print" onclick="window.print()">Print / Save as PDF</button><section class="cover"><div><div class="brand">Licence<span>Guard</span></div><div class="subtitle">FIREARM LICENCE RENEWAL MANAGEMENT</div><div class="status"><div class="label">Application pack</div><h1>${escapeHtml(pack.applicationTypeLabel)}</h1><div class="score">${pack.readinessScore}%</div><div>${escapeHtml(pack.readinessState.replace(/_/g, ' '))}</div></div><div class="grid"><div class="field"><div class="label">Client</div><div class="value">${escapeHtml(pack.client.fullName)}</div></div><div class="field"><div class="label">ID number</div><div class="value">${escapeHtml(pack.client.idNumber)}</div></div><div class="field"><div class="label">Subject</div><div class="value">${escapeHtml(pack.subject.description)}</div></div><div class="field"><div class="label">Licence section</div><div class="value">${escapeHtml(pack.subject.licenceSection ?? 'Not applicable')}</div></div><div class="field"><div class="label">Dealer / facilitator</div><div class="value">${escapeHtml(dealerName)}</div></div><div class="field"><div class="label">Generated</div><div class="value">${escapeHtml(new Date(pack.generatedAt).toLocaleString('en-ZA'))}</div></div></div>${missing}${warnings}</div><div class="footer">Generated by LicenceGuard. Secure document links expire after one hour.</div></section><section class="page-break"><h2>Client and application particulars</h2><div class="grid"><div class="field"><div class="label">Contact number</div><div class="value">${escapeHtml(pack.client.cellphone ?? 'Not recorded')}</div></div><div class="field"><div class="label">Email</div><div class="value">${escapeHtml(pack.client.email ?? 'Not recorded')}</div></div><div class="field"><div class="label">Address</div><div class="value">${escapeHtml(pack.client.address || 'Not recorded')}</div></div><div class="field"><div class="label">Firearm</div><div class="value">${escapeHtml(pack.subject.firearmDescription ?? 'Not applicable')}</div></div><div class="field"><div class="label">Licence number</div><div class="value">${escapeHtml(pack.subject.licenceNumber ?? 'Not recorded')}</div></div><div class="field"><div class="label">Licence validity</div><div class="value">${formatDate(pack.subject.licenceIssueDate)} - ${formatDate(pack.subject.licenceExpiryDate)}</div></div></div><h2>Readiness checklist</h2><table><thead><tr><th>Requirement</th><th>Status</th><th>Notes</th></tr></thead><tbody>${requirementRows}</tbody></table><h2>Application pack index</h2><table><thead><tr><th>No.</th><th>Requirement</th><th>Document</th><th>Verification</th><th>Secure link</th></tr></thead><tbody>${documentRows || '<tr><td colspan="5">No pack documents are currently available.</td></tr>'}</tbody></table><div class="footer">Review the checklist and every document before submission. LicenceGuard does not replace legal or SAPS verification.</div></section></body></html>`;
}

export function openApplicationPackHtml(html: string): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('Application pack printing is currently available in the LicenceGuard web application.');
  }
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const opened = window.open(url, '_blank', 'noopener,noreferrer');
  if (!opened) {
    URL.revokeObjectURL(url);
    throw new Error('The browser blocked the application pack window. Allow pop-ups for LicenceGuard and try again.');
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
