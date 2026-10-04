export type DeclarationAnswer = 'NOT_ANSWERED' | 'YES' | 'NO';
export type DeclarationKey = 'convictions' | 'pendingCases' | 'lostStolen' | 'negligence' | 'unfitness' | 'confiscation';
export type DeclarationDetailKey = 'policeStation' | 'caseNumber' | 'charge' | 'outcome' | 'offence' | 'circumstances' | 'firearmDetails' | 'dateFrom' | 'period';
export type DeclarationIncident = Partial<Record<DeclarationDetailKey, string>>;
export type Saps517Answer = DeclarationAnswer;
export type Saps517MaritalStatus = 'NOT_ANSWERED' | 'SINGLE' | 'MARRIED' | 'DIVORCED' | 'WIDOW' | 'WIDOWER' | 'OTHER';
export type Saps517AdditionalDeclarationKey =
  | 'protectionOrder'
  | 'licenceDenied'
  | 'suicideDepressionSubstance'
  | 'medicalTreatment'
  | 'relationshipViolence'
  | 'forcedJobLoss';
export type Saps517ApplicantData = {
  citizenshipChoice: 'NOT_ANSWERED' | 'SA_CITIZEN' | 'PERMANENT_RESIDENT';
  postalAddressSameAsResidential: 'NOT_ANSWERED' | 'YES' | 'NO';
  postalAddress: string;
  postalLocality: string;
  postalAddressPostalCode: string;
  residenceDescription: string;
  maritalStatus: Saps517MaritalStatus;
  otherMaritalStatus: string;
  spouseApplicable: Saps517Answer;
  spouseIdType: 'NOT_ANSWERED' | 'SA_ID' | 'PASSPORT';
  spouseIdentityNumber: string;
  occupation: string;
  employmentStatus: 'NOT_ANSWERED' | 'EMPLOYED' | 'SELF_EMPLOYED' | 'NOT_APPLICABLE';
  employerName: string;
  businessAddress: string;
  businessPostalCode: string;
  workTelephone: string;
  faxNumber: string;
  knowledgeOfActTest: Saps517Answer;
  safeHandlingTrainingTest: Saps517Answer;
  accreditedTrainingCertificate: {
    answer: Saps517Answer;
    institution: string;
    serialNumber: string;
    dateIssued: string;
  };
  additionalDeclarations: Record<Saps517AdditionalDeclarationKey, {
    answer: Saps517Answer;
    details: string;
  }>;
  under21Reason: 'NOT_ANSWERED' | 'BUSINESS' | 'EMPLOYED' | 'DEDICATED_HUNTER' | 'DEDICATED_SPORTSPERSON' | 'PRIVATE_COLLECTOR' | 'PUBLIC_COLLECTOR' | 'OTHER';
  under21OtherDetails: string;
};
export type Saps271Declarations = {
  applications?: Record<string, import('../utils/applicationFormAnswers').ApplicationFormAnswers>;
  answers: Record<DeclarationKey, { answer: DeclarationAnswer; incidents: DeclarationIncident[] }>;
  confirmedAt: string | null;
  saps517?: Saps517ApplicantData;
};
