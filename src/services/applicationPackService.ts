import { supabase } from '../lib/supabase';
import { assertApplicationTypeSupportedInBeta } from '../utils/unsupportedApplicationTypePolicy';
import { assertRequiredDigitalDocumentMerged } from '../utils/applicationPackPolicy';
import { getClientApplicationReadiness } from './applicationReadinessService';
import { getApplicationCase } from './applicationCaseService';
import { getClient } from './clientService';
import {
  createDocumentSignedUrl,
  documentReferencesApplicationCase,
  listClientDocuments,
} from './documentService';
import { renderDocxAsPdf } from '../engines/docxPdfRenderer';
import type { PDFDocument as PDFDocumentType, PDFPage, PDFFont } from 'pdf-lib';
import {
  getApplicationCaseTypeLabel,
  type ApplicationCaseStatus,
} from '../types/applicationCase';
import type {
  ApplicationCaseReadiness,
  ReadinessRequirement,
  RequirementState,
} from '../types/applicationReadiness';
import type { DocumentRecord } from '../types/document';
import type {
  ApplicationPackItem,
  ApplicationPackItemState,
  ApplicationPackManifest,
  PrepareApplicationPackResult,
  ApplicationPackGenerationResult,
} from '../types/applicationPack';
import { PHYSICAL_PASSPORT_PHOTO_REMINDER } from '../constants/submission';

const db = supabase as any;

function documentMatchesCase(
  document: DocumentRecord,
  requirement: ReadinessRequirement,
  applicationCaseId: string,
  competencyId: string | null,
  firearmId: string | null,
  firearmLicenceId: string | null
): boolean {
  if (requirement.evidenceKind && document.metadata?.evidenceKind !== requirement.evidenceKind) {
    return false;
  }

  if (requirement.requiresFirearmMatch) {
    return Boolean(firearmId && document.firearm_id === firearmId)
      && (!document.application_case_id || documentReferencesApplicationCase(document, applicationCaseId));
  }

  if (documentReferencesApplicationCase(document, applicationCaseId)) {
    return true;
  }

  if (
    document.application_case_id &&
    document.application_case_id !== applicationCaseId
  ) {
    return false;
  }

  if (
    document.competency_id &&
    competencyId &&
    document.competency_id !== competencyId
  ) {
    return false;
  }

  if (
    document.firearm_id &&
    firearmId &&
    document.firearm_id !== firearmId
  ) {
    return false;
  }

  if (
    document.firearm_licence_id &&
    firearmLicenceId &&
    document.firearm_licence_id !== firearmLicenceId
  ) {
    return false;
  }

  return true;
}

function findRequirementDocument(
  requirement: ReadinessRequirement,
  documents: DocumentRecord[],
  applicationCaseId: string,
  competencyId: string | null,
  firearmId: string | null,
  firearmLicenceId: string | null
): DocumentRecord | null {
  if (!requirement.documentType) {
    return null;
  }

  const candidates = documents
    .filter(
      (document) =>
        (requirement.acceptableDocumentTypes ?? [requirement.documentType]).includes(document.document_type) &&
        document.lifecycle_status === 'ACTIVE' &&
        (requirement.documentId ? document.id === requirement.documentId : documentMatchesCase(
          document,
          requirement,
          applicationCaseId,
          competencyId,
          firearmId,
          firearmLicenceId
        ))
    )
    .sort((left, right) => {
      if (left.is_verified !== right.is_verified) {
        return left.is_verified ? -1 : 1;
      }

      return (
        new Date(right.created_at).getTime() -
        new Date(left.created_at).getTime()
      );
    });

  return candidates[0] ?? null;
}

function mapRequirementState(
  state: RequirementState
): ApplicationPackItemState {
  switch (state) {
    case 'SATISFIED':
      return 'COMPLETE';
    case 'EXPIRED':
      return 'EXPIRED';
    case 'UNVERIFIED':
      return 'UNVERIFIED';
    case 'PENDING_GENERATION':
      return 'MISSING';
    case 'MANUAL_REQUIRED':
      return 'MANUAL_REQUIRED';
    case 'PHYSICAL_REQUIRED':
      return 'PHYSICAL_REQUIRED';
    default:
      return 'MISSING';
  }
}

function getPackState(
  readiness: ApplicationCaseReadiness
): ApplicationPackManifest['packState'] {
  if (readiness.state === 'READY') {
    return 'READY';
  }

  if (readiness.state === 'ACTION_REQUIRED') {
    return 'ACTION_REQUIRED';
  }

  return 'BLOCKED';
}

function buildBlockingReasons(
  items: ApplicationPackItem[]
): string[] {
  return items
    .filter(
      (item) =>
        item.required && item.delivery === 'DIGITAL' &&
        (item.state === 'MISSING' ||
          item.state === 'EXPIRED' ||
          item.state === 'UNVERIFIED')
    )
    .map((item) => {
      if (item.state === 'EXPIRED') {
        return `${item.label} has expired.`;
      }

      if (item.state === 'UNVERIFIED') {
        return `${item.label} still requires verification.`;
      }

      return `${item.label} is missing.`;
    });
}

function packItemStateLabel(state: ApplicationPackItemState): string {
  if (state === 'COMPLETE') return 'DIGITALLY INCLUDED';
  if (state === 'MANUAL_REQUIRED') return 'TO PRINT / ADD MANUALLY';
  if (state === 'PHYSICAL_REQUIRED') return 'PHYSICAL SUBMISSION ITEM';
  return state;
}

export async function buildApplicationPackManifest(
  clientId: string,
  applicationCaseId: string
): Promise<ApplicationPackManifest> {
  const [
    client,
    applicationCase,
    readinessResult,
    documents,
  ] = await Promise.all([
    getClient(clientId),
    getApplicationCase(applicationCaseId),
    getClientApplicationReadiness(clientId),
    listClientDocuments(clientId, false),
  ]);

  const readiness = readinessResult.cases.find(
    (item) => item.caseId === applicationCaseId
  );

  if (!readiness) {
    throw new Error(
      'The selected application case is closed or could not be found in the readiness engine.'
    );
  }

  assertApplicationTypeSupportedInBeta(applicationCase.application_type);

  const items: ApplicationPackItem[] =
    readiness.requirements
      .filter((requirement) => requirement.documentType !== 'PASSPORT_PHOTO')
      .map(
      (requirement, index) => ({
        key: requirement.key,
        order: index + 1,
        label: requirement.label,
        detail: requirement.detail,
        required: requirement.required,
        delivery: requirement.delivery,
        state: mapRequirementState(
          requirement.state
        ),
        documentType: requirement.documentType,
        document: findRequirementDocument(
          requirement,
          documents,
          applicationCaseId,
          applicationCase.competency_id,
          applicationCase.firearm_id,
          applicationCase.firearm_licence_id
        ),
      })
    );

  const blockingReasons =
    buildBlockingReasons(items);

  return {
    generatedAt: new Date().toISOString(),
    clientId,
    clientName: `${client.first_name} ${client.surname}`,
    clientIdNumber: client.id_number,
    applicationCaseId,
    applicationType:
      applicationCase.application_type,
    applicationTypeLabel:
      getApplicationCaseTypeLabel(
        applicationCase.application_type
      ),
    caseStatus: applicationCase.status,
    subject: applicationCase.subjectDescription,
    licenceSection:
      applicationCase.licence_section,
    packState: getPackState(readiness),
    readinessScore: readiness.score,
    totalItems: items.length,
    completeItems: items.filter(
      (item) => item.state === 'COMPLETE'
    ).length,
    missingItems: items.filter(
      (item) =>
        item.state === 'MISSING' ||
        item.state === 'EXPIRED'
    ).length,
    warningItems: items.filter(
      (item) => item.state === 'UNVERIFIED'
    ).length,
    blockingReasons,
    items,
  };
}

export async function prepareApplicationPack(
  dealerId: string,
  userId: string,
  clientId: string,
  applicationCaseId: string
): Promise<PrepareApplicationPackResult> {
  const manifest =
    await buildApplicationPackManifest(
      clientId,
      applicationCaseId
    );

  const nextStatus: ApplicationCaseStatus =
    manifest.packState === 'READY'
      ? 'READY_FOR_SUBMISSION'
      : 'PACK_IN_PREPARATION';

  const progressPercent =
    nextStatus === 'READY_FOR_SUBMISSION'
      ? 80
      : 65;

  const { error } = await db
    .from('application_cases')
    .update({
      status: nextStatus,
      progress_percent: progressPercent,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', applicationCaseId)
    .eq('client_id', clientId)
    .eq('dealer_id', dealerId);

  if (error) {
    throw new Error(error.message);
  }

  return {
    manifest: {
      ...manifest,
      caseStatus: nextStatus,
    },
    nextStatus,
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

function manifestHtml(
  manifest: ApplicationPackManifest
): string {
  const rows = manifest.items
    .map(
      (item) => `
        <tr>
          <td>${item.order}</td>
          <td>
            <strong>${escapeHtml(item.label)}</strong>
            <div class="detail">${escapeHtml(item.detail)}</div>
          </td>
          <td>${item.required ? 'Required' : 'Recommended'}</td>
          <td>${escapeHtml(packItemStateLabel(item.state))}</td>
          <td>${escapeHtml(item.document?.document_name ?? '—')}</td>
          <td>${item.document?.is_verified ? 'Verified' : item.document ? 'Not verified' : '—'}</td>
        </tr>`
    )
    .join('');

  const blockers = manifest.blockingReasons.length
    ? `<ul>${manifest.blockingReasons
        .map(
          (reason) =>
            `<li>${escapeHtml(reason)}</li>`
        )
        .join('')}</ul>`
    : '<p>None. All blocking requirements are complete.</p>';

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>LicenceGuard Application Pack Manifest</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 32px; color: #111; }
    h1 { margin-bottom: 4px; }
    h2 { margin-top: 28px; }
    .muted { color: #555; }
    .summary { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px 24px; margin: 24px 0; }
    .summary div { border-bottom: 1px solid #ddd; padding: 8px 0; }
    .state { font-weight: 700; }
    table { border-collapse: collapse; width: 100%; margin-top: 16px; }
    th, td { border: 1px solid #ccc; padding: 9px; vertical-align: top; text-align: left; }
    th { background: #eee; }
    .detail { color: #555; font-size: 12px; margin-top: 4px; }
    .footer { margin-top: 32px; color: #666; font-size: 12px; }
    @media print { body { margin: 15mm; } }
  </style>
</head>
<body>
  <h1>LicenceGuard Application Pack Manifest</h1>
  <div class="muted">Generated ${escapeHtml(
    new Date(manifest.generatedAt).toLocaleString('en-ZA')
  )}</div>

  <div class="summary">
    <div><strong>Applicant:</strong> ${escapeHtml(manifest.clientName)}</div>
    <div><strong>ID number:</strong> ${escapeHtml(manifest.clientIdNumber)}</div>
    <div><strong>Application:</strong> ${escapeHtml(manifest.applicationTypeLabel)}</div>
    <div><strong>Subject:</strong> ${escapeHtml(manifest.subject)}</div>
    <div><strong>Licence section:</strong> ${escapeHtml(manifest.licenceSection ? `Section ${manifest.licenceSection}` : 'Not applicable')}</div>
    <div><strong>Pack state:</strong> <span class="state">${escapeHtml(manifest.packState)}</span></div>
    <div><strong>Readiness:</strong> ${manifest.readinessScore}%</div>
    <div><strong>Case status:</strong> ${escapeHtml(manifest.caseStatus)}</div>
  </div>

  <h2>Blocking reasons</h2>
  ${blockers}

  <h2>Physical submission reminder</h2>
  <p>${escapeHtml(PHYSICAL_PASSPORT_PHOTO_REMINDER)}</p>

  <h2>Submission order</h2>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Pack item</th>
        <th>Requirement</th>
        <th>State</th>
        <th>Selected document</th>
        <th>Verification</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="footer">
    LicenceGuard • Firearm Licence Renewal Management
  </div>
</body>
</html>`;
}

export function printApplicationPackManifest(
  manifest: ApplicationPackManifest
): void {
  if (
    typeof window === 'undefined' ||
    typeof document === 'undefined'
  ) {
    throw new Error(
      'Printing the pack manifest is currently available on LicenceGuard Web.'
    );
  }

  const printWindow = window.open('', '_blank');

  if (!printWindow) {
    throw new Error(
      'The browser blocked the print window. Allow pop-ups for LicenceGuard and try again.'
    );
  }

  printWindow.document.open();
  printWindow.document.write(
    manifestHtml(manifest)
  );
  printWindow.document.close();
  printWindow.focus();

  window.setTimeout(() => {
    printWindow.print();
  }, 250);
}

const DOCUMENT_BUCKET = 'licenceguard-documents';
const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;

function wrapText(text: string, maxLength = 88): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if (word.length > maxLength) {
      if (line) {
        lines.push(line);
        line = '';
      }
      for (let offset = 0; offset < word.length; offset += maxLength) {
        lines.push(word.slice(offset, offset + maxLength));
      }
      continue;
    }
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length > maxLength && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

function asciiPdfText(value: unknown): string {
  return String(value ?? '').normalize('NFKD').replace(/[^\x20-\x7E]/g, '?');
}

async function addResearchProvenancePages(
  target: PDFDocumentType,
  manifest: ApplicationPackManifest,
  pdfLib: typeof import('pdf-lib')
): Promise<void> {
  const { StandardFonts } = pdfLib;
  const researchItems = manifest.items.filter((item) =>
    item.document?.document_type === 'SUPPORTING_RESEARCH'
  );
  if (researchItems.length === 0) return;

  for (const item of researchItems) {
    const metadata = item.document?.metadata ?? {};
    const source = (metadata.researchSource ?? {}) as Record<string, unknown>;
    const context = (metadata.researchContext ?? {}) as Record<string, unknown>;
    const firearm = (context.firearm ?? {}) as Record<string, unknown>;
    const page = target.addPage([A4_WIDTH, A4_HEIGHT]);
    const regularFont = await target.embedFont(StandardFonts.Helvetica);
    const boldFont = await target.embedFont(StandardFonts.HelveticaBold);
    page.drawText('RESEARCH SOURCE PROVENANCE', { x: 44, y: 790, size: 16, font: boldFont });
    let y = 758;
    const rows: Array<[string, unknown]> = [
      ['Application document', item.document?.document_name],
      ['Source title', source.title ?? metadata.sourceTitle],
      ['Publisher / authority', source.publisher ?? metadata.sourcePublisher],
      ['Source URL or archive path', source.url ?? metadata.sourceUrl],
      ['Source retrieval date', source.retrievalDate],
      ['Review status', source.trustLevel ?? 'UNREVIEWED'],
      ['Sport discipline', context.discipline ?? source.discipline],
      ['Sport association', context.association ?? source.association],
      ['Firearm / calibre context', [firearm.make, firearm.model, firearm.calibre].filter(Boolean).join(' ')],
      ['Context captured', context.accessedAt ?? context.generatedAt],
    ];

    for (const [label, rawValue] of rows) {
      const value = asciiPdfText(rawValue || 'Not recorded');
      page.drawText(`${label}:`, { x: 44, y, size: 9, font: boldFont });
      y -= 14;
      for (const line of wrapText(value, 88)) {
        page.drawText(line, { x: 56, y, size: 9, font: regularFont, maxWidth: 500 });
        y -= 12;
      }
      y -= 5;
    }
    page.drawText('Local archive material is not live-verified research. Confirm source claims and applicant relevance before submission.', {
      x: 44, y: Math.max(y - 8, 48), size: 8, font: regularFont, maxWidth: 505,
    });
  }
}

async function addCoverAndChecklist(
  target: PDFDocumentType,
  manifest: ApplicationPackManifest,
  pdfLib: typeof import('pdf-lib')
): Promise<void> {
  const { StandardFonts, rgb } = pdfLib;
  const regular = await target.embedFont(StandardFonts.Helvetica);
  const bold = await target.embedFont(StandardFonts.HelveticaBold);
  const page = target.addPage([A4_WIDTH, A4_HEIGHT]);
  try {
    const logoResponse = await fetch('/branding/licenceguard-logo-primary.png');
    if (!logoResponse.ok) throw new Error(`Logo request failed (${logoResponse.status}).`);
    const logo = await target.embedPng(await logoResponse.arrayBuffer());
    const logoHeight = 92;
    const logoWidth = logo.width * (logoHeight / logo.height);
    page.drawImage(logo, { x: A4_WIDTH - 44 - logoWidth, y: 704, width: logoWidth, height: logoHeight });
  } catch {
    page.drawText('LicenceGuard', { x: 44, y: 780, size: 24, font: bold, color: rgb(0.55, 0, 0.04) });
  }
  page.drawText('APPLICATION PACK', { x: 44, y: 746, size: 18, font: bold });
  page.drawText(manifest.applicationTypeLabel, { x: 44, y: 718, size: 13, font: bold });
  const coverRows = [
    ['Applicant', manifest.clientName],
    ['ID number', manifest.clientIdNumber],
    ['Subject', manifest.subject],
    ['Licence section', manifest.licenceSection ? `Section ${manifest.licenceSection}` : 'Not applicable'],
    ['Application case', manifest.applicationCaseId],
    ['Generated', new Date().toLocaleString('en-ZA')],
    ['Readiness', `${manifest.readinessScore}% — ${manifest.packState}`],
  ];
  let y = 672;
  for (const [label, value] of coverRows) {
    page.drawText(`${label}:`, { x: 44, y, size: 10, font: bold });
    for (const line of wrapText(value, 72)) {
      page.drawText(line, { x: 150, y, size: 10, font: regular });
      y -= 14;
    }
    y -= 5;
  }
  page.drawText('This pack was assembled from generated and uploaded records stored in LicenceGuard.', {
    x: 44, y: 82, size: 9, font: regular, color: rgb(0.3, 0.3, 0.3), maxWidth: 505,
  });

  const checklist = target.addPage([A4_WIDTH, A4_HEIGHT]);
  checklist.drawText('APPLICATION PACK CHECKLIST', { x: 44, y: 790, size: 17, font: bold });
  checklist.drawText(`${manifest.clientName} — ${manifest.subject}`, { x: 44, y: 766, size: 10, font: regular });
  checklist.drawText(PHYSICAL_PASSPORT_PHOTO_REMINDER, {
    x: 44, y: 738, size: 9, font: bold, maxWidth: 505,
  });
  let cy = 700;
  manifest.items.forEach((item) => {
    if (cy < 74) {
      cy = 790;
      const continuation = target.addPage([A4_WIDTH, A4_HEIGHT]);
      continuation.drawText('APPLICATION PACK CHECKLIST — CONTINUED', { x: 44, y: 812, size: 14, font: bold });
      drawChecklistItem(continuation, item, cy, regular, bold, rgb);
      cy -= 42;
    } else {
      drawChecklistItem(checklist, item, cy, regular, bold, rgb);
      cy -= 42;
    }
  });
}

function drawChecklistItem(
  page: PDFPage,
  item: ApplicationPackItem,
  y: number,
  regular: PDFFont,
  bold: PDFFont,
  rgb: (red: number, green: number, blue: number) => any
): void {
  const state = packItemStateLabel(item.state);
  page.drawRectangle({ x: 44, y: y - 2, width: 12, height: 12, borderWidth: 1, borderColor: rgb(0.25, 0.25, 0.25) });
  if (item.state === 'COMPLETE') page.drawText('X', { x: 46, y, size: 9, font: bold });
  page.drawText(`${item.order}. ${item.label}`, { x: 68, y: y + 1, size: 10, font: bold, maxWidth: 420 });
  page.drawText(`${item.required ? 'Required' : 'Recommended'} • ${state}`, { x: 68, y: y - 13, size: 8, font: regular, color: rgb(0.35, 0.35, 0.35) });
  if (item.document) page.drawText(item.document.document_name, { x: 68, y: y - 25, size: 8, font: regular, maxWidth: 470 });
}

async function appendStoredDocument(
  target: PDFDocumentType,
  document: DocumentRecord,
  pdfLib: typeof import('pdf-lib')
): Promise<{ included: boolean; reason?: string }> {
  const { PDFDocument } = pdfLib;
  const mime = (document.mime_type ?? '').toLowerCase();
  const url = await createDocumentSignedUrl(document.storage_path);
  const response = await fetch(url);
  if (!response.ok) return { included: false, reason: `Download failed (${response.status}).` };
  const bytes = new Uint8Array(await response.arrayBuffer());

  try {
    if (mime.includes('pdf') || document.file_name.toLowerCase().endsWith('.pdf')) {
      const source = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const pages = await target.copyPages(source, source.getPageIndices());
      pages.forEach((page) => target.addPage(page));
      return { included: true };
    }
    if (mime.includes('png') || document.file_name.toLowerCase().endsWith('.png')) {
      const image = await target.embedPng(bytes);
      const scale = Math.min((A4_WIDTH - 60) / image.width, (A4_HEIGHT - 60) / image.height, 1);
      const page = target.addPage([A4_WIDTH, A4_HEIGHT]);
      page.drawImage(image, { x: (A4_WIDTH - image.width * scale) / 2, y: (A4_HEIGHT - image.height * scale) / 2, width: image.width * scale, height: image.height * scale });
      return { included: true };
    }
    if (mime.includes('jpeg') || mime.includes('jpg') || /\.(jpe?g)$/i.test(document.file_name)) {
      const image = await target.embedJpg(bytes);
      const scale = Math.min((A4_WIDTH - 60) / image.width, (A4_HEIGHT - 60) / image.height, 1);
      const page = target.addPage([A4_WIDTH, A4_HEIGHT]);
      page.drawImage(image, { x: (A4_WIDTH - image.width * scale) / 2, y: (A4_HEIGHT - image.height * scale) / 2, width: image.width * scale, height: image.height * scale });
      return { included: true };
    }
    return { included: false, reason: 'Only PDF, JPG and PNG files can be merged into the printable PDF pack.' };
  } catch (error) {
    return { included: false, reason: error instanceof Error ? error.message : 'The document could not be merged.' };
  }
}

function isDocxDocument(document: DocumentRecord): boolean {
  const mime = (document.mime_type ?? '').toLowerCase();
  return mime.includes('officedocument.wordprocessingml.document')
    || document.file_name.toLowerCase().endsWith('.docx');
}

async function findExistingPdfWorkingCopy(source: DocumentRecord): Promise<DocumentRecord | null> {
  const result = await db
    .from('documents')
    .select('*')
    .eq('parent_document_id', source.id)
    .eq('application_case_id', source.application_case_id)
    .eq('document_type', source.document_type)
    .eq('lifecycle_status', 'ACTIVE')
    .eq('is_generated', true)
    .eq('mime_type', 'application/pdf')
    .order('created_at', { ascending: false })
    .limit(1);
  if (result.error) throw new Error(result.error.message);
  return (result.data?.[0] as DocumentRecord | undefined) ?? null;
}

async function createDocxPdfWorkingCopy(
  source: DocumentRecord,
  dealerId: string,
  userId: string,
  clientId: string,
  applicationCaseId: string
): Promise<DocumentRecord> {
  const existing = await findExistingPdfWorkingCopy(source);
  if (existing) return existing;

  const sourceUrl = await createDocumentSignedUrl(source.storage_path);
  const sourceResponse = await fetch(sourceUrl);
  if (!sourceResponse.ok) {
    throw new Error(`The selected application DOCX could not be downloaded (${sourceResponse.status}).`);
  }

  let pdfBytes: Uint8Array;
  try {
    pdfBytes = await renderDocxAsPdf(new Uint8Array(await sourceResponse.arrayBuffer()));
  } catch (error) {
    throw new Error(
      `The selected application document could not be converted to PDF. ${
        error instanceof Error ? error.message : 'The browser DOCX renderer failed.'
      }`
    );
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const baseName = (source.original_file_name ?? source.file_name)
    .replace(/\.docx$/i, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 90) || 'application-document';
  const fileName = `${baseName}_${timestamp}.pdf`;
  const storagePath = `${dealerId}/${clientId}/${source.document_type}/GENERATED_PDF/${fileName}`;
  const blob = new Blob([pdfBytes as BlobPart], { type: 'application/pdf' });
  const upload = await db.storage
    .from(DOCUMENT_BUCKET)
    .upload(storagePath, blob, { contentType: 'application/pdf', upsert: false });
  if (upload.error) throw new Error(upload.error.message);

  const inserted = await db
    .from('documents')
    .insert({
      dealer_id: dealerId,
      client_id: clientId,
      competency_id: source.competency_id,
      firearm_id: source.firearm_id,
      firearm_licence_id: source.firearm_licence_id,
      application_case_id: applicationCaseId,
      parent_document_id: source.id,
      document_type: 'MOTIVATION',
      document_scope: 'APPLICATION_CASE',
      lifecycle_status: 'ACTIVE',
      document_name: `${source.document_name} — PDF working copy`,
      document_date: source.document_date,
      expiry_date: source.expiry_date,
      issued_by: source.issued_by,
      reference_number: source.reference_number,
      version_number: source.version_number + 1,
      storage_path: storagePath,
      file_name: fileName,
      original_file_name: fileName,
      mime_type: 'application/pdf',
      file_size_bytes: blob.size,
      is_verified: source.is_verified,
      is_generated: true,
      generated_from_template_id: source.generated_from_template_id,
      notes: 'Browser-rendered PDF working copy. The original DOCX remains unchanged and linked as the parent document. Source research metadata is retained.',
      metadata: {
        ...source.metadata,
        sourceDocumentId: source.id,
        sourceFileName: source.original_file_name ?? source.file_name,
        renderer: 'DOCX_PREVIEW_HTML2CANVAS_PDF_V1',
      },
      uploaded_by: userId,
    })
    .select('*')
    .single();

  if (inserted.error) {
    await db.storage.from(DOCUMENT_BUCKET).remove([storagePath]);
    throw new Error(inserted.error.message);
  }
  return inserted.data as DocumentRecord;
}

export async function generateAndArchiveApplicationPack(input: {
  dealerId: string;
  userId: string;
  clientId: string;
  applicationCaseId: string;
}): Promise<ApplicationPackGenerationResult> {
  if (!input.userId?.trim()) throw new Error('Sign in before saving an application pack.');
  const manifest = await buildApplicationPackManifest(input.clientId, input.applicationCaseId);
  if (manifest.packState !== 'READY') {
    throw new Error(`The final application pack cannot be generated yet. ${manifest.blockingReasons.join(' ') || 'Resolve verification warnings first.'}`);
  }

  // Match the official renderer: Metro's ES entry hits tslib 1.x default interop.
  const pdfLib = await import('pdf-lib/cjs/index.js');
  const pdf = await pdfLib.PDFDocument.create();
  await addCoverAndChecklist(pdf, manifest, pdfLib);
  await addResearchProvenancePages(pdf, manifest, pdfLib);
  const includedDocumentIds: string[] = [];
  const skippedDocuments: Array<{ documentId: string; name: string; reason: string }> = [];

  for (const item of manifest.items.sort((a, b) => a.order - b.order)) {
    if (item.delivery !== 'DIGITAL' || !item.document) continue;
    const packDocument = ['MOTIVATION', 'SUPPORTING_RESEARCH'].includes(item.document.document_type) && isDocxDocument(item.document)
      ? await createDocxPdfWorkingCopy(
          item.document,
          input.dealerId,
          input.userId,
          input.clientId,
          input.applicationCaseId
        )
      : item.document;
    const result = await appendStoredDocument(pdf, packDocument, pdfLib);
    if (result.included) {
      includedDocumentIds.push(packDocument.id);
    } else {
      assertRequiredDigitalDocumentMerged({ required: item.required, label: item.label, documentName: packDocument.document_name, reason: result.reason });
      skippedDocuments.push({
        documentId: packDocument.id,
        name: packDocument.document_name,
        reason: result.reason ?? 'Unknown merge error.',
      });
    }
  }

  const bytes = await pdf.save();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safeSubject = manifest.subject.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/_+/g, '_').slice(0, 70) || 'application';
  const fileName = `APPLICATION_PACK_${safeSubject}_${timestamp}.pdf`;
  const storagePath = `${input.dealerId}/${input.clientId}/GENERATED_APPLICATION_PACKS/${fileName}`;
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });

  const upload = await db.storage.from(DOCUMENT_BUCKET).upload(storagePath, blob, { contentType: 'application/pdf', upsert: false });
  if (upload.error) throw new Error(upload.error.message);

  const inserted = await db.from('documents').insert({
    owner_user_id: input.userId,
    record_scope: 'PRIVATE',
    dealer_id: input.dealerId,
    client_id: input.clientId,
    competency_id: null,
    firearm_id: null,
    firearm_licence_id: null,
    application_case_id: input.applicationCaseId,
    parent_document_id: null,
    document_type: 'SUPPORTING_DOCUMENT',
    document_scope: 'APPLICATION_CASE',
    lifecycle_status: 'ACTIVE',
    document_name: `${manifest.applicationTypeLabel} — complete application pack`,
    document_date: new Date().toISOString().slice(0, 10),
    expiry_date: null,
    issued_by: 'LicenceGuard Application Pack Engine',
    reference_number: null,
    version_number: 1,
    storage_path: storagePath,
    file_name: fileName,
    original_file_name: fileName,
    mime_type: 'application/pdf',
    file_size_bytes: blob.size,
    is_verified: true,
    is_generated: true,
    generated_from_template_id: null,
    notes: skippedDocuments.length ? `Final pack generated. ${skippedDocuments.length} incompatible document(s) were not merged; see metadata.` : 'Final ordered printable application pack generated by LicenceGuard.',
    metadata: {
      category: 'APPLICATION_PACK',
      packState: manifest.packState,
      readinessScore: manifest.readinessScore,
      manifest,
      includedDocumentIds,
      skippedDocuments,
      renderer: 'LICENCEGUARD_APPLICATION_PACK_V1',
    },
    uploaded_by: input.userId,
  });

  if (inserted.error) {
    await db.storage.from(DOCUMENT_BUCKET).remove([storagePath]);
    throw new Error(inserted.error.message);
  }

  // As with generated SAPS forms, INSERT RETURNING cannot use the deployed
  // STABLE SELECT-policy helper to look up this statement's newly inserted row.
  const saved = await db.from('documents').select('*')
    .eq('storage_path', storagePath)
    .eq('dealer_id', input.dealerId)
    .eq('client_id', input.clientId)
    .eq('application_case_id', input.applicationCaseId)
    .eq('owner_user_id', input.userId)
    .eq('record_scope', 'PRIVATE')
    .single();
  if (saved.error || !saved.data) {
    // Registration has committed; retain its PDF on a read-back failure.
    throw new Error(`The application pack was saved, but could not be read back. Reload the application before compiling again. ${saved.error?.message ?? 'No authorized document returned.'}`);
  }

  const statusUpdate = await db.from('application_cases').update({
    status: 'READY_FOR_SUBMISSION',
    progress_percent: 90,
    updated_by: input.userId,
    updated_at: new Date().toISOString(),
  }).eq('id', input.applicationCaseId).eq('client_id', input.clientId).eq('dealer_id', input.dealerId);
  if (statusUpdate.error) throw new Error(statusUpdate.error.message);

  return {
    document: saved.data as DocumentRecord,
    manifest: { ...manifest, caseStatus: 'READY_FOR_SUBMISSION' },
    includedDocumentIds,
    skippedDocuments,
    fileName,
    bytes,
  };
}

export function downloadGeneratedApplicationPack(bytes: Uint8Array, fileName: string): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('Downloading the application pack is currently available on LicenceGuard Web.');
  }
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
