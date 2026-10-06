import { supabase } from '../lib/supabase';
import { assertSupportedSafeEvidenceFormat } from '../utils/documentFormatPolicy';
import { currentGenerated271, isGenerated271, saps271GeneratedState, saps271SourceSnapshot } from '../utils/saps271GeneratedState';
import { buildApplicationAutofillPackage } from './applicationAutofillService';
import { createReviewValues } from './generatedApplicationDocumentService';

import type {
  ClientDocumentSummary,
  DocumentRecord,
  DocumentTemplateRecord,
  DocumentType,
} from '../types/document';

const DOCUMENT_BUCKET = 'licenceguard-documents';
const TEMPLATE_BUCKET = 'licenceguard-templates';
const SIGNED_URL_DURATION_SECONDS = 600;
const DAY_IN_MILLISECONDS = 86_400_000;

const db = supabase as any;

export type DocumentUploadFile = {
  uri: string;
  name: string;
  mimeType: string | null;
  size: number | null;
  webFile?: Blob | null;
};

type ReusableRequirement = {
  documentType: DocumentType | null;
  evidenceKind?: 'SAFE_PHOTO' | 'SAFE_SECURING_PHOTO';
  requiresFirearmMatch?: boolean;
  delivery?: 'DIGITAL' | 'MANUAL_PACK' | 'PHYSICAL_SUBMISSION';
};

type SupabaseOperationResult<T> = {
  data: T;
  error: { message: string } | null;
};

const GENERATED_APPLICATION_FORM_TYPES = new Set<DocumentType>([
  'COMPETENCY_APPLICATION',
  'COMPETENCY_RENEWAL_FORM',
  'FIREARM_LICENCE_APPLICATION_FORM',
  'FIREARM_LICENCE_RENEWAL_FORM',
]);
const CROSS_CASE_CLIENT_DOCUMENT_TYPES = new Set<DocumentType>([
  'ID_COPY',
  'MEMBERSHIP_CERTIFICATE',
  'DEDICATED_STATUS',
]);

function metadataCaseIds(metadata: Record<string, unknown>): string[] {
  const value = metadata.applicationCaseIds;
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

export function documentReferencesApplicationCase(
  document: DocumentRecord,
  applicationCaseId: string
): boolean {
  return document.application_case_id === applicationCaseId
    || metadataCaseIds(document.metadata ?? {}).includes(applicationCaseId);
}

/** Client-owned identity evidence remains reusable across application cases. */
export function isReusableClientIdentification(document: DocumentRecord): boolean {
  return document.document_type === 'ID_COPY'
    && document.lifecycle_status === 'ACTIVE'
    && (!document.expiry_date || calculateDaysUntil(document.expiry_date) >= 0);
}

export async function linkReusableClientDocumentsToApplicationCase(input: {
  applicationCaseId: string;
  userId: string;
  documents: DocumentRecord[];
  requirements: ReusableRequirement[];
}): Promise<number> {
  const now = new Date().toISOString().slice(0, 10);
  const reusable = input.requirements
    .filter((requirement) =>
      requirement.delivery !== 'MANUAL_PACK'
      && !requirement.requiresFirearmMatch
      && Boolean(requirement.documentType)
      && !GENERATED_APPLICATION_FORM_TYPES.has(requirement.documentType as DocumentType)
    )
    .map((requirement) =>
      input.documents
        .filter((document) =>
          document.document_type === requirement.documentType
          && (!requirement.evidenceKind || document.metadata?.evidenceKind === requirement.evidenceKind)
          && document.lifecycle_status === 'ACTIVE'
          && (
            (document.document_scope === 'CLIENT' && !document.application_case_id)
            || CROSS_CASE_CLIENT_DOCUMENT_TYPES.has(document.document_type)
          )
          && (!document.expiry_date || document.expiry_date >= now)
          && !documentReferencesApplicationCase(document, input.applicationCaseId)
        )
        .sort((left, right) => {
          if (left.is_verified !== right.is_verified) return left.is_verified ? -1 : 1;
          return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
        })[0]
    )
    .filter((document): document is DocumentRecord => Boolean(document))
    .filter((document, index, documents) => documents.findIndex((item) => item.id === document.id) === index);

  for (const document of reusable) {
    const applicationCaseIds = [
      ...metadataCaseIds(document.metadata ?? {}),
      input.applicationCaseId,
    ];
    const result = await withTimeout<SupabaseOperationResult<unknown>>(
      db.from('documents').update({
          metadata: {
            ...(document.metadata ?? {}),
            applicationCaseIds,
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', document.id),
      30_000,
      `Linking the existing ${document.document_type} document to the application timed out.`
    );
    if (result.error) throw new Error(result.error.message);
  }

  return reusable.length;
}

async function withTimeout<T>(
  operation: PromiseLike<T>,
  timeoutMs: number,
  message: string
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(operation),
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export type UploadClientDocumentInput = {
  dealerId: string;
  clientId: string;
  userId: string;
  applicationCaseId?: string;
  firearmId?: string;
  documentScope?: import('../types/document').DocumentScope;
  metadata?: Record<string, unknown>;
  documentType: DocumentType;
  documentName: string;
  documentDate?: string;
  expiryDate?: string;
  issuedBy?: string;
  referenceNumber?: string;
  notes?: string;
  file: DocumentUploadFile;
};

function emptyToNull(
  value: string | undefined
): string | null {
  const cleaned = value?.trim() ?? '';
  return cleaned.length > 0 ? cleaned : null;
}

function sanitiseFileName(fileName: string): string {
  const cleaned = fileName
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/_+/g, '_');

  return cleaned || 'document';
}

function calculateDaysUntil(dateValue: string): number {
  const today = new Date();
  const target = new Date(`${dateValue}T00:00:00`);

  const todayUtc = Date.UTC(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  );

  const targetUtc = Date.UTC(
    target.getFullYear(),
    target.getMonth(),
    target.getDate()
  );

  return Math.ceil(
    (targetUtc - todayUtc) / DAY_IN_MILLISECONDS
  );
}

export async function listClientDocuments(
  clientId: string,
  includeArchived = false
): Promise<DocumentRecord[]> {
  let query = db
    .from('documents')
    .select('*')
    .eq('client_id', clientId);

  if (!includeArchived) {
    query = query.eq('lifecycle_status', 'ACTIVE');
  }

  const result = await withTimeout<SupabaseOperationResult<DocumentRecord[]>>(
    query.order('created_at', { ascending: false }),
    30_000,
    'Loading the client document library timed out.'
  );

  if (result.error) {
    throw new Error(result.error.message);
  }

  return (result.data ?? []) as DocumentRecord[];
}

export async function getDocument(
  documentId: string
): Promise<DocumentRecord> {
  const result = await db
    .from('documents')
    .select('*')
    .eq('id', documentId)
    .single();

  if (result.error) {
    throw new Error(result.error.message);
  }

  return result.data as DocumentRecord;
}

export async function listDocumentTemplates(): Promise<
  DocumentTemplateRecord[]
> {
  const result = await db
    .from('document_templates')
    .select('*')
    .eq('status', 'ACTIVE')
    .order('template_name', { ascending: true });

  if (result.error) {
    throw new Error(result.error.message);
  }

  return (result.data ?? []) as DocumentTemplateRecord[];
}

export async function uploadClientDocument(
  input: UploadClientDocumentInput
): Promise<DocumentRecord> {
  if (input.documentType === 'PASSPORT_PHOTO') {
    throw new Error(
      'Passport photographs are physical submission items and are not stored in LicenceGuard.'
    );
  }
  const evidenceKind = input.metadata?.evidenceKind;
  if (evidenceKind === 'SAFE_PHOTO' || evidenceKind === 'SAFE_SECURING_PHOTO') {
    assertSupportedSafeEvidenceFormat(input.file);
  }
  let stage = 'file-ready';
  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, '-');

  const storedFileName = `${timestamp}_${sanitiseFileName(
    input.file.name
  )}`;

  const storagePath = [
    input.dealerId,
    input.clientId,
    input.documentType,
    storedFileName,
  ].join('/');

  let fileBlob = input.file.webFile ?? null;
  if (!fileBlob) {
    stage = 'file-read-fallback';
    const controller = new AbortController();
    const readTimeout = setTimeout(() => controller.abort(), 30_000);
    try {
      const fileResponse = await fetch(input.file.uri, { signal: controller.signal });
      if (!fileResponse.ok) {
        throw new Error(`LicenceGuard could not read the selected document (${fileResponse.status}).`);
      }
      fileBlob = await fileResponse.blob();
    } catch (error) {
      throw new Error(
        `LicenceGuard could not read the selected document. ${
          error instanceof Error ? error.message : 'The browser file read failed.'
        }`
      );
    } finally {
      clearTimeout(readTimeout);
    }
  }

  try {
    stage = 'storage-start';
    const uploadResult = await withTimeout<SupabaseOperationResult<unknown>>(
      db.storage.from(DOCUMENT_BUCKET).upload(storagePath, fileBlob, {
        contentType: input.file.mimeType || fileBlob.type || 'application/octet-stream',
        upsert: false,
      }),
      60_000,
      'The document storage upload timed out. Check the connection and try again.'
    );
    if (uploadResult.error) throw uploadResult.error;

    const insertPayload = {
      dealer_id: input.dealerId,
      client_id: input.clientId,
      competency_id: null,
      firearm_id: input.firearmId ?? null,
      firearm_licence_id: null,
      application_case_id: input.applicationCaseId ?? null,
      parent_document_id: null,
      document_type: input.documentType,
      document_scope: input.documentScope ?? (input.applicationCaseId ? 'APPLICATION_CASE' : 'CLIENT'),
      lifecycle_status: 'ACTIVE',
      document_name: input.documentName.trim(),
      document_date: emptyToNull(input.documentDate),
      expiry_date: emptyToNull(input.expiryDate),
      issued_by: emptyToNull(input.issuedBy),
      reference_number: emptyToNull(
        input.referenceNumber
      ),
      version_number: 1,
      storage_path: storagePath,
      file_name: storedFileName,
      original_file_name: input.file.name,
      mime_type: input.file.mimeType,
      file_size_bytes: input.file.size,
      is_verified: false,
      is_generated: false,
      notes: emptyToNull(input.notes),
      metadata: input.metadata ?? {},
      uploaded_by: input.userId,
    };
    stage = 'insert-start';
    const insertResult = await withTimeout<SupabaseOperationResult<DocumentRecord>>(
      db.from('documents').insert(insertPayload).select('*').single(),
      30_000,
      'The document was uploaded, but saving its LicenceGuard record timed out.'
    );
    if (insertResult.error) throw insertResult.error;
    return insertResult.data;
  } catch (error) {
    if (stage === 'insert-start') {
      try {
        await withTimeout(
          db.storage.from(DOCUMENT_BUCKET).remove([storagePath]),
          10_000,
          'Storage cleanup timed out.'
        );
      } catch {
        // Preserve the original upload failure if cleanup also fails.
      }
    }
    const message = error instanceof Error
      ? error.message
      : typeof error === 'object' && error && 'message' in error
        ? String(error.message)
        : 'The document upload failed.';
    throw new Error(`${stage}: ${message}`);
  }
}

export async function archiveDocument(
  documentId: string,
  userId: string,
  reason: string
): Promise<void> {
  const cleanedReason = reason.trim();

  const result = await db
    .from('documents')
    .update({
      lifecycle_status: 'ARCHIVED',
      archived_at: new Date().toISOString(),
      archived_by: userId,
      archive_reason:
        cleanedReason ||
        'Archived from the LicenceGuard Document Library.',
      updated_at: new Date().toISOString(),
    })
    .eq('id', documentId);

  if (result.error) {
    throw new Error(result.error.message);
  }
}

export async function setDocumentVerified(
  documentId: string,
  verified: boolean,
  userId: string
): Promise<void> {
  if (verified) {
    const selected = await db.from('documents').select('*').eq('id',documentId).single();
    if (selected.error || !selected.data) throw new Error(selected.error?.message ?? 'Document is unavailable.');
    const document = selected.data as DocumentRecord;
    if (isGenerated271(document) && document.application_case_id) {
      const documents = await listClientDocuments(document.client_id);
      const current = currentGenerated271(documents,document.application_case_id);
      const data = await buildApplicationAutofillPackage(document.client_id,document.application_case_id);
      if (current?.id !== documentId || !data.canGenerate || saps271GeneratedState(document,saps271SourceSnapshot({data,reviewValues:createReviewValues(data)})) === 'OUTDATED') {
        throw new Error('This SAPS 271 is outdated or superseded. Save source corrections and regenerate it before confirming.');
      }
    }
  }
  const result = await db
    .from('documents')
    .update({
      is_verified: verified,
      verified_at: verified ? new Date().toISOString() : null,
      verified_by: verified ? userId : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', documentId);

  if (result.error) {
    throw new Error(result.error.message);
  }
}

export async function createDocumentSignedUrl(
  storagePath: string
): Promise<string> {
  const result = await db.storage
    .from(DOCUMENT_BUCKET)
    .createSignedUrl(
      storagePath,
      SIGNED_URL_DURATION_SECONDS
    );

  if (result.error) {
    throw new Error(result.error.message);
  }

  const signedUrl = result.data?.signedUrl;

  if (!signedUrl) {
    throw new Error(
      'LicenceGuard could not create a secure document link.'
    );
  }

  return signedUrl as string;
}

export async function createTemplateSignedUrl(
  storagePath: string
): Promise<string> {
  const result = await db.storage
    .from(TEMPLATE_BUCKET)
    .createSignedUrl(
      storagePath,
      SIGNED_URL_DURATION_SECONDS
    );

  if (result.error) {
    throw new Error(result.error.message);
  }

  const signedUrl = result.data?.signedUrl;

  if (!signedUrl) {
    throw new Error(
      'LicenceGuard could not create a secure template link.'
    );
  }

  return signedUrl as string;
}

export function summariseClientDocuments(
  documents: DocumentRecord[]
): ClientDocumentSummary {
  const activeDocuments = documents.filter(
    (document) => document.lifecycle_status === 'ACTIVE'
  );

  let expiring = 0;
  let expired = 0;

  for (const document of activeDocuments) {
    if (!document.expiry_date) {
      continue;
    }

    const daysUntilExpiry = calculateDaysUntil(
      document.expiry_date
    );

    if (daysUntilExpiry < 0) {
      expired += 1;
    } else if (daysUntilExpiry <= 120) {
      expiring += 1;
    }
  }

  const verified = activeDocuments.filter(
    (document) => document.is_verified
  ).length;

  return {
    total: activeDocuments.length,
    verified,
    awaitingVerification:
      activeDocuments.length - verified,
    expiring,
    expired,
  };
}
