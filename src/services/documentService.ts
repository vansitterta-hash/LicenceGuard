import { supabase } from '../lib/supabase';

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
};

export type UploadClientDocumentInput = {
  dealerId: string;
  clientId: string;
  userId: string;
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

  const result = await query.order('created_at', {
    ascending: false,
  });

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

  const fileResponse = await fetch(input.file.uri);

  if (!fileResponse.ok) {
    throw new Error(
      'LicenceGuard could not read the selected document.'
    );
  }

  const fileBlob = await fileResponse.blob();

  const uploadResult = await db.storage
    .from(DOCUMENT_BUCKET)
    .upload(storagePath, fileBlob, {
      contentType:
        input.file.mimeType ||
        fileBlob.type ||
        'application/octet-stream',
      upsert: false,
    });

  if (uploadResult.error) {
    throw new Error(uploadResult.error.message);
  }

  const insertResult = await db
    .from('documents')
    .insert({
      dealer_id: input.dealerId,
      client_id: input.clientId,
      competency_id: null,
      firearm_id: null,
      firearm_licence_id: null,
      application_case_id: null,
      parent_document_id: null,
      document_type: input.documentType,
      document_scope: 'CLIENT',
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
      metadata: {},
      created_by: input.userId,
      updated_by: input.userId,
    })
    .select('*')
    .single();

  if (insertResult.error) {
    await db.storage
      .from(DOCUMENT_BUCKET)
      .remove([storagePath]);

    throw new Error(insertResult.error.message);
  }

  return insertResult.data as DocumentRecord;
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
      updated_by: userId,
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
  const result = await db
    .from('documents')
    .update({
      is_verified: verified,
      updated_by: userId,
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
