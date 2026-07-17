import type { CompetencyCategory } from './competency';

export type RootStackParamList = {
  Dashboard: undefined;

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
  };

  ApplicationPackGenerator: {
    clientId: string;
    applicationCaseId: string;
  };

  ApplicationCases: {
    clientId: string;
  };

  ApplicationCaseForm: {
    clientId: string;
    applicationCaseId?: string;
  };

  DocumentLibrary: {
    clientId: string;
  };

  DocumentTemplates: {
    clientId: string;
  };
};
