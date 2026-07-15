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
};