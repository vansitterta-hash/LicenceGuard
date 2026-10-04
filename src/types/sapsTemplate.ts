import type { AutofillFormCode } from './applicationAutofill';
import type { ApplicationCaseType } from './applicationCase';
import type { DocumentType } from './document';

export type SapsTemplateFieldKey =
  | `application.form.${string}`
  | `applicant.saps517.${string}`
  | `applicant.declarations.${string}`
  | 'application.section12'
  | 'application.section13'
  | 'application.section14'
  | 'application.section15'
  | 'application.section16'
  | 'application.section17'
  | 'application.section19'
  | 'application.section20'
  | 'application.type'
  | 'application.openedDate'
  | 'applicant.firstNames'
  | 'applicant.fullName'
  | 'applicant.surname'
  | 'applicant.idNumber'
  | 'applicant.residentialAddress'
  | 'applicant.suburb'
  | 'applicant.city'
  | 'applicant.province'
  | 'applicant.postalCode'
  | 'applicant.cellphone'
  | 'applicant.alternateCellphone'
  | 'applicant.email'
  | 'firearm.type'
  | 'firearm.make'
  | 'firearm.model'
  | 'firearm.calibre'
  | 'firearm.serialNumber'
  | 'licence.number'
  | 'licence.issueDate'
  | 'licence.expiryDate'
  | 'competency.category'
  | 'competency.certificateNumber'
  | 'competency.issueDate'
  | 'competency.expiryDate'
  | 'supplier.source'
  | 'supplier.name'
  | 'supplier.idOrRegistration'
  | 'supplier.contact'
  | 'supplier.dealerLicenceNumber'
  | 'supplier.saleOrInvoiceReference'
  | 'application.policeStation'
  | 'application.reference'
  | 'application.motivationSummary';

export type SapsTemplateField = {
  key: SapsTemplateFieldKey;
  label: string;
  section: string;
  required: boolean;
};

export type SapsTemplateDefinition = {
  code: AutofillFormCode;
  name: string;
  applicationTypes: ApplicationCaseType[];
  documentType: DocumentType;
  sourceAuthority: string;
  sourceUrl: string;
  instructionsUrl: string | null;
  versionLabel: string;
  fields: SapsTemplateField[];
};

export type SapsMappedField = SapsTemplateField & {
  value: string;
};

export type SapsMappedSection = {
  title: string;
  fields: SapsMappedField[];
};

export type SapsMappedDocument = {
  template: SapsTemplateDefinition;
  sections: SapsMappedSection[];
  mappedFieldCount: number;
  missingRequiredFieldCount: number;
};
