import { getSapsTemplate } from '../data/sapsTemplateRegistry';
import { resolveDocumentField } from './documentEngine';
import { saps271DeclarationFields } from '../utils/saps271Declarations';
import type { ApplicationAutofillPackage } from '../types/applicationAutofill';
import type { SapsMappedDocument, SapsTemplateFieldKey } from '../types/sapsTemplate';
import type { ApplicationReviewValues } from '../services/generatedApplicationDocumentService';

function sectionFlag(section: string, expected: string): string {
  return section.replace(/[^0-9]/g, '') === expected ? 'X' : '';
}

function valueFor(key: SapsTemplateFieldKey, data: ApplicationAutofillPackage, values: ApplicationReviewValues): string {
  if (key.startsWith('application.form.')) return data.formFields?.[key.slice('application.form.'.length)] ?? '';
  if (key.startsWith('applicant.saps517.')) {
    return resolveDocumentField(key, { data, reviewValues: values as unknown as Record<string, string> });
  }
  if (key.startsWith('applicant.declarations.')) return saps271DeclarationFields(data.saps271Declarations)[key] ?? '';
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
    case 'application.type': return data.application.applicationType;
    case 'application.openedDate': return data.application.openedDate;
    case 'applicant.firstNames': return values.firstName;
    case 'applicant.fullName': return data.applicant.fullName;
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
    case 'licence.number': return values.licenceNumber;
    case 'licence.issueDate': return data.firearm?.licenceIssueDate ?? '';
    case 'licence.expiryDate': return data.firearm?.licenceExpiryDate ?? '';
    case 'competency.category': return values.competencyCategory;
    case 'competency.certificateNumber': return values.competencyCertificateNumber;
    case 'competency.issueDate': return data.competency?.issueDate ?? '';
    case 'competency.expiryDate': return data.competency?.expiryDate ?? '';
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
  return '';
}

export function mapApplicationToSapsTemplate(data: ApplicationAutofillPackage, values: ApplicationReviewValues): SapsMappedDocument {
  const template = getSapsTemplate(data.application.formCode);
  const mapped = template.fields.map((field) => {
    let required = field.required;
    if (field.key.startsWith('supplier.') && !data.supplier) required = false;
    const key = field.key.replace('application.form.', '');
    if (['associationName', 'associationNumber', 'associationJoined'].includes(key)) required = data.formFields?.associationMember === 'YES';
    if (key === 'before90Reason') required = data.formFields?.before90 === 'NO';
    if (key === 'beforeExpiryReason') required = data.formFields?.beforeExpiry === 'YES';
    if (key === 'afterExpiryReason') required = data.formFields?.afterExpiry === 'YES';
    return { ...field, required, value: valueFor(field.key, data, values).trim() };
  });
  const sectionNames = Array.from(new Set(mapped.map((field) => field.section)));
  const sections = sectionNames.map((title) => ({ title, fields: mapped.filter((field) => field.section === title) }));
  return {
    template,
    sections,
    mappedFieldCount: mapped.filter((field) => field.value).length,
    missingRequiredFieldCount: mapped.filter((field) => field.required && !field.value).length,
  };
}
