import type { DocumentFieldDefinition, DocumentFieldId } from '../types/documentEngine';
import { SAPS271_DECLARATION_FIELDS } from './saps271DeclarationMapping';
import { SAPS517_ADDITIONAL_DECLARATIONS } from '../utils/saps517Applicant';

const SAPS517_APPLICANT_FIELDS: DocumentFieldDefinition[] = [
  ...['spouseIdType', 'spouseIdNumber', 'spousePassport'].map((key) => ({ id: `applicant.saps517.${key}` as DocumentFieldId, label: key, dataType: 'TEXT' as const, sourcePath: `data.saps517Applicant.${key}`, normalise: 'TRIM' as const })),
  { id: 'applicant.saps517.citizenship', label: 'Citizenship', dataType: 'CHOICE', sourcePath: 'data.saps517Applicant.citizenship', normalise: 'TRIM' },
  { id: 'applicant.saps517.dateOfBirth', label: 'Date of birth', dataType: 'DATE', sourcePath: 'data.saps517Applicant.dateOfBirth', normalise: 'TRIM' },
  { id: 'applicant.saps517.age', label: 'Age', dataType: 'TEXT', sourcePath: 'data.saps517Applicant.age', normalise: 'DIGITS_ONLY' },
  { id: 'applicant.saps517.gender', label: 'Gender', dataType: 'CHOICE', sourcePath: 'data.saps517Applicant.gender', normalise: 'TRIM' },
  { id: 'applicant.saps517.otherMaritalStatus', label: 'Other marital status', dataType: 'TEXT', sourcePath: 'data.saps517Applicant.otherMaritalStatus', normalise: 'TRIM' },
  { id: 'applicant.saps517.residentialLocality', label: 'Residential locality', dataType: 'TEXT', sourcePath: 'data.saps517Applicant.residentialLocality', normalise: 'TRIM' },
  { id: 'applicant.saps517.postalLocality', label: 'Postal locality', dataType: 'TEXT', sourcePath: 'data.saps517Applicant.postalLocality', normalise: 'TRIM' },
  { id: 'applicant.saps517.maritalStatus', label: 'Marital status', dataType: 'CHOICE', sourcePath: 'data.saps517Applicant.maritalStatus', normalise: 'TRIM' },
  { id: 'applicant.saps517.residentialAddress', label: 'Residential address', dataType: 'TEXT', sourcePath: 'data.saps517Applicant.residentialAddress', normalise: 'TRIM' },
  { id: 'applicant.saps517.postalAddress', label: 'Postal address', dataType: 'TEXT', sourcePath: 'data.saps517Applicant.postalAddress', normalise: 'TRIM' },
  { id: 'applicant.saps517.postalAddressPostalCode', label: 'Postal address code', dataType: 'TEXT', sourcePath: 'data.saps517Applicant.postalAddressPostalCode', normalise: 'DIGITS_ONLY' },
  { id: 'applicant.saps517.residenceDescription', label: 'Residence description', dataType: 'TEXT', sourcePath: 'data.saps517Applicant.residenceDescription', normalise: 'TRIM' },
  { id: 'applicant.saps517.occupation', label: 'Trade or profession', dataType: 'TEXT', sourcePath: 'data.saps517Applicant.occupation', normalise: 'TRIM' },
  { id: 'applicant.saps517.selfEmploymentDetails', label: 'Self-employment details', dataType: 'TEXT', sourcePath: 'data.saps517Applicant.selfEmploymentDetails', normalise: 'TRIM' },
  { id: 'applicant.saps517.employerName', label: 'Employer or company', dataType: 'TEXT', sourcePath: 'data.saps517Applicant.employerName', normalise: 'TRIM' },
  { id: 'applicant.saps517.businessAddress', label: 'Business address', dataType: 'TEXT', sourcePath: 'data.saps517Applicant.businessAddress', normalise: 'TRIM' },
  { id: 'applicant.saps517.businessPostalCode', label: 'Business postal code', dataType: 'TEXT', sourcePath: 'data.saps517Applicant.businessPostalCode', normalise: 'DIGITS_ONLY' },
  { id: 'applicant.saps517.workTelephone', label: 'Work telephone', dataType: 'TEXT', sourcePath: 'data.saps517Applicant.workTelephone', normalise: 'TRIM' },
  { id: 'applicant.saps517.faxNumber', label: 'Fax number', dataType: 'TEXT', sourcePath: 'data.saps517Applicant.faxNumber', normalise: 'TRIM' },
  { id: 'applicant.saps517.knowledgeOfActTest', label: 'Knowledge of Act test answer', dataType: 'CHOICE', sourcePath: 'data.saps517Applicant.knowledgeOfActTest', normalise: 'TRIM' },
  { id: 'applicant.saps517.safeHandlingTrainingTest', label: 'Safe-handling training answer', dataType: 'CHOICE', sourcePath: 'data.saps517Applicant.safeHandlingTrainingTest', normalise: 'TRIM' },
  { id: 'applicant.saps517.trainingCertificate', label: 'Accredited training certificate answer', dataType: 'CHOICE', sourcePath: 'data.saps517Applicant.trainingCertificate', normalise: 'TRIM' },
  { id: 'applicant.saps517.trainingInstitution', label: 'Training institution', dataType: 'TEXT', sourcePath: 'data.saps517Applicant.trainingInstitution', normalise: 'TRIM' },
  { id: 'applicant.saps517.trainingCertificateSerial', label: 'Training certificate serial', dataType: 'TEXT', sourcePath: 'data.saps517Applicant.trainingCertificateSerial', normalise: 'TRIM' },
  { id: 'applicant.saps517.trainingCertificateIssueDate', label: 'Training certificate issue date', dataType: 'DATE', sourcePath: 'data.saps517Applicant.trainingCertificateIssueDate', normalise: 'TRIM' },
  { id: 'applicant.saps517.trainingCategory.pistol', label: 'Training category pistol', dataType: 'TEXT', sourcePath: 'data.saps517Applicant.trainingCategory.pistol', normalise: 'TRIM' },
  { id: 'applicant.saps517.trainingCategory.revolver', label: 'Training category revolver', dataType: 'TEXT', sourcePath: 'data.saps517Applicant.trainingCategory.revolver', normalise: 'TRIM' },
  { id: 'applicant.saps517.trainingCategory.rifle', label: 'Training category rifle', dataType: 'TEXT', sourcePath: 'data.saps517Applicant.trainingCategory.rifle', normalise: 'TRIM' },
  { id: 'applicant.saps517.trainingCategory.shotgun', label: 'Training category shotgun', dataType: 'TEXT', sourcePath: 'data.saps517Applicant.trainingCategory.shotgun', normalise: 'TRIM' },
  { id: 'applicant.saps517.trainingCategory.other', label: 'Training category other', dataType: 'TEXT', sourcePath: 'data.saps517Applicant.trainingCategory.other', normalise: 'TRIM' },
  { id: 'applicant.saps517.under21Reason', label: 'Under-21 compelling reason', dataType: 'CHOICE', sourcePath: 'data.saps517Applicant.under21Reason', normalise: 'TRIM' },
  { id: 'applicant.saps517.under21OtherDetails', label: 'Under-21 other reason details', dataType: 'TEXT', sourcePath: 'data.saps517Applicant.under21OtherDetails', normalise: 'TRIM' },
  ...SAPS517_ADDITIONAL_DECLARATIONS.flatMap((question) => [
    { id: `applicant.saps517.declarations.${question.key}.answer` as DocumentFieldId, label: `SAPS 517 H${question.number} answer`, dataType: 'CHOICE' as const, sourcePath: `data.saps517Applicant.declarations.${question.key}.answer`, normalise: 'TRIM' as const },
    { id: `applicant.saps517.declarations.${question.key}.details` as DocumentFieldId, label: `SAPS 517 H${question.number} details`, dataType: 'TEXT' as const, sourcePath: `data.saps517Applicant.declarations.${question.key}.details`, normalise: 'TRIM' as const },
  ]),
];

const FIELDS: DocumentFieldDefinition[] = [
  ...['identificationType', 'furtherCategories', 'furtherHANDGUN', 'furtherRIFLE', 'furtherSHOTGUN', 'previousCategory', 'previousNumber', 'previousIssueDate', 'previousExpiryDate', 'associationMember', 'associationName', 'associationNumber', 'associationJoined', 'before90', 'beforeExpiry', 'afterExpiry', 'before90Reason', 'beforeExpiryReason', 'afterExpiryReason'].map(key => ({ id: `application.form.${key}` as DocumentFieldId, label: key, dataType: 'TEXT' as const, sourcePath: `data.formFields.${key}`, normalise: 'TRIM' as const })),
  ...SAPS271_DECLARATION_FIELDS,
  ...SAPS517_APPLICANT_FIELDS,
  { id: 'application.type', label: 'Application type', dataType: 'CHOICE', sourcePath: 'data.application.applicationType', normalise: 'TRIM' },
  { id: 'application.section', label: 'Licence section', dataType: 'TEXT', sourcePath: 'review.licenceSection', normalise: 'SECTION_NUMBER' },
  { id: 'application.policeStation', label: 'Police station / DFO', dataType: 'TEXT', sourcePath: 'review.policeStation', normalise: 'TRIM' },
  { id: 'application.reference', label: 'Application reference', dataType: 'TEXT', sourcePath: 'review.applicationReference', normalise: 'TRIM' },
  { id: 'application.openedDate', label: 'Application opened date', dataType: 'DATE', sourcePath: 'data.application.openedDate', normalise: 'TRIM' },
  { id: 'application.motivationSummary', label: 'Motivation summary', dataType: 'TEXT', sourcePath: 'review.motivationSummary', normalise: 'TRIM' },
  { id: 'applicant.firstNames', label: 'First names', dataType: 'TEXT', sourcePath: 'review.firstName', normalise: 'TRIM' },
  { id: 'applicant.fullName', label: 'Full name', dataType: 'TEXT', sourcePath: 'data.applicant.fullName', normalise: 'TRIM' },
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
  { id: 'licence.issueDate', label: 'Existing licence issue date', dataType: 'DATE', sourcePath: 'data.firearm.licenceIssueDate', normalise: 'TRIM' },
  { id: 'licence.expiryDate', label: 'Existing licence expiry date', dataType: 'DATE', sourcePath: 'data.firearm.licenceExpiryDate', normalise: 'TRIM' },
  { id: 'competency.category', label: 'Competency category', dataType: 'TEXT', sourcePath: 'review.competencyCategory', normalise: 'TRIM' },
  { id: 'competency.certificateNumber', label: 'Competency certificate number', dataType: 'TEXT', sourcePath: 'review.competencyCertificateNumber', normalise: 'TRIM' },
  { id: 'competency.issueDate', label: 'Competency issue date', dataType: 'DATE', sourcePath: 'data.competency.issueDate', normalise: 'TRIM' },
  { id: 'competency.expiryDate', label: 'Competency expiry date', dataType: 'DATE', sourcePath: 'data.competency.expiryDate', normalise: 'TRIM' },
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
