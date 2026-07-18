import type { ApplicationCaseType } from './applicationCase';
import type { CompetencyCategory } from './competency';
import type { FirearmType } from './firearm';

export type AutofillFormCode =
  | 'SAPS_271'
  | 'SAPS_517'
  | 'SAPS_517_A'
  | 'SAPS_517_G'
  | 'SAPS_518_A'
  | 'APPLICATION_WORKSHEET';

export type AutofillValidationSeverity = 'BLOCKING' | 'WARNING';

export type AutofillValidationIssue = {
  key: string;
  label: string;
  message: string;
  severity: AutofillValidationSeverity;
};

export type AutofillApplicantData = {
  fullName: string;
  firstName: string;
  surname: string;
  idNumber: string;
  cellphone: string;
  alternateCellphone: string;
  email: string;
  residentialAddress: string;
  suburb: string;
  city: string;
  province: string;
  postalCode: string;
};

export type AutofillFirearmData = {
  make: string;
  model: string;
  calibre: string;
  serialNumber: string;
  firearmType: FirearmType | null;
  licenceNumber: string;
  licenceSection: string;
  licenceIssueDate: string;
  licenceExpiryDate: string;
};

export type AutofillCompetencyData = {
  category: CompetencyCategory | null;
  certificateNumber: string;
  issueDate: string;
  expiryDate: string;
};

export type AutofillSupplierData = {
  acquisitionSource: string;
  name: string;
  idOrRegistration: string;
  contact: string;
  dealerLicenceNumber: string;
  saleOrInvoiceReference: string;
};

export type AutofillApplicationData = {
  applicationCaseId: string;
  applicationType: ApplicationCaseType;
  applicationTypeLabel: string;
  formCode: AutofillFormCode;
  formLabel: string;
  policeStation: string;
  applicationReference: string;
  openedDate: string;
  targetSubmissionDate: string;
  motivationSummary: string;
};

export type ApplicationAutofillPackage = {
  generatedAt: string;
  applicant: AutofillApplicantData;
  firearm: AutofillFirearmData | null;
  competency: AutofillCompetencyData | null;
  supplier: AutofillSupplierData | null;
  application: AutofillApplicationData;
  issues: AutofillValidationIssue[];
  blockingIssueCount: number;
  warningCount: number;
  canGenerate: boolean;
};