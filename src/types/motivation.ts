import type { ApplicationCaseRecord } from './applicationCase';
import type { ClientRecord } from './client';
import type { FirearmRecord } from './firearm';
import type { CompetencyRecord } from './competency';
import type { DocumentRecord } from './document';

export const COLLECTOR_CLAIM_SECTIONS = ['Historical Value', 'Current Collectable Value', 'Future Collectable Value (where applicable)', 'Technological Value', 'Scientific / Educational / Cultural / Commemorative / Artistic / Heritage Value', 'Rarity / Scarcity', 'Investment Significance (only if supported)'] as const;
export type MotivationClaim = { documentId: string; sourceId: string; text: string; reviewed: boolean; section: string; sourceSnapshot?: string };
export type MotivationReview = {
  background: string;
  narrative: string;
  evidenceIds: string[];
  claims: MotivationClaim[];
  /** Exact master assertions individually affirmed by the applicant; unknown stays unresolved. */
  assertions: Record<string, boolean>;
  collector: { category: string; field: string; theme: string; subTheme: string; membership: string; approvalDocumentId: string; photographDocumentId: string; themeFit: string; points: string; regulation15: string; confirmed: boolean; legalReviewed: boolean };
};
export type MotivationSources = {
  application: ApplicationCaseRecord;
  client: ClientRecord;
  firearm: FirearmRecord;
  competency: CompetencyRecord | null;
  documents: DocumentRecord[];
};
export type MotivationResearchSource = { documentId: string; id: string; title: string; publisher: string | null; url: string | null; publishedDate?: string | null; summary: string | null };
export type MotivationAnnexure = { letter: string; document: DocumentRecord };
