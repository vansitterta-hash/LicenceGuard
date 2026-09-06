export type FileFormatDescriptor = { name: string; mimeType: string | null };
const SAFE_EVIDENCE_EXTENSIONS = new Set(['pdf', 'jpg', 'jpeg', 'png']);
const SAFE_EVIDENCE_MIME_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png']);
export function isSupportedSafeEvidenceFormat(file: FileFormatDescriptor): boolean {
  const mimeType = file.mimeType?.trim().toLowerCase() ?? '';
  const extension = file.name.trim().toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? '';
  return (!mimeType || SAFE_EVIDENCE_MIME_TYPES.has(mimeType)) && (!extension || SAFE_EVIDENCE_EXTENSIONS.has(extension)) && (SAFE_EVIDENCE_MIME_TYPES.has(mimeType) || SAFE_EVIDENCE_EXTENSIONS.has(extension));
}
export function assertSupportedSafeEvidenceFormat(file: FileFormatDescriptor): void {
  if (!isSupportedSafeEvidenceFormat(file)) throw new Error('Safe photographs and safe securing photographs must be PDF, JPG, JPEG or PNG files.');
}
