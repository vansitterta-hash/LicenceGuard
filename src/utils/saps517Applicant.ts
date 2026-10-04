import type { AutofillSaps517ApplicantData } from '../types/applicationAutofill';
import type { CompetencyCategory } from '../types/competency';
import type { Saps271Declarations, Saps517AdditionalDeclarationKey, Saps517ApplicantData } from '../types/saps271Declarations';
import { deriveSouthAfricanIdDetails, isValidSouthAfricanId } from './southAfricanId';
import { declarationDataIssues } from './saps271Declarations';

export function saps517RequiredProfileIssues(client: {
  first_name?: string | null; surname?: string | null; id_number?: string | null;
  address_line_1?: string | null; city?: string | null; province?: string | null;
  postal_code?: string | null; saps271_declarations?: Saps271Declarations | null;
}, category: string | null | undefined): string[] {
  const issues = saps517ApplicantReadinessIssues(client.saps271_declarations, client.id_number);
  issues.push(...declarationDataIssues(client.saps271_declarations).map((issue) => issue.replace(/G(6[2-7])/g, (_, number) => `H${Number(number) - 57}`)));
  for (const [value, label] of [[client.first_name, 'first name'], [client.surname, 'surname'], [client.address_line_1, 'residential street address'], [client.city, 'town or city'], [client.province, 'province']]) {
    if (!value?.trim()) issues.push(`Enter the applicant's ${label}.`);
  }
  if (!/^\d{4}$/.test(client.postal_code?.trim() ?? '')) issues.push('Enter a four-digit residential postal code.');
  if (!['HANDGUN', 'RIFLE', 'SLR', 'SHOTGUN'].includes(category ?? '')) issues.push('The application case needs a supported competency category.');
  return issues;
}

export const SAPS517_ADDITIONAL_DECLARATIONS: Array<{
  key: Saps517AdditionalDeclarationKey;
  number: number;
  label: string;
}> = [
  { key: 'protectionOrder', number: 11, label: 'In the past five years, have you been served with a protection order, or visited by a police official concerning allegations of violence or other conflict in your home or elsewhere?' },
  { key: 'licenceDenied', number: 12, label: 'In the past five years, have you been denied a licence, permit or authorization regarding a firearm?' },
  { key: 'suicideDepressionSubstance', number: 13, label: 'In the past five years, did you threaten or attempt suicide, suffer from major depression or emotional problems, or engage in intoxicating or narcotic substance abuse?' },
  { key: 'medicalTreatment', number: 14, label: 'In the past five years, have you been diagnosed or treated by a medical practitioner for depression, drug, intoxicating or narcotic substance abuse, behavioural problems or emotional problems?' },
  { key: 'relationshipViolence', number: 15, label: 'In the past two years, did you experience a divorce or separation from an intimate partner with whom you resided and where there were written allegations of violence?' },
  { key: 'forcedJobLoss', number: 16, label: 'In the past two years, have you experienced any forced job loss?' },
];

export function emptySaps517ApplicantData(): Saps517ApplicantData {
  return {
    citizenshipChoice: 'NOT_ANSWERED',
    postalAddressSameAsResidential: 'NOT_ANSWERED',
    postalAddress: '',
    postalLocality: '',
    postalAddressPostalCode: '',
    residenceDescription: '',
    maritalStatus: 'NOT_ANSWERED',
    otherMaritalStatus: '',
    spouseApplicable: 'NOT_ANSWERED', spouseIdType: 'NOT_ANSWERED', spouseIdentityNumber: '',
    occupation: '',
    employmentStatus: 'NOT_ANSWERED',
    employerName: '',
    businessAddress: '',
    businessPostalCode: '',
    workTelephone: '',
    faxNumber: '',
    knowledgeOfActTest: 'NOT_ANSWERED',
    safeHandlingTrainingTest: 'NOT_ANSWERED',
    accreditedTrainingCertificate: { answer: 'NOT_ANSWERED', institution: '', serialNumber: '', dateIssued: '' },
    additionalDeclarations: {
      protectionOrder: { answer: 'NOT_ANSWERED', details: '' },
      licenceDenied: { answer: 'NOT_ANSWERED', details: '' },
      suicideDepressionSubstance: { answer: 'NOT_ANSWERED', details: '' },
      medicalTreatment: { answer: 'NOT_ANSWERED', details: '' },
      relationshipViolence: { answer: 'NOT_ANSWERED', details: '' },
      forcedJobLoss: { answer: 'NOT_ANSWERED', details: '' },
    },
    under21Reason: 'NOT_ANSWERED',
    under21OtherDetails: '',
  };
}

export function getSaps517ApplicantData(value: Saps271Declarations | null | undefined): Saps517ApplicantData {
  const defaults = emptySaps517ApplicantData();
  const stored = value?.saps517;
  const data = { ...defaults, ...stored };
  // Older/partially saved JSON may omit nested fields or contain nulls.
  for (const key of Object.keys(defaults) as Array<keyof Saps517ApplicantData>) {
    if (typeof defaults[key] === 'string' && typeof data[key] !== 'string') {
      (data as unknown as Record<string, unknown>)[key] = defaults[key];
    }
  }
  data.accreditedTrainingCertificate = { ...defaults.accreditedTrainingCertificate };
  for (const key of Object.keys(data.accreditedTrainingCertificate) as Array<keyof Saps517ApplicantData['accreditedTrainingCertificate']>) {
    const entry = stored?.accreditedTrainingCertificate?.[key];
    if (typeof entry === 'string') (data.accreditedTrainingCertificate as Record<string, string>)[key] = entry;
  }
  data.additionalDeclarations = { ...defaults.additionalDeclarations };
  for (const { key } of SAPS517_ADDITIONAL_DECLARATIONS) {
    const entry = stored?.additionalDeclarations?.[key];
    data.additionalDeclarations[key] = {
      answer: entry?.answer === 'YES' || entry?.answer === 'NO' ? entry.answer : 'NOT_ANSWERED',
      details: typeof entry?.details === 'string' ? entry.details : '',
    };
  }
  return data;
}

export function saps517ApplicantReadinessIssues(
  value: Saps271Declarations | null | undefined,
  idNumber: string | null | undefined
): string[] {
  const data = getSaps517ApplicantData(value);
  const derived = deriveSouthAfricanIdDetails(idNumber ?? '');
  const issues: string[] = [];
  if (!derived) issues.push('Enter a valid South African identity number to populate date of birth, age, and gender.');
  if (!['SA_CITIZEN', 'PERMANENT_RESIDENT'].includes(data.citizenshipChoice)) {
    issues.push('Confirm whether the applicant is an SA citizen or a non-SA citizen with permanent residence.');
  }
  if (!['SINGLE', 'MARRIED', 'DIVORCED', 'WIDOW', 'WIDOWER', 'OTHER'].includes(data.maritalStatus)) issues.push('Select the applicant’s marital status.');
  if (data.maritalStatus === 'OTHER' && !data.otherMaritalStatus.trim()) issues.push('Specify the applicant’s other marital status.');
  if (!data.residenceDescription.trim()) issues.push('Describe the applicant’s type of residence.');
  if (!['YES', 'NO'].includes(data.postalAddressSameAsResidential)) issues.push('Confirm whether the postal address is the same as the residential address.');
  if (data.postalAddressSameAsResidential === 'NO' && (!data.postalAddress.trim() || !data.postalLocality.trim() || !data.postalAddressPostalCode.trim())) {
    issues.push('Enter the separate postal address, locality and postal code.');
  }
  if (data.postalAddressSameAsResidential === 'NO' && !/^\d{4}$/.test(data.postalAddressPostalCode.trim())) issues.push('Enter a four-digit postal address code.');
  if (!['YES', 'NO'].includes(data.spouseApplicable)) issues.push('Confirm whether spouse/partner particulars apply.');
  if (data.maritalStatus === 'MARRIED' && data.spouseApplicable !== 'YES') issues.push('Supply spouse particulars for a married applicant.');
  if (data.spouseApplicable === 'YES') {
    if (!['SA_ID', 'PASSPORT'].includes(data.spouseIdType)) issues.push('Select the spouse/partner identification type.');
    if (data.spouseIdType === 'SA_ID' ? !isValidSouthAfricanId(data.spouseIdentityNumber) : !data.spouseIdentityNumber.trim()) issues.push('Enter valid spouse/partner identification.');
  }
  if (!data.occupation.trim()) issues.push('Enter the applicant’s trade or profession, or state that it is not applicable.');
  if (!['EMPLOYED', 'SELF_EMPLOYED', 'NOT_APPLICABLE'].includes(data.employmentStatus)) issues.push('Confirm whether employment particulars apply.');
  if (['EMPLOYED', 'SELF_EMPLOYED'].includes(data.employmentStatus)) {
    if (!data.employerName.trim()) issues.push('Enter the employer/company or self-employment details.');
    if (!data.businessAddress.trim() || !/^\d{4}$/.test(data.businessPostalCode.trim())) issues.push('Enter the business address and a four-digit business postal code.');
  }
  if (!['YES', 'NO'].includes(data.knowledgeOfActTest)) issues.push('Answer SAPS 517 Section G1 about the prescribed Firearms Control Act test.');
  if (!['YES', 'NO'].includes(data.safeHandlingTrainingTest)) issues.push('Answer SAPS 517 Section G2 about prescribed safe-handling training and practical tests.');
  if (!['YES', 'NO'].includes(data.accreditedTrainingCertificate.answer)) issues.push('Answer SAPS 517 Section H1 about an accredited training certificate.');
  if (data.accreditedTrainingCertificate.answer === 'YES') {
    if (!data.accreditedTrainingCertificate.institution.trim()) issues.push('Enter the accredited training institution name.');
    if (!data.accreditedTrainingCertificate.serialNumber.trim()) issues.push('Enter the training certificate serial number.');
    if (!isValidDate(data.accreditedTrainingCertificate.dateIssued)) issues.push('Enter a valid training certificate issue date.');
  }
  for (const question of SAPS517_ADDITIONAL_DECLARATIONS) {
    const answer = data.additionalDeclarations[question.key];
    if (!answer || !['YES', 'NO'].includes(answer.answer)) {
      issues.push(`SAPS 517 H${question.number}: Answer this applicant declaration.`);
    } else if (answer.answer === 'YES' && !answer.details.trim()) {
      issues.push(`SAPS 517 H${question.number}: Provide the requested details for the YES answer.`);
    }
  }
  if (derived && derived.age < 21) {
    if (!['BUSINESS', 'EMPLOYED', 'DEDICATED_HUNTER', 'DEDICATED_SPORTSPERSON', 'PRIVATE_COLLECTOR', 'PUBLIC_COLLECTOR', 'OTHER'].includes(data.under21Reason)) issues.push('The applicant is under 21. Select the applicable compelling reason in SAPS 517 H17.1.');
    if (!data.under21OtherDetails.trim()) issues.push('Submit full compelling reason details in SAPS 517 H17.2.');
  }
  return issues;
}

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function saps517ApplicantFields(input: {
  profile: Saps271Declarations | null | undefined;
  idNumber: string | null | undefined;
  competencyCategory: CompetencyCategory | null | undefined;
  residentialAddress: string;
  residentialPostalCode: string;
  residentialLocality?: string;
}): AutofillSaps517ApplicantData {
  const data = getSaps517ApplicantData(input.profile);
  const derived = deriveSouthAfricanIdDetails(input.idNumber ?? '');
  const citizenship = ['SA_CITIZEN', 'PERMANENT_RESIDENT'].includes(data.citizenshipChoice) ? data.citizenshipChoice : '';
  const category = input.competencyCategory;
  const declarations = Object.fromEntries(SAPS517_ADDITIONAL_DECLARATIONS.map((question) => {
    const answer = data.additionalDeclarations[question.key];
    return [question.key, {
      answer: answer?.answer === 'YES' || answer?.answer === 'NO' ? answer.answer : '',
      details: answer?.answer === 'YES' ? answer.details.trim() : '',
    }];
  })) as AutofillSaps517ApplicantData['declarations'];

  return {
    citizenship: citizenship ?? '',
    dateOfBirth: derived?.dateOfBirth ?? '',
    age: derived ? String(derived.age) : '',
    gender: derived?.gender ?? '',
    maritalStatus: data.maritalStatus === 'NOT_ANSWERED' ? '' : data.maritalStatus,
    otherMaritalStatus: data.maritalStatus === 'OTHER' ? data.otherMaritalStatus.trim() : '',
    spouseIdType: data.spouseApplicable === 'YES' ? data.spouseIdType : '',
    spouseIdNumber: data.spouseApplicable === 'YES' && data.spouseIdType === 'SA_ID' ? data.spouseIdentityNumber.trim() : '',
    spousePassport: data.spouseApplicable === 'YES' && data.spouseIdType === 'PASSPORT' ? data.spouseIdentityNumber.trim() : '',
    residentialAddress: input.residentialAddress,
    residentialLocality: input.residentialLocality ?? '',
    postalLocality: data.postalAddressSameAsResidential === 'YES' ? input.residentialLocality ?? '' : data.postalLocality.trim(),
    postalAddress: data.postalAddressSameAsResidential === 'YES' ? input.residentialAddress : data.postalAddress.trim(),
    postalAddressPostalCode: data.postalAddressSameAsResidential === 'YES' ? input.residentialPostalCode : data.postalAddressPostalCode.trim(),
    residenceDescription: data.residenceDescription.trim(),
    occupation: data.occupation.trim(),
    selfEmploymentDetails: data.employmentStatus === 'SELF_EMPLOYED' ? data.employerName.trim() : '',
    employerName: data.employmentStatus === 'NOT_APPLICABLE' ? '' : data.employerName.trim(),
    businessAddress: data.employmentStatus === 'NOT_APPLICABLE' ? '' : data.businessAddress.trim(),
    businessPostalCode: data.employmentStatus === 'NOT_APPLICABLE' ? '' : data.businessPostalCode.trim(),
    workTelephone: data.workTelephone.trim(),
    faxNumber: data.faxNumber.trim(),
    knowledgeOfActTest: data.knowledgeOfActTest === 'YES' || data.knowledgeOfActTest === 'NO' ? data.knowledgeOfActTest : '',
    safeHandlingTrainingTest: data.safeHandlingTrainingTest === 'YES' || data.safeHandlingTrainingTest === 'NO' ? data.safeHandlingTrainingTest : '',
    trainingCertificate: data.accreditedTrainingCertificate.answer === 'YES' || data.accreditedTrainingCertificate.answer === 'NO' ? data.accreditedTrainingCertificate.answer : '',
    trainingInstitution: data.accreditedTrainingCertificate.institution.trim(),
    trainingCertificateSerial: data.accreditedTrainingCertificate.serialNumber.trim(),
    trainingCertificateIssueDate: data.accreditedTrainingCertificate.dateIssued.trim(),
    trainingCategory: {
      pistol: category === 'HANDGUN' ? 'X' : '',
      revolver: '',
      rifle: category === 'RIFLE' || category === 'SLR' ? 'X' : '',
      shotgun: category === 'SHOTGUN' ? 'X' : '',
      other: '',
    },
    declarations,
    under21Reason: derived && derived.age < 21 && data.under21Reason !== 'NOT_ANSWERED' ? data.under21Reason : '',
    under21OtherDetails: derived && derived.age < 21 ? data.under21OtherDetails.trim() : '',
  };
}

export function saps517TrainingCategoryForCompetency(category: CompetencyCategory | null | undefined): string | null {
  if (category === 'HANDGUN') return 'PISTOL';
  if (category === 'RIFLE' || category === 'SLR') return 'RIFLE';
  if (category === 'SHOTGUN') return 'SHOTGUN';
  return null;
}

export function saps517Address(client: { address_line_1?: string | null; address_line_2?: string | null; suburb?: string | null; city?: string | null; province?: string | null }): { street: string; locality: string } {
  const localities = [client.suburb, client.city, client.province]
    .map((value) => value?.trim() ?? '')
    .filter(Boolean);
  const normalisePart = (value: string) => value.toLocaleLowerCase('en-ZA').replace(/[.,\s]+/g, ' ').trim();
  const streetParts = [client.address_line_1, client.address_line_2]
    .map((value) => value?.trim() ?? '')
    .filter(Boolean)
    .flatMap((line) => line.split(',').map((part) => part.trim()).filter(Boolean));

  while (streetParts.length > 1 && localities.some((locality) => normalisePart(locality) === normalisePart(streetParts.at(-1) ?? ''))) {
    streetParts.pop();
  }

  const addressParts: string[] = [];
  for (const locality of localities) {
    if (!addressParts.some((part) => normalisePart(part) === normalisePart(locality))) {
      addressParts.push(locality);
    }
  }

  return { street: streetParts.filter((part) => !localities.some((locality) => normalisePart(locality) === normalisePart(part))).join(', '), locality: addressParts.join(', ') };
}
