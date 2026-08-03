import type {
  AutomaticOperation,
  CandidateConfidence,
  CandidateDocument,
  CandidateScoreBreakdown,
  CandidateScoreFactor,
  CandidateScoreFactorKey,
  IdempotencyKey,
  IntelligenceSourceScope,
  RecommendationExplanation,
} from './types';

export const INTELLIGENCE_SOURCE_HIERARCHY: readonly IntelligenceSourceScope[] = [
  'CLIENT',
  'FIREARM',
  'HISTORICAL_APPLICATION',
  'DEALER_LIBRARY',
  'PUBLIC_LIBRARY',
];

const FACTOR_WEIGHTS: Record<CandidateScoreFactorKey, number> = {
  EXACT_FIREARM: 24,
  EXACT_APPLICATION: 18,
  EXACT_COMPETENCY: 18,
  EXACT_CALIBRE: 18,
  FIREARM_CATEGORY: 9,
  MAKE_MODEL: 10,
  LICENCE_SECTION: 8,
  INTENDED_USE: 8,
  CLIENT_OWNERSHIP: 16,
  HISTORICAL_USE: 8,
  PRIOR_USER_ACCEPTANCE: 6,
  PRIOR_SUBMISSION_OUTCOME: 4,
  DOCUMENT_VERIFICATION: 7,
  LIFECYCLE_STATUS: 8,
  FRESHNESS: 4,
  SOURCE_TRUST: 7,
};

const FACTOR_LABELS: Record<CandidateScoreFactorKey, string> = {
  EXACT_FIREARM: 'Exact firearm match',
  EXACT_APPLICATION: 'Exact application match',
  EXACT_COMPETENCY: 'Exact competency match',
  EXACT_CALIBRE: 'Exact calibre match',
  FIREARM_CATEGORY: 'Firearm category match',
  MAKE_MODEL: 'Make and model match',
  LICENCE_SECTION: 'Licence section match',
  INTENDED_USE: 'Intended-use match',
  CLIENT_OWNERSHIP: 'Client ownership',
  HISTORICAL_USE: 'Historical application use',
  PRIOR_USER_ACCEPTANCE: 'Prior user acceptance',
  PRIOR_SUBMISSION_OUTCOME: 'Prior submission outcome',
  DOCUMENT_VERIFICATION: 'Document verification',
  LIFECYCLE_STATUS: 'Lifecycle status',
  FRESHNESS: 'Freshness',
  SOURCE_TRUST: 'Source trust',
};

function clampSignal(value: number): number {
  return Math.max(-1, Math.min(1, value));
}

export function sourceHierarchyRank(scope: IntelligenceSourceScope): number {
  return INTELLIGENCE_SOURCE_HIERARCHY.indexOf(scope);
}

export function scoreCandidateDocument(candidate: CandidateDocument): CandidateDocument {
  const factors = (Object.keys(FACTOR_WEIGHTS) as CandidateScoreFactorKey[]).map(
    (key): CandidateScoreFactor => {
      const signal = candidate.matchSignals[key];
      const dataAvailable = typeof signal === 'number';
      const value = dataAvailable ? clampSignal(signal) : 0;
      const weight = FACTOR_WEIGHTS[key];
      return {
        key,
        label: FACTOR_LABELS[key],
        weight,
        value,
        contribution: Math.round(weight * value * 100) / 100,
        explanation: dataAvailable
          ? `${FACTOR_LABELS[key]} contributed ${Math.round(weight * value * 100) / 100} points.`
          : `${FACTOR_LABELS[key]} was not scored because the data is unavailable.`,
        dataAvailable,
      };
    }
  );
  const maximumScore = factors.reduce((sum, factor) => sum + factor.weight, 0);
  const rawScore = factors.reduce((sum, factor) => sum + factor.contribution, 0);
  const normalisedScore = Math.max(0, Math.min(100, Math.round((rawScore / maximumScore) * 100)));
  const score: CandidateScoreBreakdown = { factors, rawScore, maximumScore, normalisedScore };
  const available = factors.filter((factor) => factor.dataAvailable);
  const missingData = factors.filter((factor) => !factor.dataAvailable).map((factor) => factor.label);
  const confidenceScore = Math.round((available.length / factors.length) * 100);
  const confidence: CandidateConfidence = {
    level: confidenceScore >= 75 ? 'HIGH' : confidenceScore >= 45 ? 'MEDIUM' : 'LOW',
    score: confidenceScore,
    basis: available.filter((factor) => factor.value > 0).map((factor) => factor.label),
    missingData,
  };
  const explanation: RecommendationExplanation = {
    summary: `${candidate.title} scored ${normalisedScore}/100 from ${candidate.source.scope.toLowerCase().replaceAll('_', ' ')} evidence.`,
    positiveReasons: factors.filter((factor) => factor.contribution > 0).map((factor) => factor.explanation),
    cautions: [
      ...factors.filter((factor) => factor.contribution < 0).map((factor) => factor.explanation),
      ...missingData.map((label) => `${label} is unavailable.`),
    ],
    sourceScope: candidate.source.scope,
    legalReviewRequired: true,
  };
  return { ...candidate, score, confidence, explanation };
}

export function rankCandidateDocuments(candidates: CandidateDocument[]): CandidateDocument[] {
  return candidates
    .map(scoreCandidateDocument)
    .sort((left, right) =>
      (right.score?.normalisedScore ?? 0) - (left.score?.normalisedScore ?? 0)
      || sourceHierarchyRank(left.source.scope) - sourceHierarchyRank(right.source.scope)
      || left.id.localeCompare(right.id)
    );
}

function safeKeyPart(value: string | null): string {
  return (value ?? 'none').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
}

export function buildIdempotencyKey(input: Omit<IdempotencyKey, 'value'>): IdempotencyKey {
  const value = [
    'licenceguard',
    input.operation,
    input.dealerId,
    input.clientId,
    input.applicationCaseId,
    input.subjectType,
    input.subjectId,
    input.renewalWindow,
  ].map((part) => safeKeyPart(part)).join(':');
  return { ...input, value };
}

export function automaticOperationRequiresIdempotency(operation: AutomaticOperation): true {
  void operation;
  return true;
}
