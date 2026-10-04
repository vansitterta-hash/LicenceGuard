export type ResearchTrustLevel =
  | 'DIRECT'
  | 'PRIVATE_REVIEWED'
  | 'PUBLIC_REVIEWED'
  | 'UNREVIEWED';

export type ResearchSubjectType =
  | 'DISCIPLINE'
  | 'FIREARM'
  | 'CALIBRE'
  | 'BALLISTIC'
  | 'ASSOCIATION'
  | 'RULES'
  | 'LEGAL'
  | 'GENERAL';

export type ResearchSource = {
  id: string;
  title: string;
  publisher: string | null;
  url: string | null;
  retrievalDate: string | null;
  trustLevel: ResearchTrustLevel;
  subjectType: ResearchSubjectType;
  summary: string | null;
  applicability: string | null;
  publishedDate?: string | null;
  category: string | null;
  association: string | null;
  discipline: string | null;
  firearmMake: string | null;
  firearmModel: string | null;
  calibre: string | null;
  sourceKind: 'REFERENCE_LIBRARY' | 'EXTERNAL_PROVIDER';
};

export type ResearchFinding = {
  subject: string;
  summary: string;
  sourceId: string | null;
  sourceTitle: string | null;
  sourceUrl: string | null;
};

export type ApplicationResearchContext = {
  provider: 'LOCAL_REFERENCE_LIBRARY' | 'EXTERNAL_PROVIDER' | 'BLOCKED';
  providerStatus: 'AVAILABLE' | 'PARTIAL' | 'REQUIRES_EXTERNAL_PROVIDER';
  applicationType: string | null;
  licenceSection: string | null;
  purpose: string | null;
  discipline: string | null;
  association: string | null;
  firearm: {
    make: string | null;
    model: string | null;
    calibre: string | null;
    firearmType: string | null;
  } | null;
  sourceCount: number;
  sources: ResearchSource[];
  findings: ResearchFinding[];
  warnings: string[];
  generatedAt: string;
};

export type ExternalResearchProvider = {
  id: string;
  name: string;
  isConfigured: boolean;
  supportsLiveResearch: boolean;
  fetch: <TContext>(context: TContext) => Promise<ApplicationResearchContext>;
};
