import { supabase } from '../lib/supabase';
import { getClientApplicationReadiness } from './applicationReadinessService';
import { getApplicationCase } from './applicationCaseService';
import { getClient } from './clientService';
import { listClientDocuments } from './documentService';
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
} from '../types/applicationPack';

const db = supabase as any;

function documentMatchesCase(
  document: DocumentRecord,
  applicationCaseId: string,
  competencyId: string | null,
  firearmId: string | null,
  firearmLicenceId: string | null
): boolean {
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
        document.document_type ===
          requirement.documentType &&
        document.lifecycle_status === 'ACTIVE' &&
        documentMatchesCase(
          document,
          applicationCaseId,
          competencyId,
          firearmId,
          firearmLicenceId
        )
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
        item.required &&
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

  const items: ApplicationPackItem[] =
    readiness.requirements.map(
      (requirement, index) => ({
        key: requirement.key,
        order: index + 1,
        label: requirement.label,
        detail: requirement.detail,
        required: requirement.required,
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
          <td>${escapeHtml(item.state)}</td>
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