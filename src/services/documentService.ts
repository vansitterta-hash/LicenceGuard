import { supabase } from '../lib/supabase';

import type {
  ClientDocumentSummary,
  DocumentRecord,
  DocumentTemplateRecord,
} from '../types/document';

const DOCUMENT_BUCKET = 'licenceguard-documents';
const TEMPLATE_BUCKET = 'licenceguard-templates';
const SIGNED_URL_DURATION_SECONDS = 600;
const DAY_IN_MILLISECONDS = 86_400_000;

const db = supabase as any;

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
