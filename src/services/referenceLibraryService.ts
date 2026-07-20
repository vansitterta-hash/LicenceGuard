import { Platform } from 'react-native';

import { supabase } from '../lib/supabase';
import type { ReferenceLibraryItem } from '../data/referenceLibrary';
import type { DocumentRecord } from '../types/document';

const DOCUMENT_BUCKET = 'licenceguard-documents';
const db = supabase as any;

function sanitiseFileName(fileName: string): string {
  const cleaned = fileName
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/_+/g, '_');

  return cleaned || 'reference-document';
}

function getMimeType(extension: string): string {
  switch (extension.toUpperCase()) {
    case 'PDF':
      return 'application/pdf';
    case 'DOCX':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case 'DOC':
      return 'application/msword';
    case 'JPG':
    case 'JPEG':
      return 'image/jpeg';
    case 'PNG':
      return 'image/png';
    case 'XLSX':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    default:
      return 'application/octet-stream';
  }
}

export function resolveReferenceLibraryPath(
  relativePath: string
): string {
  const normalised = relativePath
    .replace(/^\/+/, '')
    .replace(/^reference-library\//i, '');

  return normalised;
}

export function buildReferenceLibraryUrl(
  relativePath: string
): string {
  const encodedPath = resolveReferenceLibraryPath(relativePath)
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');

  if (
    Platform.OS === 'web' &&
    typeof window !== 'undefined'
  ) {
    return new URL(`/${encodedPath}`, window.location.origin)
      .toString();
  }

  return `/${encodedPath}`;
}

export async function addReferenceDocumentToClient(
  input: {
    dealerId: string;
    userId: string;
    clientId: string;
    applicationCaseId?: string;
    item: ReferenceLibraryItem;
  }
): Promise<DocumentRecord> {
  const sourceUrl = buildReferenceLibraryUrl(
    input.item.relativePath
  );

  const response = await fetch(sourceUrl);

  if (!response.ok) {
    throw new Error(
      `The selected reference document could not be read (${response.status}).`
    );
  }

  const blob = await response.blob();
  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, '-');
  const storedFileName = `${timestamp}_${sanitiseFileName(
    input.item.fileName
  )}`;
  const storagePath = [
    input.dealerId,
    input.clientId,
    input.item.documentType,
    storedFileName,
  ].join('/');

  const upload = await db.storage
    .from(DOCUMENT_BUCKET)
    .upload(storagePath, blob, {
      contentType:
        blob.type || getMimeType(input.item.extension),
      upsert: false,
    });

  if (upload.error) {
    throw new Error(upload.error.message);
  }

  const insert = await db
    .from('documents')
    .insert({
      dealer_id: input.dealerId,
      client_id: input.clientId,
      competency_id: null,
      firearm_id: null,
      firearm_licence_id: null,
      application_case_id:
        input.applicationCaseId ?? null,
      parent_document_id: null,
      document_type: input.item.documentType,
      document_scope: input.applicationCaseId
        ? 'APPLICATION_CASE'
        : 'CLIENT',
      lifecycle_status: 'ACTIVE',
      document_name: input.item.title,
      document_date: null,
      expiry_date: null,
      issued_by: null,
      reference_number: null,
      version_number: 1,
      storage_path: storagePath,
      file_name: storedFileName,
      original_file_name: input.item.fileName,
      mime_type:
        blob.type || getMimeType(input.item.extension),
      file_size_bytes: blob.size,
      is_verified: false,
      is_generated: false,
      notes:
        'Working copy selected from the LicenceGuard Reference Library. The original reference file remains unchanged.',
      metadata: {
        source: 'REFERENCE_LIBRARY',
        referenceLibraryId: input.item.id,
        referencePath: resolveReferenceLibraryPath(
          input.item.relativePath
        ),
        referenceCategory: input.item.category,
        referenceApplicationFolder:
          input.item.applicationFolder,
      },
      created_by: input.userId,
      updated_by: input.userId,
    })
    .select('*')
    .single();

  if (insert.error) {
    await db.storage
      .from(DOCUMENT_BUCKET)
      .remove([storagePath]);

    throw new Error(insert.error.message);
  }

  return insert.data as DocumentRecord;
}
