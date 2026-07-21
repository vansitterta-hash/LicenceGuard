import type { ApplicationCaseType } from '../types/applicationCase';
import type { CompetencyCategory } from '../types/competency';
import type { DocumentType } from '../types/document';

export type IntelligenceDecision =
  | 'AUTO_SELECTED'
  | 'RECOMMENDED'
  | 'REQUIRES_REVIEW'
  | 'BLOCKED';

export type IntelligenceConfidence =
  | 'HIGH'
  | 'MEDIUM'
  | 'LOW';

export type IntelligenceSource =
  | 'RULE_ENGINE'
  | 'DOCUMENT_LIBRARY'
  | 'APPLICATION_HISTORY'
  | 'USER_INPUT';

export type IntelligenceMatchReason = {
  field: string;
  value: string;
  explanation: string;
};

export type IntelligenceRecommendation = {
  id: string;

  decision: IntelligenceDecision;

  confidence: IntelligenceConfidence;

  source: IntelligenceSource;

  title: string;

  description: string;

  reasons: IntelligenceMatchReason[];

  score: number;
};


export type ApplicationIntelligenceContext = {
  applicationCaseId: string;

  applicationType: ApplicationCaseType;

  licenceSection: string | null;

  competencyCategory: CompetencyCategory | null;

  firearm: {
    id: string;
    make: string;
    model: string | null;
    calibre: string;
    serialNumber: string;
    firearmType: string;
  } | null;

  client: {
    id: string;
    name: string;
    idNumber: string;
  };

  existingDocuments: DocumentType[];

  previousApplications: ApplicationCaseType[];
};


export type MotivationRecommendation = IntelligenceRecommendation & {
  documentType: 'MOTIVATION';

  templateId: string | null;
};


export type FirearmInformationRecommendation = IntelligenceRecommendation & {
  documentType:
    | 'SUPPORTING_RESEARCH'
    | 'SUPPORTING_DOCUMENT';

  firearmMatch: {
    calibreMatched: boolean;
    makeMatched: boolean;
    modelMatched: boolean;
    firearmTypeMatched: boolean;
  };
};


export type DocumentSelectionResult = {
  selectedDocuments: Array<{
    documentType: DocumentType;
    recommendationId: string;
    confidence: IntelligenceConfidence;
  }>;

  rejectedDocuments: Array<{
    documentType: DocumentType;
    reason: string;
  }>;

  recommendations: IntelligenceRecommendation[];
};


export type ApplicationIntelligenceResult = {
  context: ApplicationIntelligenceContext;

  motivation: MotivationRecommendation | null;

  firearmInformation: FirearmInformationRecommendation[];

  documentSelection: DocumentSelectionResult;

  warnings: string[];

  generatedAt: string;
};