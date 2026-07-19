import type { DocumentFieldDefinition, DocumentFieldId } from '../types/documentEngine';

const FIELDS: DocumentFieldDefinition[] = [
  { id: 'application.section', label: 'Licence section', dataType: 'TEXT', sourcePath: 'review.licenceSection', normalise: 'SECTION_NUMBER' },
  { id: 'application.policeStation', label: 'Police station / DFO', dataType: 'TEXT', sourcePath: 'review.policeStation', normalise: 'TRIM' },
  { id: 'application.reference', label: 'Application reference', dataType: 'TEXT', sourcePath: 'review.applicationReference', normalise: 'TRIM' },
  { id: 'application.motivationSummary', label: 'Motivation summary', dataType: 'TEXT', sourcePath: 'review.motivationSummary', normalise: 'TRIM' },
  { id: 'applicant.firstNames', label: 'First names', dataType: 'TEXT', sourcePath: 'review.firstName', normalise: 'TRIM' },
  { id: 'applicant.surname', label: 'Surname', dataType: 'TEXT', sourcePath: 'review.surname', normalise: 'UPPERCASE' },
  { id: 'applicant.idNumber', label: 'Identity number', dataType: 'TEXT', sourcePath: 'review.idNumber', normalise: 'DIGITS_ONLY' },
  { id: 'applicant.residentialAddress', label: 'Residential address', dataType: 'TEXT', sourcePath: 'review.residentialAddress', normalise: 'TRIM' },
  { id: 'applicant.suburb', label: 'Suburb', dataType: 'TEXT', sourcePath: 'review.suburb', normalise: 'TRIM' },
  { id: 'applicant.city', label: 'Town / city', dataType: 'TEXT', sourcePath: 'review.city', normalise: 'TRIM' },
  { id: 'applicant.province', label: 'Province', dataType: 'TEXT', sourcePath: 'review.province', normalise: 'TRIM' },
  { id: 'applicant.postalCode', label: 'Postal code', dataType: 'TEXT', sourcePath: 'review.postalCode', normalise: 'DIGITS_ONLY' },
  { id: 'applicant.cellphone', label: 'Cellphone', dataType: 'TEXT', sourcePath: 'review.cellphone', normalise: 'TRIM' },
  { id: 'applicant.alternateCellphone', label: 'Alternate cellphone', dataType: 'TEXT', sourcePath: 'review.alternateCellphone', normalise: 'TRIM' },
  { id: 'applicant.email', label: 'Email', dataType: 'TEXT', sourcePath: 'review.email', normalise: 'TRIM' },
  { id: 'firearm.type', label: 'Firearm type', dataType: 'TEXT', sourcePath: 'data.firearm.firearmType', normalise: 'TRIM' },
  { id: 'firearm.make', label: 'Make', dataType: 'TEXT', sourcePath: 'review.firearmMake', normalise: 'UPPERCASE' },
  { id: 'firearm.model', label: 'Model', dataType: 'TEXT', sourcePath: 'review.firearmModel', normalise: 'TRIM' },
  { id: 'firearm.calibre', label: 'Calibre', dataType: 'TEXT', sourcePath: 'review.calibre', normalise: 'TRIM' },
  { id: 'firearm.serialNumber', label: 'Serial number', dataType: 'TEXT', sourcePath: 'review.serialNumber', normalise: 'UPPERCASE' },
  { id: 'licence.number', label: 'Existing licence number', dataType: 'TEXT', sourcePath: 'review.licenceNumber', normalise: 'TRIM' },
  { id: 'competency.category', label: 'Competency category', dataType: 'TEXT', sourcePath: 'review.competencyCategory', normalise: 'TRIM' },
  { id: 'competency.certificateNumber', label: 'Competency certificate number', dataType: 'TEXT', sourcePath: 'review.competencyCertificateNumber', normalise: 'TRIM' },
  { id: 'supplier.source', label: 'Acquisition source', dataType: 'TEXT', sourcePath: 'data.supplier.acquisitionSource', normalise: 'TRIM' },
  { id: 'supplier.name', label: 'Supplier / seller name', dataType: 'TEXT', sourcePath: 'review.supplierName', normalise: 'TRIM' },
  { id: 'supplier.idOrRegistration', label: 'Supplier ID / registration', dataType: 'TEXT', sourcePath: 'review.supplierIdOrRegistration', normalise: 'TRIM' },
  { id: 'supplier.contact', label: 'Supplier contact', dataType: 'TEXT', sourcePath: 'review.supplierContact', normalise: 'TRIM' },
  { id: 'supplier.dealerLicenceNumber', label: 'Dealer licence number', dataType: 'TEXT', sourcePath: 'review.supplierLicenceNumber', normalise: 'TRIM' },
  { id: 'supplier.saleOrInvoiceReference', label: 'Sale / invoice reference', dataType: 'TEXT', sourcePath: 'review.saleOrInvoiceReference', normalise: 'TRIM' },
];

const FIELD_MAP = new Map<DocumentFieldId, DocumentFieldDefinition>(FIELDS.map((field) => [field.id, field]));

export function getDocumentFieldDefinition(id: DocumentFieldId): DocumentFieldDefinition {
  const field = FIELD_MAP.get(id);
  if (!field) throw new Error(`Unknown document field: ${id}`);
  return field;
}

export function listDocumentFieldDefinitions(): DocumentFieldDefinition[] {
  return [...FIELDS];
}
