import { loader } from './beta-test-support.mjs';
const load = loader();
const policy = load('src/utils/saps517Applicant.ts');
export function complete517Profile() {
  const profile = load('src/utils/saps271Declarations.ts').emptySaps271Declarations();
  for (const response of Object.values(profile.answers)) response.answer = 'NO';
  profile.saps517 = {
    ...policy.emptySaps517ApplicantData(), citizenshipChoice: 'SA_CITIZEN',
    postalAddressSameAsResidential: 'YES', maritalStatus: 'SINGLE', occupation: 'Retired',
    employmentStatus: 'NOT_APPLICABLE', spouseApplicable: 'NO', residenceDescription: 'House', knowledgeOfActTest: 'YES', safeHandlingTrainingTest: 'YES',
  };
  profile.saps517.accreditedTrainingCertificate.answer = 'NO';
  for (const response of Object.values(profile.saps517.additionalDeclarations)) response.answer = 'NO';
  return profile;
}
export function complete517Data(data) {
  const profile = complete517Profile();
  data.saps271Declarations = { ...profile, ...data.saps271Declarations, saps517: profile.saps517 };
  data.saps517Applicant = policy.saps517ApplicantFields({
    profile: data.saps271Declarations, idNumber: data.applicant.idNumber,
    competencyCategory: data.competency?.category, residentialAddress: data.applicant.residentialAddress,
    residentialLocality: [data.applicant.suburb, data.applicant.city, data.applicant.province].filter(Boolean).join(', '),
    residentialPostalCode: data.applicant.postalCode,
  });
  return data;
}
