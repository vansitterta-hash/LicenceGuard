import { suggestApplicationDocuments } from '../services/applicationDocumentSuggestionService';
import type { ApplicationCaseType } from '../types/applicationCase';
import type { DocumentType } from '../types/document';
import { buildApplicationContext } from './applicationContextService';
import { buildCandidateDocuments } from './candidateDocumentService';
import { getLocalIntelligenceFeatureFlags } from './featureFlags';
import type {
  CandidateDocument,
  CandidateScoreFactor,
  IntelligenceSourceScope,
} from './types';

export type IntelligenceComparisonClassification =
  | 'MATCH'
  | 'DIFFERENT'
  | 'CURRENT_PATH_HAS_NO_SELECTION'
  | 'NEW_FRAMEWORK_HAS_NO_RECOMMENDATION'
  | 'INSUFFICIENT_DATA';

export type SourceEquivalence =
  | 'SAME_UNDERLYING_SOURCE'
  | 'GENUINELY_DIFFERENT_SOURCE'
  | 'CANNOT_CONFIRM_SOURCE_EQUIVALENCE';

export type LowerRankedCandidate = {
  candidate: CandidateDocument;
  primaryReason: string;
};

export type ReadOnlyRecommendationGroup = {
  documentType: DocumentType;
  selected: CandidateDocument;
  lowerRanked: LowerRankedCandidate[];
};

export type ReadOnlyIntelligencePreview = {
  generatedAt: string;
  applicationCaseId: string;
  applicationType: ApplicationCaseType;
  contextSummary: {
    client: string;
    firearm: string | null;
    competencyCategory: string | null;
    licenceSection: string | null;
    readinessState: string | null;
    packState: string;
  };
  missingAuthoritativeData: string[];
  candidatesConsidered: CandidateDocument[];
  recommendations: ReadOnlyRecommendationGroup[];
  sourceScopesSearched: IntelligenceSourceScope[];
  unavailableSourceScopes: IntelligenceSourceScope[];
  noRecommendationReason: string | null;
  productionComparison: {
    classification: IntelligenceComparisonClassification;
    newRecommendationId: string | null;
    currentPathSelectionId: string | null;
    currentPathSelectionTitle: string | null;
    sourceEquivalence: SourceEquivalence;
    equivalenceEvidence: string[];
    explanation: string;
  };
  readOnly: true;
};

const RECOMMENDABLE_TYPES = new Set<DocumentType>([
  'MOTIVATION',
  'SUPPORTING_DOCUMENT',
  'SUPPORTING_RESEARCH',
  'ENDORSEMENT',
  'DEDICATED_STATUS',
  'GOOD_STANDING',
  'MEMBERSHIP_CERTIFICATE',
  'SAFE_AFFIDAVIT',
  'TESTIMONIAL',
]);

const ALL_SOURCE_SCOPES: IntelligenceSourceScope[] = [
  'CLIENT',
  'FIREARM',
  'HISTORICAL_APPLICATION',
  'DEALER_LIBRARY',
  'PUBLIC_LIBRARY',
];

function primaryRankingReason(
  selected: CandidateDocument,
  lower: CandidateDocument
): string {
  const selectedFactors = selected.score?.factors ?? [];
  const lowerFactors = new Map(
    (lower.score?.factors ?? []).map((factor) => [factor.key, factor])
  );
  const strongestDifference = selectedFactors
    .map((factor): { factor: CandidateScoreFactor; difference: number } => ({
      factor,
      difference: factor.contribution - (lowerFactors.get(factor.key)?.contribution ?? 0),
    }))
    .filter((item) => item.difference > 0)
    .sort((left, right) => right.difference - left.difference)[0];
  if (strongestDifference) {
    return `${selected.title} ranked higher primarily because of ${strongestDifference.factor.label.toLowerCase()}.`;
  }
  if (selected.source.scope !== lower.source.scope) {
    return `${selected.source.scope} outranks ${lower.source.scope} in the source hierarchy.`;
  }
  return `${selected.title} has the higher deterministic total score.`;
}

function groupRecommendations(candidates: CandidateDocument[]): ReadOnlyRecommendationGroup[] {
  const byType = new Map<DocumentType, CandidateDocument[]>();
  for (const candidate of candidates) {
    const group = byType.get(candidate.documentType) ?? [];
    group.push(candidate);
    byType.set(candidate.documentType, group);
  }
  return Array.from(byType.entries()).map(([documentType, group]) => ({
    documentType,
    selected: group[0],
    lowerRanked: group.slice(1).map((candidate) => ({
      candidate,
      primaryReason: primaryRankingReason(group[0], candidate),
    })),
  }));
}

function normaliseIdentity(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function compareUnderlyingSource(
  candidate: CandidateDocument | null,
  current: Awaited<ReturnType<typeof suggestApplicationDocuments>>['suggestions'][number] | null
): { equivalence: SourceEquivalence; evidence: string[] } {
  if (!candidate || !current) {
    return { equivalence: 'CANNOT_CONFIRM_SOURCE_EQUIVALENCE', evidence: ['One comparison path has no recommendation.'] };
  }
  const metadata = candidate.metadata;
  const candidateIds = [
    candidate.id,
    candidate.documentId,
    candidate.source.documentId,
    candidate.source.id,
    candidate.source.metadata.referenceItemId,
    candidate.source.metadata.referenceLibraryId,
    metadata.referenceItemId,
    metadata.referenceLibraryId,
    metadata.sourceDocumentId,
    metadata.generatedFromTemplateId,
  ].filter((value): value is string => typeof value === 'string');
  if (candidateIds.includes(current.item.id)) {
    return { equivalence: 'SAME_UNDERLYING_SOURCE', evidence: [`Repository source ID ${current.item.id} is retained in the durable document provenance.`] };
  }
  const candidateNames = [
    candidate.title,
    metadata.originalFileName,
    metadata.sourceFileName,
    candidate.source.metadata.originalFileName,
  ].map(normaliseIdentity).filter((value): value is string => Boolean(value));
  const currentName = normaliseIdentity(current.item.fileName);
  if (currentName && candidateNames.includes(currentName)) {
    return { equivalence: 'SAME_UNDERLYING_SOURCE', evidence: [`Original filename matches ${current.item.fileName}.`] };
  }
  const storageIdentity = normaliseIdentity(candidate.storagePath);
  const repositoryIdentity = normaliseIdentity(current.item.relativePath);
  if (storageIdentity && repositoryIdentity && (storageIdentity.endsWith(repositoryIdentity) || repositoryIdentity.endsWith(storageIdentity))) {
    return { equivalence: 'SAME_UNDERLYING_SOURCE', evidence: ['Storage path and repository path identify the same source path.'] };
  }
  const explicitReferenceIds = [metadata.referenceItemId, metadata.referenceLibraryId]
    .filter((value): value is string => typeof value === 'string');
  if (explicitReferenceIds.length > 0 && !explicitReferenceIds.includes(current.item.id)
    && currentName && candidateNames.length > 0 && !candidateNames.includes(currentName)) {
    return {
      equivalence: 'GENUINELY_DIFFERENT_SOURCE',
      evidence: ['Explicit reference IDs differ and the available original filenames do not match.'],
    };
  }
  return {
    equivalence: 'CANNOT_CONFIRM_SOURCE_EQUIVALENCE',
    evidence: ['No shared source ID, parent/source relationship, original filename or storage provenance proves equivalence.'],
  };
}

export async function buildReadOnlyIntelligencePreview(
  applicationCaseId: string
): Promise<ReadOnlyIntelligencePreview> {
  if (!getLocalIntelligenceFeatureFlags().READ_ONLY_INTELLIGENCE) {
    throw new Error('Read-only intelligence is disabled.');
  }
  const flags = getLocalIntelligenceFeatureFlags();
  const [context, production] = await Promise.all([
    buildApplicationContext(applicationCaseId),
    suggestApplicationDocuments(applicationCaseId),
  ]);
  const candidatesConsidered = buildCandidateDocuments(
    context,
    flags.PRIVATE_LIBRARY_INTEGRATION
  )
    .filter((candidate) => RECOMMENDABLE_TYPES.has(candidate.documentType));
  const recommendations = groupRecommendations(candidatesConsidered);
  const currentPathSelection = production.suggestions[0] ?? null;
  const comparisonType: DocumentType | null = currentPathSelection?.kind === 'MOTIVATION'
    ? 'MOTIVATION'
    : currentPathSelection ? 'SUPPORTING_RESEARCH' : null;
  const newRecommendation = comparisonType
    ? recommendations.find((item) => item.documentType === comparisonType)?.selected ?? null
    : recommendations[0]?.selected ?? null;
  const currentReferenceId = currentPathSelection?.item.id ?? null;
  const sourceComparison = compareUnderlyingSource(newRecommendation, currentPathSelection);

  let classification: IntelligenceComparisonClassification;
  let explanation: string;
  if (!newRecommendation && context.missingData.length > 0) {
    classification = 'INSUFFICIENT_DATA';
    explanation = 'The canonical context lacks authoritative data needed to produce a comparable recommendation.';
  } else if (!newRecommendation) {
    classification = 'NEW_FRAMEWORK_HAS_NO_RECOMMENDATION';
    explanation = 'No suitable durable client, firearm-linked or historical candidate exists.';
  } else if (!currentPathSelection) {
    classification = 'CURRENT_PATH_HAS_NO_SELECTION';
    explanation = 'The production suggestion path returned no selection; the preview recommendation remains read-only.';
  } else if (sourceComparison.equivalence === 'SAME_UNDERLYING_SOURCE') {
    classification = 'MATCH';
    explanation = 'Both paths identify the same underlying source after provenance comparison.';
  } else {
    classification = 'DIFFERENT';
    explanation = sourceComparison.equivalence === 'GENUINELY_DIFFERENT_SOURCE'
      ? 'The available provenance confirms that the two paths selected genuinely different sources.'
      : 'The paths selected different records, but the available provenance cannot confirm whether the underlying source differs.';
  }

  return {
    generatedAt: new Date().toISOString(),
    applicationCaseId,
    applicationType: context.applicationType,
    contextSummary: {
      client: `${context.client.first_name} ${context.client.surname}`,
      firearm: context.firearm
        ? [context.firearm.make, context.firearm.model, context.firearm.calibre].filter(Boolean).join(' ')
        : null,
      competencyCategory: context.competency?.category ?? context.applicationCase.competency_category,
      licenceSection: context.licenceSection,
      readinessState: context.readiness?.state ?? null,
      packState: context.packState,
    },
    missingAuthoritativeData: context.missingData,
    candidatesConsidered,
    recommendations,
    sourceScopesSearched: ALL_SOURCE_SCOPES,
    unavailableSourceScopes: context.unavailableSourceScopes,
    noRecommendationReason: recommendations.length === 0
      ? 'No suitable active motivation or supporting source is durably linked to this client, firearm or application history.'
      : null,
    productionComparison: {
      classification,
      newRecommendationId: newRecommendation?.id ?? null,
      currentPathSelectionId: currentReferenceId,
      currentPathSelectionTitle: currentPathSelection?.item.title ?? null,
      sourceEquivalence: sourceComparison.equivalence,
      equivalenceEvidence: sourceComparison.evidence,
      explanation,
    },
    readOnly: true,
  };
}
