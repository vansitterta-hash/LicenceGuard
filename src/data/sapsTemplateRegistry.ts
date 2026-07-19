import type { AutofillFormCode } from '../types/applicationAutofill';
import type { ApplicationCaseType } from '../types/applicationCase';
import type { SapsTemplateDefinition } from '../types/sapsTemplate';

const SAPS_271_FIELDS: SapsTemplateDefinition['fields'] = [
  { key: 'application.section12', label: 'Section 12', section: 'Licence category', required: false },
  { key: 'application.section13', label: 'Section 13 - Self-defence', section: 'Licence category', required: false },
  { key: 'application.section14', label: 'Section 14 - Restricted self-defence', section: 'Licence category', required: false },
  { key: 'application.section15', label: 'Section 15 - Occasional hunting or sport shooting', section: 'Licence category', required: false },
  { key: 'application.section16', label: 'Section 16 - Dedicated hunting or sport shooting', section: 'Licence category', required: false },
  { key: 'application.section17', label: 'Section 17 - Private collection', section: 'Licence category', required: false },
  { key: 'application.section19', label: 'Section 19 - Public collection', section: 'Licence category', required: false },
  { key: 'application.section20', label: 'Section 20 - Business purposes', section: 'Licence category', required: false },
  { key: 'applicant.surname', label: 'Surname', section: 'Applicant particulars', required: true },
  { key: 'applicant.firstNames', label: 'Full first names', section: 'Applicant particulars', required: true },
  { key: 'applicant.idNumber', label: 'Identity number', section: 'Applicant particulars', required: true },
  { key: 'applicant.residentialAddress', label: 'Residential address', section: 'Applicant particulars', required: true },
  { key: 'applicant.suburb', label: 'Suburb', section: 'Applicant particulars', required: false },
  { key: 'applicant.city', label: 'Town / city', section: 'Applicant particulars', required: true },
  { key: 'applicant.province', label: 'Province', section: 'Applicant particulars', required: true },
  { key: 'applicant.postalCode', label: 'Postal code', section: 'Applicant particulars', required: false },
  { key: 'applicant.cellphone', label: 'Cellphone number', section: 'Applicant particulars', required: false },
  { key: 'applicant.alternateCellphone', label: 'Alternative contact number', section: 'Applicant particulars', required: false },
  { key: 'applicant.email', label: 'Email address', section: 'Applicant particulars', required: false },
  { key: 'firearm.type', label: 'Type of firearm', section: 'Firearm particulars', required: true },
  { key: 'firearm.make', label: 'Make', section: 'Firearm particulars', required: true },
  { key: 'firearm.model', label: 'Model', section: 'Firearm particulars', required: false },
  { key: 'firearm.calibre', label: 'Calibre', section: 'Firearm particulars', required: true },
  { key: 'firearm.serialNumber', label: 'Serial number', section: 'Firearm particulars', required: true },
  { key: 'competency.category', label: 'Competency category', section: 'Competency particulars', required: true },
  { key: 'competency.certificateNumber', label: 'Competency certificate number', section: 'Competency particulars', required: false },
  { key: 'supplier.source', label: 'Acquisition source', section: 'Supplier / seller particulars', required: true },
  { key: 'supplier.name', label: 'Dealer or private seller name', section: 'Supplier / seller particulars', required: true },
  { key: 'supplier.idOrRegistration', label: 'ID or registration number', section: 'Supplier / seller particulars', required: true },
  { key: 'supplier.contact', label: 'Contact number', section: 'Supplier / seller particulars', required: false },
  { key: 'supplier.dealerLicenceNumber', label: 'Dealer licence number', section: 'Supplier / seller particulars', required: false },
  { key: 'supplier.saleOrInvoiceReference', label: 'Invoice / sale reference', section: 'Supplier / seller particulars', required: false },
  { key: 'application.policeStation', label: 'Police station / DFO', section: 'Application administration', required: false },
  { key: 'application.reference', label: 'LicenceGuard application reference', section: 'Application administration', required: false },
  { key: 'application.motivationSummary', label: 'Motivation summary', section: 'Motivation', required: false },
];

const REGISTRY: Record<AutofillFormCode, SapsTemplateDefinition> = {
  SAPS_271: {
    code: 'SAPS_271',
    name: 'SAPS 271 - Application for Licence to Possess a Firearm',
    applicationTypes: ['FIREARM_LICENCE_FIRST_APPLICATION', 'FIREARM_LICENCE_ADDITIONAL_APPLICATION'],
    documentType: 'FIREARM_LICENCE_APPLICATION_FORM',
    sourceAuthority: 'South African Police Service',
    sourceUrl: 'https://www.saps.gov.za/services/flash/firearms/forms/english/e271.pdf',
    instructionsUrl: 'https://www.saps.gov.za/services/flash/firearms/forms/english/ei271.pdf',
    versionLabel: 'Official SAPS English template',
    fields: SAPS_271_FIELDS,
  },
  SAPS_517: {
    code: 'SAPS_517', name: 'SAPS 517 - Application for a Competency Certificate',
    applicationTypes: ['COMPETENCY_FIRST_APPLICATION'], documentType: 'COMPETENCY_APPLICATION',
    sourceAuthority: 'South African Police Service', sourceUrl: 'https://www.saps.gov.za/services/flash/firearms/forms/english/e517.pdf', instructionsUrl: null,
    versionLabel: 'Official SAPS English template', fields: [],
  },
  SAPS_517_A: {
    code: 'SAPS_517_A', name: 'SAPS 517(a) - Application for a Further Competency Certificate',
    applicationTypes: ['COMPETENCY_ADDITIONAL_CATEGORY'], documentType: 'COMPETENCY_APPLICATION',
    sourceAuthority: 'South African Police Service', sourceUrl: 'https://www.saps.gov.za/services/flash/firearms/forms/english/e517a.pdf', instructionsUrl: null,
    versionLabel: 'Official SAPS English template', fields: [],
  },
  SAPS_517_G: {
    code: 'SAPS_517_G', name: 'SAPS 517(g) - Application for Renewal of a Competency Certificate',
    applicationTypes: ['COMPETENCY_RENEWAL', 'COMPETENCY_REAPPLICATION'], documentType: 'COMPETENCY_RENEWAL_FORM',
    sourceAuthority: 'South African Police Service', sourceUrl: 'https://www.saps.gov.za/services/flash/firearms/forms/english/e517g.pdf', instructionsUrl: null,
    versionLabel: 'Official SAPS English template', fields: [],
  },
  SAPS_518_A: {
    code: 'SAPS_518_A', name: 'SAPS 518(a) - Application for Renewal of a Firearm Licence',
    applicationTypes: ['FIREARM_LICENCE_RENEWAL', 'FIREARM_LICENCE_REAPPLICATION'], documentType: 'FIREARM_LICENCE_RENEWAL_FORM',
    sourceAuthority: 'South African Police Service', sourceUrl: 'https://www.saps.gov.za/services/flash/firearms/forms/english/e518a.pdf', instructionsUrl: null,
    versionLabel: 'Official SAPS English template', fields: [],
  },
  APPLICATION_WORKSHEET: {
    code: 'APPLICATION_WORKSHEET', name: 'LicenceGuard Application Worksheet',
    applicationTypes: ['TEMPORARY_AUTHORISATION', 'APPEAL_OR_RECONSIDERATION'], documentType: 'SUPPORTING_DOCUMENT',
    sourceAuthority: 'LicenceGuard', sourceUrl: '', instructionsUrl: null, versionLabel: 'Internal worksheet', fields: [],
  },
};

export function getSapsTemplate(code: AutofillFormCode): SapsTemplateDefinition {
  return REGISTRY[code];
}

export function getSapsTemplateForApplicationType(type: ApplicationCaseType): SapsTemplateDefinition {
  return Object.values(REGISTRY).find((template) => template.applicationTypes.includes(type)) ?? REGISTRY.APPLICATION_WORKSHEET;
}
