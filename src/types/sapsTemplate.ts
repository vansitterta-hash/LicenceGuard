import type { AutofillFormCode } from './applicationAutofill';
import type { ApplicationCaseType } from './applicationCase';
import type { DocumentType } from './document';

export type SapsTemplateFieldKey =
  | 'application.section12'
  | 'application.section13'
  | 'application.section14'
  | 'application.section15'
  | 'application.section16'
  | 'application.section17'
  | 'application.section19'
  | 'application.section20'
  | 'applicant.firstNames'
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
  | 'competency.category'
  | 'competency.certificateNumber'
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
