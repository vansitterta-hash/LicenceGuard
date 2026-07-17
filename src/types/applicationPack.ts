import type { ApplicationCaseType } from './applicationCase';
import type { ApplicationReadinessState, ReadinessRequirement } from './applicationReadiness';
import type { CompetencyCategory } from './competency';
import type { DocumentType } from './document';

export type ApplicationPackDocument = {
  documentId: string;
  documentType: DocumentType;
  documentName: string;
  originalFileName: string | null;
  storagePath: string;
  mimeType: string | null;
  isVerified: boolean;
  expiryDate: string | null;
  signedUrl: string;
  order: number;
  requirementLabel: string;
};

export type ApplicationPackSubject = {
  description: string;
  competencyCategory: CompetencyCategory | null;
  firearmDescription: string | null;
  licenceNumber: string | null;
  licenceSection: string | null;
  licenceIssueDate: string | null;
  licenceExpiryDate: string | null;
};

export type ApplicationPackClient = {
  fullName: string;
  idNumber: string;
  cellphone: string | null;
  email: string | null;
  address: string;
};

export type ApplicationPackData = {
  clientId: string;
  caseId: string;
  applicationType: ApplicationCaseType;
  applicationTypeLabel: string;
  caseStatus: string;
  readinessState: ApplicationReadinessState;
  readinessScore: number;
  readyToGenerate: boolean;
  generatedAt: string;
  client: ApplicationPackClient;
  subject: ApplicationPackSubject;
  requirements: ReadinessRequirement[];
  documents: ApplicationPackDocument[];
  missingRequiredItems: string[];
  warnings: string[];
};
