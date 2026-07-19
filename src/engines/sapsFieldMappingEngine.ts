import { getSapsTemplate } from '../data/sapsTemplateRegistry';
import type { ApplicationAutofillPackage } from '../types/applicationAutofill';
import type { SapsMappedDocument, SapsTemplateFieldKey } from '../types/sapsTemplate';
import type { ApplicationReviewValues } from '../services/generatedApplicationDocumentService';

function sectionFlag(section: string, expected: string): string {
  return section.replace(/[^0-9]/g, '') === expected ? 'X' : '';
}

function valueFor(key: SapsTemplateFieldKey, data: ApplicationAutofillPackage, values: ApplicationReviewValues): string {
  const section = values.licenceSection;
  switch (key) {
    case 'application.section12': return sectionFlag(section, '12');
    case 'application.section13': return sectionFlag(section, '13');
    case 'application.section14': return sectionFlag(section, '14');
    case 'application.section15': return sectionFlag(section, '15');
    case 'application.section16': return sectionFlag(section, '16');
    case 'application.section17': return sectionFlag(section, '17');
    case 'application.section19': return sectionFlag(section, '19');
    case 'application.section20': return sectionFlag(section, '20');
    case 'applicant.firstNames': return values.firstName;
    case 'applicant.surname': return values.surname;
    case 'applicant.idNumber': return values.idNumber;
    case 'applicant.residentialAddress': return values.residentialAddress;
    case 'applicant.suburb': return values.suburb;
    case 'applicant.city': return values.city;
    case 'applicant.province': return values.province;
    case 'applicant.postalCode': return values.postalCode;
    case 'applicant.cellphone': return values.cellphone;
    case 'applicant.alternateCellphone': return values.alternateCellphone;
    case 'applicant.email': return values.email;
    case 'firearm.type': return data.firearm?.firearmType ?? '';
    case 'firearm.make': return values.firearmMake;
    case 'firearm.model': return values.firearmModel;
    case 'firearm.calibre': return values.calibre;
    case 'firearm.serialNumber': return values.serialNumber;
    case 'competency.category': return values.competencyCategory;
    case 'competency.certificateNumber': return values.competencyCertificateNumber;
    case 'supplier.source': return data.supplier?.acquisitionSource ?? '';
    case 'supplier.name': return values.supplierName;
    case 'supplier.idOrRegistration': return values.supplierIdOrRegistration;
    case 'supplier.contact': return values.supplierContact;
    case 'supplier.dealerLicenceNumber': return values.supplierLicenceNumber;
    case 'supplier.saleOrInvoiceReference': return values.saleOrInvoiceReference;
    case 'application.policeStation': return values.policeStation;
    case 'application.reference': return values.applicationReference;
    case 'application.motivationSummary': return values.motivationSummary;
  }
}

export function mapApplicationToSapsTemplate(data: ApplicationAutofillPackage, values: ApplicationReviewValues): SapsMappedDocument {
  const template = getSapsTemplate(data.application.formCode);
  const mapped = template.fields.map((field) => ({ ...field, value: valueFor(field.key, data, values).trim() }));
  const sectionNames = Array.from(new Set(mapped.map((field) => field.section)));
  const sections = sectionNames.map((title) => ({ title, fields: mapped.filter((field) => field.section === title) }));
  return {
    template,
    sections,
    mappedFieldCount: mapped.filter((field) => field.value).length,
    missingRequiredFieldCount: mapped.filter((field) => field.required && !field.value).length,
  };
}
