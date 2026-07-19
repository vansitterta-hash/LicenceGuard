import type { DocumentFieldId } from '../types/documentEngine';
import type { AutofillFormCode } from '../types/applicationAutofill';

export type PdfOverlayBinding = {
  fieldId: DocumentFieldId;
  page: number;
  x: number;
  y: number;
  size?: number;
  maxWidth?: number;
  choiceValue?: string;
  mark?: 'X';
};

export type PdfTemplateLayout = {
  code: AutofillFormCode;
  bindings: PdfOverlayBinding[];
};

const SAPS_271: PdfTemplateLayout = {
  code: 'SAPS_271',
  bindings: [
    { fieldId: 'application.section', page: 2, x: 548, y: 676, size: 11, choiceValue: '13', mark: 'X' },
    { fieldId: 'application.section', page: 2, x: 548, y: 651, size: 11, choiceValue: '14', mark: 'X' },
    { fieldId: 'application.section', page: 2, x: 548, y: 626, size: 11, choiceValue: '15', mark: 'X' },
    { fieldId: 'application.section', page: 2, x: 548, y: 601, size: 11, choiceValue: '16', mark: 'X' },
    { fieldId: 'application.section', page: 2, x: 548, y: 576, size: 11, choiceValue: '17', mark: 'X' },
    { fieldId: 'application.section', page: 2, x: 548, y: 551, size: 11, choiceValue: '19', mark: 'X' },
    { fieldId: 'application.section', page: 2, x: 548, y: 526, size: 11, choiceValue: '20', mark: 'X' },
    { fieldId: 'firearm.type', page: 2, x: 104, y: 442, size: 10, maxWidth: 100 },
    { fieldId: 'firearm.calibre', page: 2, x: 105, y: 358, size: 10, maxWidth: 140 },
    { fieldId: 'firearm.make', page: 2, x: 105, y: 326, size: 10, maxWidth: 170 },
    { fieldId: 'firearm.model', page: 2, x: 105, y: 295, size: 10, maxWidth: 170 },
    { fieldId: 'firearm.serialNumber', page: 2, x: 104, y: 234, size: 10, maxWidth: 190 },
    { fieldId: 'supplier.name', page: 3, x: 216, y: 703, size: 9, maxWidth: 345 },
    { fieldId: 'supplier.idOrRegistration', page: 3, x: 216, y: 672, size: 9, maxWidth: 345 },
    { fieldId: 'supplier.contact', page: 3, x: 216, y: 547, size: 9, maxWidth: 180 },
    { fieldId: 'supplier.dealerLicenceNumber', page: 3, x: 216, y: 454, size: 9, maxWidth: 220 },
    { fieldId: 'competency.category', page: 5, x: 145, y: 425, size: 9, maxWidth: 150 },
    { fieldId: 'competency.certificateNumber', page: 5, x: 220, y: 388, size: 9, maxWidth: 340 },
    { fieldId: 'applicant.surname', page: 6, x: 182, y: 724, size: 9, maxWidth: 375 },
    { fieldId: 'applicant.firstNames', page: 6, x: 182, y: 694, size: 9, maxWidth: 375 },
    { fieldId: 'applicant.idNumber', page: 6, x: 182, y: 663, size: 9, maxWidth: 375 },
    { fieldId: 'applicant.residentialAddress', page: 6, x: 182, y: 631, size: 8, maxWidth: 375 },
    { fieldId: 'applicant.city', page: 6, x: 182, y: 600, size: 9, maxWidth: 250 },
    { fieldId: 'applicant.postalCode', page: 6, x: 498, y: 600, size: 9, maxWidth: 60 },
    { fieldId: 'applicant.cellphone', page: 6, x: 182, y: 506, size: 9, maxWidth: 180 },
    { fieldId: 'applicant.email', page: 6, x: 182, y: 444, size: 8, maxWidth: 375 },
  ],
};

const REGISTRY: Partial<Record<AutofillFormCode, PdfTemplateLayout>> = { SAPS_271 };

export function getPdfTemplateLayout(code: AutofillFormCode): PdfTemplateLayout | null {
  return REGISTRY[code] ?? null;
}
