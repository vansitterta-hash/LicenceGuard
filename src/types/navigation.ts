import type { CompetencyCategory } from './competency';

export type RootStackParamList = {
  Dashboard: undefined;

  ReferenceLibrary:
    | {
        clientId?: string;
        applicationCaseId?: string;
        documentType?: import('./document').DocumentType;
        query?: string;
        selectionMode?: boolean;
      }
    | undefined;

  Clients: undefined;

  ClientForm:
    | {
        clientId?: string;
      }
    | undefined;

  ClientProfile: {
    clientId: string;
  };

  Competencies: {
    clientId: string;
  };

  CompetencyForm: {
    clientId: string;
    competencyId?: string;
    initialCategory?: CompetencyCategory;
  };

  Firearms: {
    clientId: string;
  };

  FirearmForm: {
    clientId: string;
    firearmId?: string;
  };

  ApplicationReadiness: {
    clientId: string;
    applicationCaseId?: string;
  };

  ApplicationPackGenerator: {
    clientId: string;
    applicationCaseId: string;
  };

  ApplicationAutofill: {
    clientId: string;
    applicationCaseId: string;
  };

  ApplicationCases: {
    clientId: string;
  };

  ApplicationCaseForm: {
    clientId: string;
    applicationCaseId?: string;
    workflowAction?:
      | 'NEW_FIREARM_APPLICATION'
      | 'NEW_COMPETENCY'
      | 'FURTHER_COMPETENCY'
      | 'FIREARM_RENEWAL'
      | 'COMPETENCY_RENEWAL';
  };

  DocumentLibrary: {
    clientId: string;
    applicationCaseId?: string;
    documentType?: import('./document').DocumentType;
    openUpload?: boolean;
  };

  DocumentTemplates: {
    clientId: string;
  };
};